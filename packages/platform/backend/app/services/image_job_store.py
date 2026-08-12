from datetime import datetime, timezone
import json
from pathlib import Path
import threading
import uuid

from app.core.config import settings


class ImageJobStore:
    """Small disk-backed job store that survives reloads and works across workers."""

    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = base_dir or Path(settings.GENERATED_DIR or Path(settings.RUNTIME_ROOT) / "generated") / "dorje-ai" / "image-jobs"
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    @staticmethod
    def _safe_job_id(job_id: str) -> str:
        parsed = str(uuid.UUID(job_id))
        if parsed != job_id:
            raise ValueError("Invalid job id")
        return parsed

    def _metadata_path(self, job_id: str) -> Path:
        return self.base_dir / f"{self._safe_job_id(job_id)}.json"

    def _image_path(self, job_id: str) -> Path:
        return self.base_dir / f"{self._safe_job_id(job_id)}.png"

    def create(self, job_id: str, user_id: int) -> dict:
        job = {
            "job_id": job_id,
            "status": "queued",
            "user_id": user_id,
            "error": None,
            "prompt": None,
            "original_prompt": None,
            "enhanced_prompt": None,
            "width": 512,
            "height": 512,
            "downloads": 0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self._write(job_id, job)
        return job

    def update(self, job_id: str, **changes) -> dict | None:
        with self._lock:
            job = self._read_unlocked(job_id)
            if job is None:
                return None
            image = changes.pop("image", None)
            job.update(changes)
            job["updated_at"] = datetime.now(timezone.utc).isoformat()
            if image is not None:
                image_path = self._image_path(job_id)
                temporary_image = image_path.with_suffix(".png.tmp")
                temporary_image.write_bytes(image)
                temporary_image.replace(image_path)
            self._write_unlocked(job_id, job)
            return job.copy()

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._read_unlocked(job_id)
            return job.copy() if job else None

    def image(self, job_id: str) -> bytes | None:
        try:
            path = self._image_path(job_id)
        except ValueError:
            return None
        return path.read_bytes() if path.is_file() else None

    def _write(self, job_id: str, job: dict) -> None:
        with self._lock:
            self._write_unlocked(job_id, job)

    def _write_unlocked(self, job_id: str, job: dict) -> None:
        path = self._metadata_path(job_id)
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(job), encoding="utf-8")
        temporary.replace(path)

    def _read_unlocked(self, job_id: str) -> dict | None:
        try:
            path = self._metadata_path(job_id)
        except ValueError:
            return None
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None
