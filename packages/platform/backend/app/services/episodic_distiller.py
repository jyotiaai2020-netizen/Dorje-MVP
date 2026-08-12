from __future__ import annotations

from typing import Any


class EpisodicDistiller:
    def distill(self, event: dict[str, Any]) -> dict[str, Any] | None:
        text = " ".join(str(event.get(key) or "") for key in ["user_message", "assistant_response", "feedback_type", "edited_text"]).lower()
        if not any(term in text for term in ["rejected", "correct", "instead", "prefer", "don't", "disliked", "failed"]):
            return None
        if "evening" in text and "remind" in text:
            content = "User prefers evening reminders unless urgency requires earlier notice."
            lesson = "When scheduling reminders, default to evening for non-urgent tasks."
            linked_skill = "reminder_creation"
        elif "reject" in text or "disliked" in text:
            content = "User rejected or disliked the previous output."
            lesson = "Reduce confidence in the related memory or workflow before reusing it."
            linked_skill = str(event.get("intent") or "general")
        else:
            content = str(event.get("edited_text") or event.get("user_message") or "User corrected the workflow.")[:240]
            lesson = "Apply the user's correction before repeating this workflow."
            linked_skill = str(event.get("intent") or "general")
        return {"category": "correction", "content": content, "lesson": lesson, "linked_skill": linked_skill, "confidence": 0.95}


episodic_distiller = EpisodicDistiller()
