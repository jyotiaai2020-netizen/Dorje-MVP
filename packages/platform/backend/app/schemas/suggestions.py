from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.dorje_ai import UploadedFileReference


SuggestionSurface = Literal["dorje_workspace", "kamal_chat"]


class SuggestionGenerateRequest(BaseModel):
    surface: SuggestionSurface
    workspace_id: str = Field(default="default", max_length=120)
    conversation_id: str = Field(default="default", max_length=160)
    current_message: str | None = Field(default=None, max_length=10_000)
    document_ids: list[str] = Field(default_factory=list, max_length=12)
    files: list[UploadedFileReference] = Field(default_factory=list, max_length=8)
    maximum_suggestions: int = Field(default=3, ge=1, le=3)


class SuggestionResponse(BaseModel):
    id: str
    label: str
    editable_instruction: str
    action_type: str
    reason: str
    evidence_refs: list[str]
    confidence: float
    requires_confirmation: bool
    required_connector: str | None = None
    status: str


class SuggestionGenerateResponse(BaseModel):
    greeting: str
    context_summary: str
    suggestions: list[SuggestionResponse]
    policy: dict


class SuggestionEditRequest(BaseModel):
    edited_instruction: str = Field(min_length=1, max_length=5000)


class SuggestionDismissRequest(BaseModel):
    reason: str = Field(default="dismissed_by_user", max_length=300)


class ActionConfirmationResponse(BaseModel):
    action_id: str
    status: str
    preview: dict
    requires_confirmation: bool
    instruction: str | None = None
    draft_metadata: dict = Field(default_factory=dict)


class ActionDecisionResponse(BaseModel):
    action_id: str
    status: str
    outcome: dict
