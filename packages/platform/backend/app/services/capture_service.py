from __future__ import annotations

import base64
import hashlib
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from app.services.ceda_structured_service import structured_ceda_service
from app.services.speech_transcription_service import SpeechTranscriptionService


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class CaptureResult:
    capture_id: str
    mode: str
    source_type: str
    source_title: str
    source_url: str
    summary: str
    word_count: int
    ceda_batch: dict | None
    requires_ceda_review: bool
    created_at: str


class CaptureService:
    """Local-first capture bridge for desktop/browser companion features.

    Raw captured content is used only to produce a summary and CEDA extraction
    batch. Durable memory still requires the existing CEDA review/approval flow.
    """

    def __init__(self, transcriber: SpeechTranscriptionService | None = None) -> None:
        self.transcriber = transcriber or SpeechTranscriptionService()

    def capture_text(
        self,
        user_id: int,
        content: str,
        source_type: str,
        source_title: str = "",
        source_url: str = "",
        capture_mode: str = "selection",
        user_action: str = "summarize",
        requires_ceda_review: bool = True,
    ) -> dict:
        clean = self._clean_text(content)
        summary = self._summarize(clean)
        ceda_batch = None
        if requires_ceda_review and clean:
            reference = self._source_reference(source_title, source_url, capture_mode)
            ceda_batch = structured_ceda_service.extract(user_id, clean, source_type, reference)
        return CaptureResult(
            capture_id=f"CAP-{uuid.uuid4().hex[:12].upper()}",
            mode=capture_mode,
            source_type=source_type,
            source_title=source_title,
            source_url=source_url,
            summary=summary,
            word_count=len(clean.split()),
            ceda_batch=ceda_batch,
            requires_ceda_review=requires_ceda_review,
            created_at=utcnow(),
        ).__dict__ | {"user_action": user_action, "raw_retained": False}

    def capture_screenshot(
        self,
        user_id: int,
        image_data_url: str,
        source_title: str = "Desktop screenshot",
        source_url: str = "",
        notes: str = "",
        requires_ceda_review: bool = True,
    ) -> dict:
        digest = self._image_hash(image_data_url)
        content = self._clean_text(
            f"Screenshot captured: {source_title}\n"
            f"Source URL: {source_url or 'local desktop'}\n"
            f"Image hash: {digest}\n"
            f"User notes: {notes or 'No notes provided.'}"
        )
        result = self.capture_text(
            user_id,
            content,
            "desktop_screenshot",
            source_title,
            source_url,
            "screenshot",
            "send_to_ceda",
            requires_ceda_review,
        )
        result["image_hash"] = digest
        result["image_retained"] = False
        result["message"] = "Screenshot metadata was staged. Visual analysis requires an installed local vision model."
        return result

    def capture_audio_transcript(
        self,
        user_id: int,
        audio_bytes: bytes,
        suffix: str,
        source_title: str = "Webinar audio",
        source_url: str = "",
        requires_ceda_review: bool = True,
    ) -> dict:
        transcript = self.transcriber.transcribe(audio_bytes, suffix)
        result = self.capture_text(
            user_id,
            transcript,
            "desktop_audio_transcript",
            source_title,
            source_url,
            "audio_transcript",
            "summarize",
            requires_ceda_review,
        )
        result["transcript"] = transcript
        return result

    @staticmethod
    def _clean_text(content: str) -> str:
        content = re.sub(r"\s+", " ", content or "").strip()
        return content[:50_000]

    @staticmethod
    def _summarize(content: str) -> str:
        if not content:
            return "No readable content was captured."
        sentences = re.split(r"(?<=[.!?])\s+", content)
        selected = [sentence.strip() for sentence in sentences if sentence.strip()][:5]
        summary = " ".join(selected)
        return summary[:1200] if summary else content[:1200]

    @staticmethod
    def _source_reference(source_title: str, source_url: str, mode: str) -> str:
        parts = [mode]
        if source_title:
            parts.append(source_title)
        if source_url:
            parts.append(source_url)
        return " · ".join(parts)[:1000]

    @staticmethod
    def _image_hash(image_data_url: str) -> str:
        payload = image_data_url.split(",", 1)[-1]
        try:
            data = base64.b64decode(payload, validate=False)
        except Exception:
            data = payload.encode()
        return hashlib.sha256(data).hexdigest()


capture_service = CaptureService()
