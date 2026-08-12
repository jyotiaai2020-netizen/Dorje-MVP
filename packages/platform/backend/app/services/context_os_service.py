"""Read-oriented Context Operating System.

CEDA is the only durable-context writer. Context OS provides policy-aware registry,
search, ranking, graph, workspace, and health views to orchestrators and agents.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re

from app.services.ceda_service import CEDAService, ceda_service


class ContextOSService:
    def __init__(self, ceda: CEDAService) -> None:
        self.ceda = ceda

    def registry(self, user_id: int, domain: str | None = None, layer: str | None = None, workspace: str | None = None) -> list[dict]:
        items = self.ceda.context_objects(user_id, domain, "active")
        items = [item for item in items if self.ceda.policy_engine.evaluate(user_id, "read_context", domain=item["domain"], workspace=item["workspace"], context_ids=[item["context_id"]], sensitivity=item["sensitivity"], model="local", purpose="Read Context OS registry item")["allowed"]]
        if layer:
            items = [item for item in items if item["layer"] == layer]
        if workspace:
            items = [item for item in items if item["workspace"].casefold() == workspace.casefold()]
        return items

    def search(self, user_id: int, query: str, domain: str | None = None, workspace: str | None = None, limit: int = 20) -> list[dict]:
        terms = set(re.findall(r"[a-z0-9-]+", query.casefold()))
        ranked = []
        for item in self.registry(user_id, domain, workspace=workspace):
            title = item["title"].casefold()
            instruction = str(item["payload"].get("instruction", "")).casefold()
            keywords = {str(value).casefold() for value in item["keywords"]}
            haystack = set(re.findall(r"[a-z0-9-]+", f"{title} {instruction}"))
            overlap = len(terms & haystack)
            score = overlap * 3 + len(terms & keywords) * 2 + item["confidence"] + item["quality_score"]
            if item["context_id"].casefold() in query.casefold():
                score += 100
            if terms and not overlap and not terms.intersection(keywords) and score < 100:
                continue
            ranked.append({**item, "relevance_score": round(score, 3)})
        return sorted(ranked, key=lambda item: (item["relevance_score"], item["updated_at"]), reverse=True)[:max(1, min(limit, 100))]

    def related(self, user_id: int, context_id: str) -> dict:
        root = self.ceda.get_context_object(user_id, context_id)
        related_ids = {edge["target_id"] if edge["source_id"] == context_id else edge["source_id"] for edge in root["relationships"]}
        related = []
        for related_id in related_ids:
            try:
                item = self.ceda.get_context_object(user_id, related_id)
                if item["status"] != "deleted":
                    related.append(item)
            except ValueError:
                continue
        return {"context": root, "related": related}

    def workspaces(self, user_id: int) -> list[dict]:
        groups: dict[str, dict] = {}
        for item in self.registry(user_id):
            group = groups.setdefault(item["workspace"], {"workspace": item["workspace"], "objects": 0, "domains": set(), "average_quality": 0.0, "offline_available": True})
            group["objects"] += 1
            group["domains"].add(item["domain"])
            group["average_quality"] += item["quality_score"]
            group["offline_available"] = group["offline_available"] and item["offline_available"]
        return [{**value, "domains": sorted(value["domains"]), "average_quality": round(value["average_quality"] / value["objects"], 3)} for value in sorted(groups.values(), key=lambda item: item["workspace"])]

    def health(self, user_id: int) -> dict:
        now = datetime.now(timezone.utc)
        stale_before = (now - timedelta(days=180)).isoformat()
        with self.ceda._connect() as db:
            total = db.execute("SELECT COUNT(*) FROM context_objects WHERE user_id=? AND status!='deleted'", (user_id,)).fetchone()[0]
            active = db.execute("SELECT COUNT(*) FROM context_objects WHERE user_id=? AND status='active'", (user_id,)).fetchone()[0]
            duplicate_rows = db.execute("SELECT COALESCE(SUM(amount-1),0) FROM (SELECT COUNT(*) amount FROM context_objects WHERE user_id=? AND status IN ('active','dormant') AND content_hash IS NOT NULL GROUP BY content_hash HAVING COUNT(*)>1)", (user_id,)).fetchone()[0]
            missing_metadata = db.execute("SELECT COUNT(*) FROM context_objects WHERE user_id=? AND status!='deleted' AND (workspace='' OR short_summary IS NULL OR content_hash IS NULL)", (user_id,)).fetchone()[0]
            stale = db.execute("SELECT COUNT(*) FROM context_objects WHERE user_id=? AND status='active' AND updated_at<?", (user_id, stale_before)).fetchone()[0]
            broken_edges = db.execute("""SELECT COUNT(*) FROM context_edges e
                LEFT JOIN context_objects s ON s.id=e.source_id AND s.user_id=e.user_id
                LEFT JOIN context_objects t ON t.id=e.target_id AND t.user_id=e.user_id
                WHERE e.user_id=? AND (s.id IS NULL OR t.id IS NULL OR s.status='deleted' OR t.status='deleted')""", (user_id,)).fetchone()[0]
            relationship_table = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='context_relationships'").fetchone()
            if relationship_table:
                broken_edges += db.execute("""SELECT COUNT(*) FROM context_relationships r
                    LEFT JOIN context_objects s ON s.id=r.source_id AND s.user_id=r.user_id AND r.source_type IN ('context','context_object')
                    LEFT JOIN context_objects t ON t.id=r.target_id AND t.user_id=r.user_id AND r.target_type IN ('context','context_object')
                    WHERE r.user_id=? AND r.status='active' AND (
                        (r.source_type IN ('context','context_object') AND (s.id IS NULL OR s.status='deleted')) OR
                        (r.target_type IN ('context','context_object') AND (t.id IS NULL OR t.status='deleted'))
                    )""", (user_id,)).fetchone()[0]
            average_quality = db.execute("SELECT COALESCE(AVG(quality_score),0) FROM context_objects WHERE user_id=? AND status='active'", (user_id,)).fetchone()[0]
        deductions = duplicate_rows * 8 + missing_metadata * 5 + stale * 2 + broken_edges * 10
        score = max(0, min(100, round((average_quality * 100 if active else 100) - deductions)))
        suggestions = []
        if duplicate_rows: suggestions.append(f"Merge {duplicate_rows} duplicate context object(s).")
        if missing_metadata: suggestions.append(f"Complete metadata for {missing_metadata} context object(s).")
        if stale: suggestions.append(f"Review {stale} context object(s) not updated in 180 days.")
        if broken_edges: suggestions.append(f"Repair {broken_edges} broken graph relationship(s).")
        if not suggestions: suggestions.append("Context library is healthy; no cleanup is currently required.")
        return {"score": score, "total_objects": total, "active_objects": active, "duplicate_objects": duplicate_rows, "missing_metadata": missing_metadata, "stale_objects": stale, "broken_relationships": broken_edges, "average_quality": round(average_quality, 3), "suggestions": suggestions}

    def retrieve_for_request(self, user_id: int, request: str, interface: str) -> str:
        domain = self.ceda.classify(request)
        decision = self.ceda.policy_engine.evaluate(user_id, "send_to_model", domain=domain, workspace=domain.title(), model="local", purpose=f"Provide relevant Context OS instructions to {interface}")
        if not decision["allowed"]:
            return f"PIE BLOCKED CONTEXT: {decision['explanation']}"
        return self.ceda.context_for_request(user_id, request, interface)


context_os_service = ContextOSService(ceda_service)
