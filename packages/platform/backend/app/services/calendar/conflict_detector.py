from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any


def _parse_datetime(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _event_bounds(event: dict[str, Any]) -> tuple[datetime | None, datetime | None]:
    start = _parse_datetime(event.get("start") or event.get("start_at") or event.get("due_at"))
    end = _parse_datetime(event.get("end") or event.get("end_at"))
    if start and end is None:
        duration_minutes = int(event.get("duration_minutes") or 60)
        end = start + timedelta(minutes=duration_minutes)
    return start, end


class CalendarConflictDetector:
    """Deterministic overlap detection; no model is allowed to decide calendar conflicts."""

    def detect(
        self,
        requested_event: dict[str, Any],
        existing_events: list[dict[str, Any]],
        *,
        travel_buffer_minutes: int = 0,
        preparation_buffer_minutes: int = 0,
    ) -> dict[str, Any]:
        requested_start, requested_end = _event_bounds(requested_event)
        if requested_start is None or requested_end is None:
            return {
                "has_conflict": False,
                "existing_event": None,
                "requested_event": requested_event,
                "severity": "none",
                "alternatives": [],
                "recommendation": "Requested event does not have enough time data for conflict detection.",
            }

        buffer = timedelta(minutes=max(0, travel_buffer_minutes) + max(0, preparation_buffer_minutes))
        buffered_start = requested_start - buffer
        buffered_end = requested_end + buffer

        for existing in existing_events:
            existing_start, existing_end = _event_bounds(existing)
            if existing_start is None or existing_end is None:
                continue
            if buffered_start < existing_end and buffered_end > existing_start:
                return {
                    "has_conflict": True,
                    "existing_event": existing,
                    "requested_event": requested_event,
                    "severity": "hard" if requested_start < existing_end and requested_end > existing_start else "soft",
                    "alternatives": self._alternatives(requested_start, requested_end, existing_end),
                    "recommendation": "Review the overlap before saving. You can keep both, move the requested event, or find the next available time.",
                }

        return {
            "has_conflict": False,
            "existing_event": None,
            "requested_event": requested_event,
            "severity": "none",
            "alternatives": [],
            "recommendation": "No calendar conflict detected.",
        }

    @staticmethod
    def _alternatives(requested_start: datetime, requested_end: datetime, blocked_until: datetime) -> list[dict[str, str]]:
        duration = requested_end - requested_start
        next_start = blocked_until + timedelta(minutes=15)
        return [
            {
                "start": next_start.isoformat(),
                "end": (next_start + duration).isoformat(),
                "reason": "First 15-minute buffer after the conflicting event.",
            }
        ]


calendar_conflict_detector = CalendarConflictDetector()

