"""Student-LAD knowledge classification without coupling it to WKIM core."""

from __future__ import annotations

import re


class StudentWKIMPlugin:
    name = "student-lad"

    RULES = (
        ("immigration", "i20", r"\bi[-_ ]?20\b"),
        ("immigration", "opt", r"\b(stem[-_ ]?opt|opt|ead|sevis|uscis|visa|passport|cpt)\b"),
        ("career", "resume", r"\b(resume|curriculum vitae|cover[-_ ]?letter|recruiter|portfolio|internship|job[-_ ]?application)\b"),
        ("academic", "assignment", r"\b(assignment|homework|coursework|submission|syllabus)\b"),
        ("academic", "research", r"\b(research|paper|journal|thesis|dissertation|reading)\b"),
        ("academic", "exam", r"\b(exam|quiz|midterm|final)\b"),
    )

    def classify(self, title: str, summary: str = "", metadata: dict | None = None) -> dict:
        haystack = " ".join((title, summary, " ".join(map(str, (metadata or {}).values())))).casefold()
        for domain, kind, pattern in self.RULES:
            if re.search(pattern, haystack, re.I):
                return {"domain": domain, "classification": kind, "plugin": self.name, "confidence": 0.88}
        return {"domain": "knowledge", "classification": "document", "plugin": self.name, "confidence": 0.55}


student_wkim_plugin = StudentWKIMPlugin()
