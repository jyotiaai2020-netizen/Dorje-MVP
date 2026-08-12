from pathlib import Path
from tempfile import NamedTemporaryFile
import threading
import subprocess

import imageio_ffmpeg
import numpy as np

from fastapi import HTTPException, status

from app.core.config import settings


class SpeechTranscriptionService:
    """Lazy local OpenAI Whisper transcription for DorjeAI voice input."""

    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()

    def _load_model(self):
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model
            try:
                import whisper

                self._model = whisper.load_model(settings.WHISPER_MODEL, device="cpu")
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Whisper Tiny is not installed or its local model is unavailable",
                ) from exc
        return self._model

    def transcribe(self, content: bytes, suffix: str = ".webm") -> str:
        if not content:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The audio recording is empty")
        if len(content) > settings.MAX_AUDIO_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="The audio recording is too large")
        safe_suffix = suffix if suffix in {".webm", ".wav", ".mp3", ".m4a", ".ogg", ".mp4"} else ".webm"
        temporary_path: Path | None = None
        try:
            with NamedTemporaryFile(suffix=safe_suffix, delete=False) as handle:
                handle.write(content)
                temporary_path = Path(handle.name)
            command = [
                imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-threads", "0", "-i", str(temporary_path),
                "-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le", "-ar", "16000", "-",
            ]
            decoded = subprocess.run(command, capture_output=True, check=True, timeout=120).stdout
            audio = np.frombuffer(decoded, np.int16).astype(np.float32) / 32768.0
            result = self._load_model().transcribe(audio, fp16=False)
            transcript = str(result.get("text") or "").strip()
            if not transcript:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No speech was detected")
            return transcript
        finally:
            if temporary_path:
                temporary_path.unlink(missing_ok=True)
