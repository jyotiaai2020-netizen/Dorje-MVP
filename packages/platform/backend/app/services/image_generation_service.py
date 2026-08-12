from io import BytesIO
import threading
import gc
import importlib.util
import time
from collections.abc import Callable
from types import MethodType

from PIL import Image
import PIL.PngImagePlugin  # Registers the PNG encoder used by generated PIL images.

from fastapi import HTTPException, status

from app.core.config import settings


Image.init()


class ImageGenerationService:
    """Lazily loads the optional local image model on the first request."""

    def __init__(self) -> None:
        self._pipelines: dict[str, object] = {}
        self._last_used: dict[str, float] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _model_id(model: str) -> str:
        models = {
            "tiny-sd": settings.IMAGE_TEST_MODEL_ID,
            "ssd-1b": settings.IMAGE_MODEL_ID,
        }
        if model not in models:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported image model")
        return models[model]

    def model_id(self, model: str) -> str:
        return self._model_id(model)

    @staticmethod
    def _dependency_available(module_name: str) -> bool:
        return importlib.util.find_spec(module_name) is not None

    @staticmethod
    def _local_diffusers_cache_available(model_id: str) -> bool:
        try:
            from huggingface_hub import try_to_load_from_cache
            return try_to_load_from_cache(model_id, "model_index.json") not in {None, False}
        except Exception:
            return False

    def status(self) -> dict[str, object]:
        dependencies = {
            "torch": self._dependency_available("torch"),
            "diffusers": self._dependency_available("diffusers"),
            "accelerate": self._dependency_available("accelerate"),
            "huggingface_hub": self._dependency_available("huggingface_hub"),
        }
        device = "unavailable"
        try:
            import torch
            if torch.cuda.is_available():
                device = "cuda"
            elif torch.backends.mps.is_available():
                device = "mps"
            else:
                device = "cpu"
        except Exception:
            device = "torch_unavailable"
        models = {}
        for model in ("tiny-sd", "ssd-1b"):
            model_id = self._model_id(model)
            models[model] = {
                "model_id": model_id,
                "locally_cached": self._local_diffusers_cache_available(model_id),
                "loaded": model_id in self._pipelines,
                "last_used": self._last_used.get(model_id),
            }
        return {
            "dependencies": dependencies,
            "ready_dependencies": all(dependencies.values()),
            "device": device,
            "models": models,
            "idle_timeout_seconds": settings.MODEL_IDLE_TIMEOUT_SECONDS,
            "local_files_only": True,
        }

    def _load_pipeline(self, model: str, on_status: Callable[[str], None] | None = None):
        model_id = self._model_id(model)
        if model_id in self._pipelines and time.monotonic() - self._last_used.get(model_id, 0) <= settings.MODEL_IDLE_TIMEOUT_SECONDS:
            return self._pipelines[model_id]
        with self._lock:
            if model_id in self._pipelines and time.monotonic() - self._last_used.get(model_id, 0) <= settings.MODEL_IDLE_TIMEOUT_SECONDS:
                return self._pipelines[model_id]
            try:
                if on_status:
                    on_status("loading_model")
                import torch
                from diffusers import DiffusionPipeline
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Image generation dependencies are not installed. Install diffusers and accelerate.",
                ) from exc

            if torch.cuda.is_available():
                device, dtype = "cuda", torch.float16
            elif torch.backends.mps.is_available():
                device, dtype = "mps", torch.float16
            else:
                device, dtype = "cpu", torch.float32

            try:
                # Keep only one diffusion pipeline resident. This matters on
                # 16 GB Apple Silicon when switching between Tiny-SD and SSD-1B.
                self._pipelines.clear()
                self._last_used.clear()
                gc.collect()
                if torch.backends.mps.is_available():
                    torch.mps.empty_cache()
                pipeline = DiffusionPipeline.from_pretrained(
                    model_id,
                    torch_dtype=dtype,
                    use_safetensors=model != "tiny-sd",
                    local_files_only=True,
                )
                pipeline.to(device)
                # Diffusers < 1.0 still calls its deprecated upcast_vae helper
                # internally. Preserve the same safe float32 VAE behavior using
                # the replacement API recommended by Diffusers.
                if hasattr(pipeline, "upcast_vae"):
                    def upcast_vae(pipe) -> None:
                        pipe.vae.to(dtype=torch.float32)

                    pipeline.upcast_vae = MethodType(upcast_vae, pipeline)
                if device == "cpu":
                    pipeline.enable_attention_slicing()
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Image model {model_id} is not available locally",
                ) from exc
            self._pipelines[model_id] = pipeline
            self._last_used[model_id] = time.monotonic()
            return pipeline

    def generate(
        self,
        prompt: str,
        on_status: Callable[[str], None] | None = None,
        width: int | None = None,
        height: int | None = None,
        model: str = "tiny-sd",
    ) -> bytes:
        pipeline = self._load_pipeline(model, on_status)
        if on_status:
            on_status("generating")
        render_width = max(256, min(1024, (width or settings.IMAGE_SIZE) // 64 * 64))
        render_height = max(256, min(1024, (height or settings.IMAGE_SIZE) // 64 * 64))
        generation_options = {
            "prompt": prompt,
            "negative_prompt": "blurry, low quality, distorted, illegible text",
            "width": render_width,
            "height": render_height,
            "num_inference_steps": 4 if model == "tiny-sd" else settings.IMAGE_INFERENCE_STEPS,
            "guidance_scale": 7.5 if model == "tiny-sd" else 9.0,
        }
        image = pipeline(
            **generation_options,
        ).images[0]
        self._last_used[self._model_id(model)] = time.monotonic()
        output = BytesIO()
        image.save(output, format="PNG")
        output.seek(0)
        return output.getvalue()
