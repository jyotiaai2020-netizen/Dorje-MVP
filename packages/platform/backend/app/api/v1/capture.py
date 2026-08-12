from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field

from app.core.security import get_current_user
from app.models.user import User
from app.services.capture_service import capture_service


router = APIRouter(prefix="/capture", tags=["Desktop Capture"])


class TextCaptureRequest(BaseModel):
    content: str = Field(min_length=1, max_length=50_000)
    source_type: str = Field(default="desktop_selection", max_length=100)
    source_title: str = Field(default="", max_length=300)
    source_url: str = Field(default="", max_length=1000)
    capture_mode: str = Field(default="selection", max_length=80)
    user_action: str = Field(default="summarize", max_length=80)
    requires_ceda_review: bool = True


class ScreenshotCaptureRequest(BaseModel):
    image_data_url: str = Field(min_length=20, max_length=15_000_000)
    source_title: str = Field(default="Desktop screenshot", max_length=300)
    source_url: str = Field(default="", max_length=1000)
    notes: str = Field(default="", max_length=5000)
    requires_ceda_review: bool = True


@router.post("/text")
def capture_text(request: TextCaptureRequest, current_user: User = Depends(get_current_user)):
    return capture_service.capture_text(
        current_user.id,
        request.content,
        request.source_type,
        request.source_title,
        request.source_url,
        request.capture_mode,
        request.user_action,
        request.requires_ceda_review,
    )


@router.post("/selection")
def capture_selection(request: TextCaptureRequest, current_user: User = Depends(get_current_user)):
    return capture_service.capture_text(
        current_user.id,
        request.content,
        request.source_type or "desktop_selection",
        request.source_title,
        request.source_url,
        "selection",
        request.user_action,
        request.requires_ceda_review,
    )


@router.post("/page")
def capture_page(request: TextCaptureRequest, current_user: User = Depends(get_current_user)):
    return capture_service.capture_text(
        current_user.id,
        request.content,
        request.source_type or "web_page",
        request.source_title,
        request.source_url,
        "page",
        request.user_action,
        request.requires_ceda_review,
    )


@router.post("/screenshot")
def capture_screenshot(request: ScreenshotCaptureRequest, current_user: User = Depends(get_current_user)):
    return capture_service.capture_screenshot(
        current_user.id,
        request.image_data_url,
        request.source_title,
        request.source_url,
        request.notes,
        request.requires_ceda_review,
    )


@router.post("/audio")
async def capture_audio(
    file: UploadFile = File(...),
    source_title: str = Form("Webinar audio"),
    source_url: str = Form(""),
    requires_ceda_review: bool = Form(True),
    current_user: User = Depends(get_current_user),
):
    suffix = "." + (file.filename or "recording.webm").split(".")[-1].lower()
    return capture_service.capture_audio_transcript(
        current_user.id,
        await file.read(),
        suffix,
        source_title,
        source_url,
        requires_ceda_review,
    )


@router.post("/summary")
def capture_summary(request: TextCaptureRequest, current_user: User = Depends(get_current_user)):
    return capture_service.capture_text(
        current_user.id,
        request.content,
        request.source_type,
        request.source_title,
        request.source_url,
        request.capture_mode,
        "summarize",
        False,
    )


@router.post("/send-to-ceda")
def send_to_ceda(request: TextCaptureRequest, current_user: User = Depends(get_current_user)):
    return capture_service.capture_text(
        current_user.id,
        request.content,
        request.source_type,
        request.source_title,
        request.source_url,
        request.capture_mode,
        "send_to_ceda",
        True,
    )
