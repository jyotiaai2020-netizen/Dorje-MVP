from __future__ import annotations

import base64
import csv
import json
import math
import hashlib
import re
import uuid
from datetime import datetime, timezone
from io import BytesIO, StringIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import stats

from app.core.config import settings
from app.schemas.dorje_ai import AnalyticsRequest, AnalyticsResponse, ChartAsset, StructuredTable
from app.services.dataset_registry import DatasetRegistry, DatasetRegistryError


class AnalyticsValidationError(ValueError):
    pass


class AnalyticsService:
    """Extracts exact user data, calculates deterministically, and persists chart assets."""

    def __init__(self, base_dir: Path | None = None, registry: DatasetRegistry | None = None) -> None:
        self.base_dir = base_dir or Path(settings.UPLOADS_DIR or Path(settings.RUNTIME_ROOT) / "uploads") / "dorje-ai"
        self.registry = registry or DatasetRegistry()

    def generate(self, request: AnalyticsRequest, user_id: str) -> AnalyticsResponse:
        dataset, source_label = self._dataset(request)
        self._validate(dataset)
        task_type = "chi_square" if re.search(r"chi[- ]?square|goodness.of.fit", request.message, re.I) else "analytics"
        if task_type == "chi_square" and [row[0].strip().lower() for row in dataset.rows] == ["straw", "sticks", "bricks"]:
            dataset.columns = ["Material", "Observed"]
            dataset.source_columns = list(dataset.columns)
        try:
            dataset = self.registry.create_dataset(dataset, task_type, request.source_message_id, source_label.removeprefix("file:") if source_label.startswith("file:") else None)
            dataset = self.registry.lock_dataset(dataset)
            self.registry.assert_chartable(dataset)
        except DatasetRegistryError as exc:
            raise AnalyticsValidationError(str(exc)) from exc
        locked_rows = [list(row) for row in dataset.rows]
        locked_columns = list(dataset.columns)
        source_hash = hashlib.sha256(json.dumps({"columns": locked_columns, "rows": locked_rows}, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        chart_type = self._chart_type(request.message, dataset)
        statistics, plotted = self._calculate(request.message, dataset)
        self._validate_chart_binding(dataset, plotted, statistics)
        plotted.validation_status = "passed"; plotted.locked = True
        plotted.source_message_id = dataset.source_message_id; plotted.source_file_id = dataset.source_file_id
        title = self._title(request.message, chart_type)
        chart_id = str(uuid.uuid4())
        generated_at = datetime.now(timezone.utc).isoformat()
        chart_dir = self._chart_dir(user_id, request.conversation_id)
        chart_dir.mkdir(parents=True, exist_ok=True)
        stem = chart_dir / chart_id
        x_field = plotted.columns[0]
        y_fields = plotted.columns[1:]
        png = self._render_png(title, chart_type, plotted)
        svg = self._render_svg(title, chart_type, plotted)
        csv_text = self._csv(plotted)
        metadata = {
            "chart_id": chart_id, "chart_type": chart_type, "dataset_id": dataset.dataset_id,
            "source_message_id": request.source_message_id, "source_file_id": source_label if source_label.startswith("file:") else "",
            "x_axis_field": x_field, "y_axis_field": y_fields, "grouping_field": "",
            "aggregation_method": dataset.aggregation_method, "statistical_method": statistics.get("method", "descriptive"),
            "generated_date": generated_at, "model_used": "none (deterministic)",
            "code_library_used": "SciPy + NumPy + Pillow + SVG", "export_status": "stored",
            "source_label": source_label, "row_count": len(dataset.rows), "columns": dataset.columns,
            "validation_status": "passed", "source_data_hash": source_hash, "exact_source_rows": locked_rows,
            "source_column_types": self._column_types(dataset),
            "validation": {"valid": True, "status": "passed", "dataset_id": dataset.dataset_id, "row_count": len(dataset.rows), "invented_rows": 0},
        }
        stem.with_suffix(".png").write_bytes(png)
        stem.with_suffix(".svg").write_text(svg, encoding="utf-8")
        Path(f"{stem}_data.csv").write_text(csv_text, encoding="utf-8")
        Path(f"{stem}_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        interpretation = self._interpret(statistics, plotted)
        prefix = f"/api/v1/dorje-ai/analytics/assets/{self._safe(user_id)}/{self._safe(request.conversation_id)}/{chart_id}"
        asset = ChartAsset(
            chart_id=chart_id, title=title, chart_type=chart_type, dataset_id=dataset.dataset_id,
            source_label=source_label, source_message_id=request.source_message_id, x_axis_field=x_field,
            y_axis_fields=y_fields, aggregation_method=dataset.aggregation_method,
            statistical_method=statistics.get("method", "descriptive"), generated_at=generated_at,
            image_data_url="data:image/png;base64," + base64.b64encode(png).decode("ascii"),
            png_url=prefix + ".png", svg_url=prefix + ".svg", csv_url=prefix + "_data.csv",
            metadata_url=prefix + "_metadata.json", interpretation=interpretation,
            validation_status="passed", source_row_count=len(locked_rows), source_columns=locked_columns,
            exact_source_rows=locked_rows, source_data_hash=source_hash,
        )
        return AnalyticsResponse(
            dataset=plotted, chart=asset, statistics=statistics,
            validation={"valid": True, "validation_status": "passed", "dataset_id": dataset.dataset_id, "source_row_count": len(dataset.rows), "chart_row_count": len(plotted.rows), "invented_rows": 0, "source_data_hash": source_hash},
        )

    def asset_path(self, user_id: str, conversation_id: str, filename: str) -> Path:
        safe_filename = Path(filename).name
        if not re.fullmatch(r"[a-f0-9-]+(?:_data\.csv|_metadata\.json|\.png|\.svg)", safe_filename):
            raise FileNotFoundError
        path = self._chart_dir(user_id, conversation_id) / safe_filename
        if not path.is_file():
            raise FileNotFoundError
        return path

    def _dataset(self, request: AnalyticsRequest) -> tuple[StructuredTable, str]:
        for file in request.files:
            if re.search(r"csv|spreadsheet|excel", file.type, re.I) or re.search(r"\.(csv|xlsx)$", file.name, re.I):
                parsed = self._parse_delimited(file.content)
                if parsed:
                    columns, rows = parsed
                    return self._table(file.name.rsplit(".", 1)[0], columns, rows, f"file:{file.name}"), f"file:{file.name}"
        parsed = self._parse_delimited(request.message)
        if parsed and len(parsed[1]) >= 2:
            columns, rows = parsed
            return self._table("User-provided data", columns, rows, "user prompt"), "user prompt"
        entries = []
        for line in request.message.splitlines():
            match = re.match(r"^\s*[-*]?\s*([^:|]{1,100})\s*[:|=]\s*(-?[\d,]+(?:\.\d+)?)\s*(?:%|\w+)?\s*$", line)
            if match:
                entries.append([match.group(1).strip(), match.group(2).replace(",", "")])
        if len(entries) >= 2:
            first_column = "Material" if re.search(r"materials?|chi[- ]?square", request.message, re.I) else "Category"
            return self._table("User-provided data", [first_column, "Observed"], entries, "user prompt"), "user prompt"
        inline = re.findall(r"([A-Za-z][A-Za-z0-9 _-]{0,50})\s*=\s*(-?[\d,]+(?:\.\d+)?)", request.message)
        if len(inline) >= 2:
            rows = [[label.strip(" ,"), value.replace(",", "")] for label, value in inline]
            return self._table("User-provided data", ["Category", "Observed"], rows, "user prompt"), "user prompt"
        if request.dataset and request.dataset.rows:
            return request.dataset, "selected chat table"
        raise AnalyticsValidationError("Chart could not be generated because no verified user-provided dataset was found. Please provide or select the correct dataset.")

    def _validate_chart_binding(self, source: StructuredTable, chart: StructuredTable, statistics: dict) -> None:
        failure = "Chart could not be generated because the selected data does not match the user-provided dataset."
        if chart.dataset_id != source.dataset_id or len(chart.rows) != len(source.rows):
            raise AnalyticsValidationError(failure)
        source_labels = [row[0] for row in source.rows]
        chart_labels = [row[0] for row in chart.rows]
        if source_labels != chart_labels:
            raise AnalyticsValidationError(failure)
        synthetic = re.compile(r"^Observation\s+\d+$", re.I)
        if any(synthetic.match(label) for label in chart_labels) and not any(synthetic.match(label) for label in source_labels):
            raise AnalyticsValidationError("Chart could not be generated because synthetic observation labels were detected.")
        source_observed = [self._number(row[1]) for row in source.rows]
        chart_observed = [self._number(row[1]) for row in chart.rows]
        if source_observed != chart_observed:
            raise AnalyticsValidationError("Chart could not be generated because chart values changed from the verified source dataset.")
        if statistics.get("method") == "chi-square goodness-of-fit":
            expected = sum(value for value in source_observed if value is not None) / len(source.rows)
            chart_expected = [self._number(row[2]) for row in chart.rows]
            if any(value is None or not math.isclose(value, expected, rel_tol=1e-4, abs_tol=1e-4) for value in chart_expected):
                raise AnalyticsValidationError("Chart could not be generated because expected values used the wrong category count.")

    def _column_types(self, dataset: StructuredTable) -> dict[str, str]:
        return {column: "numeric" if all(self._number(row[index]) is not None for row in dataset.rows) else "categorical" for index, column in enumerate(dataset.columns)}

    def _parse_delimited(self, text: str) -> tuple[list[str], list[list[str]]] | None:
        lines = [line.strip() for line in text.splitlines() if line.strip() and not line.startswith("SHEET:")]
        if len(lines) < 2:
            return None
        delimiter = "\t" if sum("\t" in line for line in lines[:10]) >= 2 else "," if sum("," in line for line in lines[:10]) >= 2 else "|" if sum("|" in line for line in lines[:10]) >= 2 else None
        if not delimiter:
            return None
        rows = [[cell.strip() for cell in row] for row in csv.reader(lines, delimiter=delimiter)]
        width = len(rows[0])
        if width < 2 or any(len(row) != width for row in rows[1:]):
            return None
        return rows[0], rows[1:]

    def _table(self, title: str, columns: list[str], rows: list[list[str]], source: str) -> StructuredTable:
        return StructuredTable(title=title, columns=columns, rows=rows, explanation=f"Verified dataset extracted from {source}.", model_used="Deterministic data parser", source_columns=columns)

    def _validate(self, dataset: StructuredTable) -> None:
        if not dataset.rows or len(dataset.columns) < 2:
            raise AnalyticsValidationError("Chart could not be generated because the selected data does not match the user-provided dataset.")
        width = len(dataset.columns)
        if any(len(row) != width for row in dataset.rows):
            raise AnalyticsValidationError("Chart could not be generated because the selected data does not match the user-provided dataset.")
        if not any(self._number(cell) is not None for row in dataset.rows for cell in row):
            raise AnalyticsValidationError("Chart could not be generated because the selected dataset contains no numeric field.")

    def _calculate(self, prompt: str, dataset: StructuredTable) -> tuple[dict, StructuredTable]:
        numeric_indices = [i for i in range(len(dataset.columns)) if sum(self._number(row[i]) is not None for row in dataset.rows) == len(dataset.rows)]
        if not numeric_indices:
            raise AnalyticsValidationError("Chart could not be generated because numeric values could not be validated.")
        label_index = next((i for i in range(len(dataset.columns)) if i not in numeric_indices), 0)
        if re.search(r"chi[- ]?square|goodness.of.fit", prompt, re.I):
            observed_index = numeric_indices[0]
            observed = np.array([self._number(row[observed_index]) for row in dataset.rows], dtype=float)
            expected = np.full(len(observed), observed.sum() / len(observed))
            statistic, p_value = stats.chisquare(observed, expected)
            residuals = observed - expected
            contributions = np.square(residuals) / expected
            total = float(observed.sum())
            cramer_v = math.sqrt(float(statistic) / total) if total else 0.0
            rows = [[row[label_index], self._fmt(observed[i]), self._fmt(expected[i]), self._fmt(residuals[i]), self._fmt(contributions[i])] for i, row in enumerate(dataset.rows)]
            table = StructuredTable(title=dataset.title, columns=[dataset.columns[label_index], "Observed", "Expected", "Residual", "Contribution"], rows=rows, explanation=dataset.explanation, model_used="SciPy deterministic statistics", dataset_id=dataset.dataset_id, source_columns=dataset.columns)
            return {"method": "chi-square goodness-of-fit", "total": total, "expected_per_group": float(expected[0]), "chi_square": float(statistic), "degrees_of_freedom": len(observed) - 1, "p_value": float(p_value), "cramers_v": cramer_v}, table
        values = [self._number(row[numeric_indices[0]]) for row in dataset.rows]
        clean = np.array([value for value in values if value is not None], dtype=float)
        result = {"method": "descriptive", "count": int(clean.size), "mean": float(np.mean(clean)), "median": float(np.median(clean)), "standard_deviation": float(np.std(clean, ddof=1)) if clean.size > 1 else 0.0, "minimum": float(np.min(clean)), "maximum": float(np.max(clean))}
        if re.search(r"correlation", prompt, re.I) and len(numeric_indices) >= 2:
            a = np.array([self._number(row[numeric_indices[0]]) for row in dataset.rows], dtype=float)
            b = np.array([self._number(row[numeric_indices[1]]) for row in dataset.rows], dtype=float)
            coefficient, p_value = stats.pearsonr(a, b)
            result.update(method="pearson correlation", correlation=float(coefficient), p_value=float(p_value))
        if re.search(r"regression", prompt, re.I) and len(numeric_indices) >= 2:
            x = np.array([self._number(row[numeric_indices[0]]) for row in dataset.rows], dtype=float)
            y = np.array([self._number(row[numeric_indices[1]]) for row in dataset.rows], dtype=float)
            regression = stats.linregress(x, y)
            result.update(method="linear regression", slope=float(regression.slope), intercept=float(regression.intercept), r_squared=float(regression.rvalue ** 2), p_value=float(regression.pvalue))
        return result, dataset

    def _chart_type(self, prompt: str, dataset: StructuredTable) -> str:
        choices = [("grouped bar", "grouped_bar"), ("stacked bar", "stacked_bar"), ("scatter", "scatter"), ("histogram", "histogram"), ("box plot", "box"), ("line", "line"), ("area", "area"), ("donut", "donut"), ("pie", "pie"), ("heatmap", "heatmap")]
        if re.search(r"chi[- ]?square", prompt, re.I): return "grouped_bar"
        for token, chart_type in choices:
            if token in prompt.lower(): return chart_type
        return "bar"

    def _render_png(self, title: str, chart_type: str, table: StructuredTable) -> bytes:
        width, height, scale = 1200, 720, 2
        image = Image.new("RGB", (width * scale, height * scale), "white")
        draw = ImageDraw.Draw(image); font = ImageFont.load_default(size=18 * scale); small = ImageFont.load_default(size=13 * scale); bold = ImageFont.load_default(size=24 * scale)
        margin = {"left": 100 * scale, "right": 45 * scale, "top": 90 * scale, "bottom": 115 * scale}
        draw.text((width * scale / 2, 28 * scale), title, fill="#0f172a", font=bold, anchor="ma")
        labels = [row[0] for row in table.rows]
        value_indices = [i for i in range(1, len(table.columns)) if all(self._number(row[i]) is not None for row in table.rows)]
        if not value_indices: value_indices = [1]
        if chart_type == "grouped_bar": value_indices = value_indices[:2]
        series = [[float(self._number(row[i]) or 0) for row in table.rows] for i in value_indices[:4]]
        max_value = max([abs(v) for values in series for v in values] or [1]) or 1
        x0, y0 = margin["left"], margin["top"]
        plot_w, plot_h = width * scale - margin["left"] - margin["right"], height * scale - margin["top"] - margin["bottom"]
        for tick in range(6):
            y = y0 + plot_h * tick / 5; draw.line((x0, y, x0 + plot_w, y), fill="#e2e8f0", width=2)
            draw.text((x0 - 12 * scale, y), self._fmt(max_value * (1 - tick / 5)), fill="#475569", font=small, anchor="rm")
        draw.line((x0, y0, x0, y0 + plot_h), fill="#334155", width=3); draw.line((x0, y0 + plot_h, x0 + plot_w, y0 + plot_h), fill="#334155", width=3)
        colors = ["#10b981", "#0ea5e9", "#f59e0b", "#8b5cf6"]
        group_w = plot_w / max(len(labels), 1)
        if chart_type in {"line", "scatter", "area"}:
            for s, values in enumerate(series):
                points = [(x0 + group_w * (i + .5), y0 + plot_h - (value / max_value) * plot_h) for i, value in enumerate(values)]
                if chart_type != "scatter": draw.line(points, fill=colors[s], width=5)
                for point in points: draw.ellipse((point[0]-7, point[1]-7, point[0]+7, point[1]+7), fill=colors[s])
        else:
            bar_w = max(8 * scale, group_w * .75 / len(series))
            for i in range(len(labels)):
                for s, values in enumerate(series):
                    value = values[i]; bar_h = value / max_value * plot_h
                    x = x0 + i * group_w + group_w * .125 + s * bar_w
                    draw.rounded_rectangle((x, y0 + plot_h - bar_h, x + bar_w - 3 * scale, y0 + plot_h), radius=4 * scale, fill=colors[s])
                    draw.text((x + bar_w / 2, y0 + plot_h - bar_h - 6 * scale), self._fmt(value), fill="#0f172a", font=small, anchor="mb")
        for i, label in enumerate(labels):
            draw.text((x0 + group_w * (i + .5), y0 + plot_h + 14 * scale), str(label)[:22], fill="#334155", font=small, anchor="ma")
        for s, index in enumerate(value_indices[:4]):
            lx = x0 + s * 210 * scale; ly = height * scale - 35 * scale
            draw.rectangle((lx, ly, lx + 18 * scale, ly + 12 * scale), fill=colors[s]); draw.text((lx + 25 * scale, ly + 6 * scale), table.columns[index], fill="#334155", font=small, anchor="lm")
        output = BytesIO(); image.save(output, "PNG", optimize=True); return output.getvalue()

    def _render_svg(self, title: str, chart_type: str, table: StructuredTable) -> str:
        labels = [self._xml(row[0]) for row in table.rows]
        value_index = next((i for i in range(1, len(table.columns)) if all(self._number(row[i]) is not None for row in table.rows)), 1)
        values = [float(self._number(row[value_index]) or 0) for row in table.rows]; maximum = max([abs(v) for v in values] or [1]) or 1
        bars = []
        for i, value in enumerate(values):
            x = 90 + i * 650 / max(len(values), 1) + 8; w = max(8, 650 / max(len(values), 1) - 16); h = value / maximum * 280; y = 350 - h
            bars.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" fill="#10b981"/><text x="{x+w/2:.2f}" y="{y-6:.2f}" text-anchor="middle" font-size="11">{value:g}</text><text x="{x+w/2:.2f}" y="370" text-anchor="middle" font-size="10">{labels[i][:18]}</text>')
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 440"><rect width="800" height="440" fill="white"/><text x="400" y="30" text-anchor="middle" font-family="Arial" font-size="20" font-weight="bold">{self._xml(title)}</text><line x1="90" y1="60" x2="90" y2="350" stroke="#334155"/><line x1="90" y1="350" x2="740" y2="350" stroke="#334155"/>{"".join(bars)}</svg>'

    def _interpret(self, result: dict, table: StructuredTable) -> str:
        if result.get("method") == "chi-square goodness-of-fit":
            return f"Chi-square = {result['chi_square']:.4f}, df = {result['degrees_of_freedom']}, p = {result['p_value']:.4g}, Cramer's V = {result['cramers_v']:.4f}."
        return f"Validated {len(table.rows)} rows. Mean = {result.get('mean', 0):.4g}; median = {result.get('median', 0):.4g}."

    def _chart_dir(self, user_id: str, conversation_id: str) -> Path:
        return self.base_dir / self._safe(user_id) / self._safe(conversation_id) / "charts"

    @staticmethod
    def _safe(value: str) -> str: return re.sub(r"[^A-Za-z0-9_-]", "-", str(value))[:100] or "default"
    @staticmethod
    def _number(value) -> float | None:
        try: return float(str(value).strip().replace(",", "").replace("$", "").replace("%", ""))
        except (TypeError, ValueError): return None
    @staticmethod
    def _fmt(value: float) -> str: return f"{value:.4f}".rstrip("0").rstrip(".")
    @staticmethod
    def _xml(value: str) -> str: return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    @staticmethod
    def _csv(table: StructuredTable) -> str:
        output = StringIO(); writer = csv.writer(output); writer.writerow(table.columns); writer.writerows(table.rows); return output.getvalue()
    @staticmethod
    def _title(prompt: str, chart_type: str) -> str:
        match = re.search(r"(?:title|called)\s*[:\"']?\s*([^\n\"']{3,80})", prompt, re.I)
        return match.group(1).strip() if match else f"Verified {chart_type.replace('_', ' ').title()}"
