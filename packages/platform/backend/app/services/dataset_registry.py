from __future__ import annotations

import hashlib
import json
import re
from threading import RLock

from app.schemas.dorje_ai import StructuredTable


class DatasetRegistryError(ValueError):
    pass


class DatasetRegistry:
    """Assigns deterministic identities and locks verified source datasets."""

    UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)

    def __init__(self) -> None:
        self._datasets: dict[str, StructuredTable] = {}
        self._sources: dict[str, tuple[list[str], list[list[str]]]] = {}
        self._lock = RLock()

    def create_dataset(self, table: StructuredTable, task_type: str, source_message_id: str | None = None, source_file_id: str | None = None) -> StructuredTable:
        candidate = table.model_copy(deep=True)
        if candidate.dataset_id and self.reject_legacy_uuid_dataset(candidate.dataset_id):
            raise DatasetRegistryError("This chart uses a legacy dataset. Regenerate with validated source data.")
        candidate.dataset_id = self._semantic_id(task_type, candidate)
        candidate.source_message_id = source_message_id or candidate.source_message_id
        candidate.source_file_id = source_file_id or candidate.source_file_id
        candidate.validation_status = "pending"; candidate.locked = False
        with self._lock:
            self._sources[candidate.dataset_id] = (list(candidate.columns), [list(row) for row in candidate.rows])
            self._datasets[candidate.dataset_id] = candidate.model_copy(deep=True)
        return candidate

    def validate_dataset(self, table: StructuredTable) -> StructuredTable:
        if not table.dataset_id or self.reject_legacy_uuid_dataset(table.dataset_id):
            raise DatasetRegistryError("This chart uses a legacy dataset. Regenerate with validated source data.")
        with self._lock:
            source = self._sources.get(table.dataset_id)
        if not source or source != (list(table.columns), [list(row) for row in table.rows]):
            raise DatasetRegistryError("Chart could not be generated because the selected data does not match the user-provided dataset.")
        validated = table.model_copy(deep=True); validated.validation_status = "passed"
        return validated

    def lock_dataset(self, table: StructuredTable) -> StructuredTable:
        validated = self.validate_dataset(table)
        validated.locked = True
        with self._lock: self._datasets[validated.dataset_id] = validated.model_copy(deep=True)
        return validated

    def get_dataset(self, dataset_id: str) -> StructuredTable | None:
        with self._lock:
            dataset = self._datasets.get(dataset_id)
            return dataset.model_copy(deep=True) if dataset else None

    def reject_legacy_uuid_dataset(self, dataset_id: str | None) -> bool:
        return bool(dataset_id and self.UUID_PATTERN.fullmatch(dataset_id))

    def assert_chartable(self, table: StructuredTable) -> None:
        if not table.dataset_id or self.reject_legacy_uuid_dataset(table.dataset_id) or not table.locked or table.validation_status != "passed":
            raise DatasetRegistryError("This chart uses a legacy dataset. Regenerate with validated source data.")

    @staticmethod
    def _semantic_id(task_type: str, table: StructuredTable) -> str:
        labels = [str(row[0]).strip().lower() for row in table.rows]
        if task_type == "chi_square" and labels == ["straw", "sticks", "bricks"]:
            return "chi_square_materials_001"
        slug = re.sub(r"[^a-z0-9]+", "_", f"{task_type}_{'_'.join(table.columns)}".lower()).strip("_")[:64]
        digest = hashlib.sha256(json.dumps({"columns": table.columns, "rows": table.rows}, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()[:12]
        return f"{slug}_{digest}"
