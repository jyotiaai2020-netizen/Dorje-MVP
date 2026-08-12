import uuid
import base64
import json
import logging
import re
import zipfile
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import JSONResponse, Response, StreamingResponse
from sqlalchemy.orm import Session

from app.schemas.dorje_ai import (
    AnalyticsRequest,
    AnalyticsResponse,
    DorjeChatRequest,
    DorjeImagePromptResponse,
    DorjeReportResponse,
    StructuredTable,
    TableConversionRequest,
)
from app.services.document_service import DocumentService
from app.services.report_export_service import DorjeReportExporter
from app.services.image_generation_service import ImageGenerationService
from app.services.image_job_store import ImageJobStore
from app.services.table_export_service import TableExportService
from app.services.speech_transcription_service import SpeechTranscriptionService
from app.services.analytics_service import AnalyticsService, AnalyticsValidationError
from app.orchestration import DorjeOrchestrator
from app.orchestration.models import Intent
from app.core.security import get_current_user
from app.core.config import settings
from app.db.session import SessionLocal, get_db
from app.models.user import User
from app.models.user_setting import UserSetting
from app.services.ceda_service import ceda_service
from app.services.context_os_service import context_os_service
from app.services.workspace_knowledge_service import wkim_service
from app.services.ceda_structured_service import structured_ceda_service
from app.services.tier_policy import TierPolicyEngine
from app.services.upload_policy import upload_policy_engine
from app.services.ceda_memory import ceda_memory_system
from app.services.context_composer import context_composer
from app.services.model_residency import model_residency_manager
from app.services.task_complexity import task_complexity_scorer

router = APIRouter(
    prefix="/dorje-ai",
    tags=["DorjeAI"],
    dependencies=[Depends(get_current_user)],
)

orchestrator = DorjeOrchestrator()
document_service = DocumentService()
report_exporter = DorjeReportExporter()
image_generator = ImageGenerationService()
image_job_store = ImageJobStore()
table_exporter = TableExportService()
speech_transcriber = SpeechTranscriptionService()
analytics_service = AnalyticsService()
tier_policy = TierPolicyEngine()
logger = logging.getLogger(__name__)

LEGACY_DATASET_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
FREE_LARGE_DOCUMENT_CHARS = 25_000
FREE_LARGE_UPLOAD_BYTES = 2 * 1024 * 1024

VALID_DORJE_CHAT_MODES = {
    "fast chat": "Fast Chat",
    "deep analysis": "Deep Analysis",
    "statistics mode": "Statistics Mode",
    "report mode": "Report Mode",
    "social creator": "Social Creator",
    "email assistant": "Email Assistant",
}


def normalize_chat_mode(mode: str | None) -> str:
    normalized = (mode or "Fast Chat").strip().lower().replace("_", " ").replace("-", " ")
    while "  " in normalized:
        normalized = normalized.replace("  ", " ")
    if normalized not in VALID_DORJE_CHAT_MODES:
        allowed = ", ".join(VALID_DORJE_CHAT_MODES.values())
        raise HTTPException(status_code=422, detail=f"Invalid DorjeAI mode '{mode}'. Choose one of: {allowed}.")
    return VALID_DORJE_CHAT_MODES[normalized]


def chat_mode_key(mode: str | None) -> str:
    return normalize_chat_mode(mode).lower().replace(" ", "_")


def is_standalone_deep_tutorial(request: DorjeChatRequest) -> bool:
    return (
        normalize_chat_mode(request.mode) == "Deep Analysis"
        and not request.files
        and orchestrator.router.detect(request.message, []) == Intent.SOFTWARE_TUTORIAL
    )


def dorje_route_trace(
    *,
    request_id: str,
    request: DorjeChatRequest,
    intent: str,
    route: str,
    model: str,
    context_tokens: int,
    output_token_budget: int,
) -> dict[str, object]:
    return {
        "request_id": request_id,
        "conversation_id": request.conversation_id,
        "selected_mode_ui": normalize_chat_mode(request.mode),
        "mode_received_backend": normalize_chat_mode(request.mode),
        "intent_selected": intent,
        "route_selected": route,
        "model": model,
        "context_tokens": context_tokens,
        "output_token_budget": output_token_budget,
    }


def valid_export_chart(asset) -> bool:
    dataset = asset.dataset
    return bool(
        asset.validation_status == "passed" and dataset and dataset.dataset_id
        and not LEGACY_DATASET_UUID.fullmatch(dataset.dataset_id)
        and dataset.locked and dataset.validation_status == "passed"
        and asset.source_row_count == len(asset.exact_source_rows)
        and asset.source_columns and asset.exact_source_rows
    )


def blocked_feature_response(current_user: User, capability: str) -> JSONResponse | None:
    tier = tier_policy.resolve_user_tier(current_user)
    decision = tier_policy.capability_decision(tier, capability)
    if decision["allowed"]:
        return None
    return JSONResponse(status_code=status.HTTP_402_PAYMENT_REQUIRED, content={**decision, "detail": decision["reason"], "message": decision["reason"]})


def user_setting(db: Session, user_id: int) -> UserSetting | None:
    return db.query(UserSetting).filter(UserSetting.user_id == user_id).first()


def user_resource_profile(db: Session, user_id: int) -> str:
    setting = user_setting(db, user_id)
    return str(getattr(setting, "resource_profile", None) or "16gb")


def user_connectivity_mode(db: Session, user_id: int) -> str:
    setting = user_setting(db, user_id)
    return str(getattr(setting, "connectivity_mode", None) or "hybrid")


def user_device_mode(db: Session, user_id: int) -> str:
    setting = user_setting(db, user_id)
    return str(getattr(setting, "device_mode", None) or "desktop")


def image_model_blocked_response(current_user: User, db: Session, image_model: str) -> JSONResponse | None:
    tier = tier_policy.resolve_user_tier(current_user)
    resource_profile = user_resource_profile(db, current_user.id)
    connectivity_mode = user_connectivity_mode(db, current_user.id)
    if model_residency_manager.can_load_model(image_model, tier, resource_profile, connectivity_mode):
        return None
    plan = model_residency_manager.plan(tier, resource_profile, connectivity_mode)
    reason = f"{image_model} is blocked for {resource_profile} {tier.value} users in {connectivity_mode} mode."
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={
            "allowed": False,
            "detail": reason,
            "message": reason,
            "upgrade_required": tier.value == "free",
            "required_tier": "paid" if tier.value == "free" else None,
            "image_model": image_model,
            "model_residency": plan,
        },
    )


def upload_size_bytes(file: UploadFile) -> int:
    explicit_size = getattr(file, "size", None)
    if explicit_size is not None:
        return int(explicit_size or 0)
    try:
        current_position = file.file.tell()
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(current_position)
        return int(size)
    except Exception:
        return 0


def chat_required_capability(request: DorjeChatRequest) -> str:
    if any(file.type == "video/mp4" for file in request.files):
        return "video_analysis"
    if sum(len(file.content or "") for file in request.files) > FREE_LARGE_DOCUMENT_CHARS:
        return "large_documents"
    intent = orchestrator.router.detect(request.message, request.files)
    if intent == Intent.IMAGE:
        return "image_generation"
    if intent in {Intent.REPORT, Intent.PRESENTATION}:
        return "long_reports"
    if request.files:
        return "small_rag"
    return "basic_chat"


def chat_mode_intent(request: DorjeChatRequest) -> str:
    mode_key = chat_mode_key(request.mode)
    if mode_key == "fast_chat":
        detected = orchestrator.router.detect(request.message, request.files)
        return detected.value if detected != Intent.CHAT else chat_required_capability(request)
    return {
        "deep_analysis": "deep_analysis",
        "statistics_mode": "statistics",
        "report_mode": "report",
        "social_creator": "social",
        "email_assistant": "email",
    }[mode_key]


def chat_history_dicts(request: DorjeChatRequest) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for item in request.history[-8:]:
        rows.append({"role": item.role, "content": item.content})
    return rows


def file_excerpts(request: DorjeChatRequest) -> list[str]:
    excerpts: list[str] = []
    for file in request.files:
        content = (file.content or "").strip()
        if content and not file.type.startswith(("image/", "video/", "audio/")):
            excerpts.append(f"{file.name}:\n{content[:4000]}")
    return excerpts


def should_run_ceda_learning(request: DorjeChatRequest, assistant_response: str) -> bool:
    """Avoid storing ordinary chat as memory while still learning useful outcomes."""
    text = f"{request.message} {assistant_response}"
    if request.files:
        return True
    if (request.mode or "").strip().lower().replace("_", " ").replace("-", " ") == "deep analysis":
        return True
    return bool(
        re.search(
            r"\b(remember|always|never|prefer|don\'t|do not remember|forget|save this|correct|instead|accepted|rejected|liked|disliked)\b",
            text,
            re.I,
        )
    )


def persist_ceda_learning_event(
    *,
    user_id: int,
    organization_id: int | None,
    request: DorjeChatRequest,
    assistant_response: str,
    intent: str,
    task_type: str,
    route: str,
) -> None:
    if not assistant_response.strip() or not should_run_ceda_learning(request, assistant_response):
        return
    learning_db = SessionLocal()
    try:
        ceda_memory_system.process_interaction(
            {
                "user_id": user_id,
                "organization_id": organization_id,
                "workspace_id": "dorje_ai",
                "conversation_id": request.conversation_id,
                "message_id": str(uuid.uuid4()),
                "user_message": request.message,
                "assistant_response": assistant_response,
                "intent": intent,
                "task_type": task_type,
                "files_used": [file.name for file in request.files],
                "models_used": [request.model or settings.OLLAMA_CHAT_MODEL],
                "route": route,
            },
            db=learning_db,
            auto_memory_enabled=True,
        )
        learning_db.commit()
    except Exception:
        learning_db.rollback()
        logger.exception("CEDA post-response learning failed for conversation %s", request.conversation_id)
    finally:
        learning_db.close()


@router.get("/orchestration/status")
def orchestration_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tier = tier_policy.resolve_user_tier(current_user)
    resource_profile = user_resource_profile(db, current_user.id)
    connectivity_mode = user_connectivity_mode(db, current_user.id)
    return {
        "enabled": settings.ORCHESTRATOR_ENABLED,
        "engine": "tier-aware hierarchical",
        "routing": "automatic",
        "tier": tier.value,
        "capabilities": tier_policy.get_capabilities(tier),
        "device_profile": {
            "resource_profile": resource_profile,
            "connectivity_mode": connectivity_mode,
        },
        "model_residency": model_residency_manager.plan(tier, resource_profile, connectivity_mode),
        "image_generation": {
            "capability": tier_policy.capability_decision(tier, "image_generation"),
            "runtime": image_generator.status(),
        },
        "pipeline": [
            "InputNormalizer",
            "IntentRouter",
            "TierPolicyEngine",
            "DeviceProfileManager",
            "TaskComplexityScorer",
            "FastPathRouter",
            "ContextBudgetManager",
            "MemoryPolicyEngine",
            "RAG/File Retriever",
            "DeepSeek Planner when needed",
            "Specialist Registry",
            "Targeted Validators",
            "Result Composer",
            "Confirmation-aware UI",
        ],
        "validation_retries": settings.ORCHESTRATOR_MAX_VALIDATION_RETRIES,
        "agents": [
            {"name": item.name.value, "capability": item.capability, "always_resident": item.always_resident, "lazy": item.lazy}
            for item in orchestrator.registry.available()
        ],
    }


@router.get("/image/status")
def image_generation_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tier = tier_policy.resolve_user_tier(current_user)
    resource_profile = user_resource_profile(db, current_user.id)
    connectivity_mode = user_connectivity_mode(db, current_user.id)
    runtime = image_generator.status()
    return {
        "tier": tier.value,
        "capability": tier_policy.capability_decision(tier, "image_generation"),
        "resource_profile": resource_profile,
        "connectivity_mode": connectivity_mode,
        "model_residency": model_residency_manager.plan(tier, resource_profile, connectivity_mode),
        "runtime": runtime,
        "models": {
            key: {
                **value,
                "allowed_by_residency": model_residency_manager.can_load_model(key, tier, resource_profile, connectivity_mode),
            }
            for key, value in dict(runtime["models"]).items()
        },
    }


def run_image_job(job_id: str, enhanced_prompt: str, width: int, height: int, image_model: str) -> None:
    try:
        def update_status(job_status: str) -> None:
            image_job_store.update(job_id, status=job_status)

        image_bytes = image_generator.generate(enhanced_prompt, on_status=update_status, width=width, height=height, model=image_model)
        image_job_store.update(job_id, status="complete", image=image_bytes, prompt=enhanced_prompt)
    except Exception as exc:
        detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
        image_job_store.update(job_id, status="failed", error=detail)




@router.post("/chat")
async def chat(request: DorjeChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    request_id = str(uuid.uuid4())
    normalized_mode = normalize_chat_mode(request.mode)
    request.mode = normalized_mode
    if blocked := blocked_feature_response(current_user, chat_required_capability(request)):
        return blocked
    ceda_service.observe_event(current_user.id, "UserMessageObserved", {"text": request.message}, "dorje_ai_chat")
    scoped_conversation = f"user-{current_user.id}/{request.conversation_id}"
    attachment_folder = document_service._chat_folder(scoped_conversation) / "attachments"
    for file in request.files:
        if not file.stored_name:
            continue
        attachment_path = attachment_folder / document_service._safe_filename(file.stored_name)
        if not attachment_path.is_file():
            continue
        workspace = wkim_service.ensure_managed_workspace(current_user.id, str(document_service.base_dir.resolve()))
        knowledge = wkim_service.catalog_reference(
            current_user.id,
            workspace["workspace_id"],
            str(attachment_path),
            title=file.name,
            summary="Submitted chat attachment. Original browser path is unavailable; source remains user-controlled.",
            metadata={"content_type": file.type, "conversation_id": request.conversation_id, "source_label": file.source_label},
            source_kind="explicit_upload",
        )
        if not knowledge.get("idempotent_replay") and file.content and not file.type.startswith(("image/","video/","audio/")):
            structured_ceda_service.extract(current_user.id,file.content[:50_000],"file_upload",file.name)
    detected_router_intent = orchestrator.router.detect(request.message, request.files)
    intent = chat_mode_intent(request)
    route_selected = "qwen_deep_analysis" if request.mode == "Deep Analysis" else ("statistics_workflow" if intent == "statistics" else "local_model")
    complexity = task_complexity_scorer.classify_request(request.message, request.files)
    tier = tier_policy.resolve_user_tier(current_user)
    device_mode = user_device_mode(db, current_user.id)
    resource_profile = user_resource_profile(db, current_user.id)
    connectivity_mode = user_connectivity_mode(db, current_user.id)
    standalone_tutorial = is_standalone_deep_tutorial(request)
    approved_context = "" if standalone_tutorial else context_os_service.retrieve_for_request(current_user.id, request.message, "dorje_ai")
    composed = context_composer.compose(
        user_id=current_user.id,
        message=request.message,
        workspace_id="dorje_ai",
        intent=detected_router_intent.value if request.mode == "Deep Analysis" else intent,
        tier=tier,
        device_mode=device_mode,
        resource_profile=resource_profile,
        connectivity_mode=connectivity_mode,
        task_complexity=complexity,
        recent_messages=[] if standalone_tutorial else chat_history_dicts(request),
        file_excerpts=[] if standalone_tutorial else file_excerpts(request),
        policy_constraints=[
            "Use approved, active, user-scoped CEDA memory only.",
            "Do not use pending, denied, deleted, superseded, or sensitive memory unless explicitly allowed.",
            "Deep Analysis may use the model's natural reasoning style, but durable learning still passes through CEDA.",
        ],
        include_sensitive=False,
        db=db,
    )
    combined_context = "\n\n".join(
        part.strip()
        for part in [request.context[:3000], approved_context, composed.get("composed_context", "")]
        if part and part.strip()
    )
    model_name = settings.OLLAMA_DEEP_MODEL if request.mode == "Deep Analysis" else (settings.OLLAMA_FAST_MODEL or settings.OLLAMA_CHAT_MODEL)
    output_budget = settings.OLLAMA_DEEP_NUM_PREDICT if request.mode == "Deep Analysis" else settings.OLLAMA_FAST_NUM_PREDICT
    trace = dorje_route_trace(
        request_id=request_id,
        request=request,
        intent=detected_router_intent.value if request.mode == "Deep Analysis" else intent,
        route=route_selected,
        model=model_name,
        context_tokens=max(1, len(combined_context) // 4) if combined_context else 0,
        output_token_budget=output_budget,
    )
    logger.info("dorje_ai_route_trace %s", json.dumps(trace, sort_keys=True))
    user_id = current_user.id
    organization_id = current_user.organization_id

    async def ceda_learning_stream():
        chunks: list[str] = []
        async for chunk in orchestrator.stream(
            message=request.message,
            context=combined_context,
            history=request.history[-6:],
            files=request.files,
            mode=request.mode,
        ):
            chunks.append(chunk)
            yield chunk
        assistant_response = "".join(chunks).strip()
        persist_ceda_learning_event(
            user_id=user_id,
            organization_id=organization_id,
            request=request,
            assistant_response=assistant_response,
            intent=intent,
            task_type=complexity.name.lower(),
            route=route_selected,
        )

    return StreamingResponse(
        ceda_learning_stream(),
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/upload")
def upload_file(file: UploadFile = File(...), conversation_id: str = Form("default"), chat_title: str = Form(""), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if file.content_type == "video/mp4" or Path(file.filename or "").suffix.lower() == ".mp4":
        if blocked := blocked_feature_response(current_user, "video_analysis"):
            return blocked
    if blocked := blocked_feature_response(current_user, "limited_file_uploads"):
        return blocked
    tier = tier_policy.resolve_user_tier(current_user)
    upload_decision = upload_policy_engine.evaluate_upload(
        tier,
        user_resource_profile(db, current_user.id),
        file_size_bytes=upload_size_bytes(file),
        large_document=bool(getattr(file, "size", None) and int(file.size or 0) > FREE_LARGE_UPLOAD_BYTES),
    )
    if not upload_decision["allowed"]:
        upload_status = status.HTTP_402_PAYMENT_REQUIRED if upload_decision.get("upgrade_required") else status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        return JSONResponse(status_code=upload_status, content=upload_decision)
    scoped_conversation = f"user-{current_user.id}/{conversation_id}"
    result = document_service.save_upload(file, scoped_conversation, chat_title)
    result["stored_name"] = result["filename"]
    result["source_label"] = "Uploaded from this device"
    result["staged"] = True
    result["message"] = "File staged. It will enter the knowledge catalog only after the message is submitted."
    return result


@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    suffix = Path(file.filename or "recording.webm").suffix.lower()
    transcript = speech_transcriber.transcribe(await file.read(), suffix)
    return {"transcript": transcript, "model": settings.WHISPER_MODEL}


@router.post("/report", response_model=DorjeReportResponse)
async def generate_report(request: DorjeChatRequest, current_user: User = Depends(get_current_user)):
    if blocked := blocked_feature_response(current_user, "long_reports"):
        return blocked
    result = await orchestrator.execute(
        message=f"Create a consulting-grade report for this request: {request.message}",
        context=request.context,
        history=request.history,
        files=request.files,
    )
    return DorjeReportResponse(report=result.content)


@router.post("/report/pdf")
async def generate_report_pdf(request: DorjeChatRequest, current_user: User = Depends(get_current_user)):
    if blocked := blocked_feature_response(current_user, "long_reports"):
        return blocked
    result = await orchestrator.execute(
        message=f"Create a consulting-grade report for this request: {request.message}",
        context=request.context,
        history=request.history,
        files=request.files,
    )
    pdf_bytes = report_exporter.export_pdf(result.content)
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=dorje-ai-report.pdf"})


@router.post("/chat/pdf")
def export_chat_pdf(request: DorjeChatRequest):
    transcript = "\n\n".join(
        f"## {'You' if item.role == 'user' else 'DorjeAI'}\n{item.content}"
        for item in request.history
        if item.content.strip()
    )
    valid_assets = [asset for asset in request.chart_assets if valid_export_chart(asset)]
    if len(valid_assets) != len(request.chart_assets): transcript += "\n\nChart not exported because chart data did not match the verified source dataset."
    pdf_bytes = report_exporter.export_pdf(transcript or request.message, title="DorjeAI Chat", chart_assets=valid_assets)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=dorje-ai-chat.pdf"},
    )


@router.post("/chat/docx")
def export_chat_docx(request: DorjeChatRequest):
    transcript = "\n\n".join(f"## {'You' if item.role == 'user' else 'DorjeAI'}\n{item.content}" for item in request.history if item.content.strip())
    valid_assets = [asset for asset in request.chart_assets if valid_export_chart(asset)]
    if len(valid_assets) != len(request.chart_assets): transcript += "\n\nChart not exported because chart data did not match the verified source dataset."
    document = report_exporter.export_docx(transcript or request.message, title="DorjeAI Chat", chart_assets=valid_assets)
    return Response(content=document, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers={"Content-Disposition": "attachment; filename=dorje-ai-chat.docx"})


@router.post("/chat/zip")
def export_chat_zip(request: DorjeChatRequest):
    output = BytesIO()
    transcript = "\n\n".join(f"{'YOU' if item.role == 'user' else 'DORJEAI'}\n{item.content}" for item in request.history if item.content.strip())
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("chat.txt", transcript or request.message)
        valid_assets = [asset for asset in request.chart_assets if valid_export_chart(asset)]
        if len(valid_assets) != len(request.chart_assets): archive.writestr("charts/EXPORT_WARNING.txt", "Chart not exported because chart data did not match the verified source dataset.")
        for asset in valid_assets:
            safe_id = "".join(character for character in asset.chart_id if character.isalnum() or character in "-_")
            try: archive.writestr(f"charts/{safe_id}.png", base64.b64decode(asset.image_data_url.split(",", 1)[1]))
            except (ValueError, IndexError): continue
            if asset.dataset:
                csv_rows = [",".join(map(str, asset.dataset.columns)), *[",".join(map(str, row)) for row in asset.dataset.rows]]
                archive.writestr(f"charts/{safe_id}_data.csv", "\n".join(csv_rows))
                archive.writestr(f"charts/{safe_id}_metadata.json", json.dumps({"chart_id": asset.chart_id, "title": asset.title, "dataset_id": asset.dataset.dataset_id, "columns": asset.dataset.columns, "row_count": len(asset.dataset.rows)}, indent=2))
    return Response(content=output.getvalue(), media_type="application/zip", headers={"Content-Disposition": "attachment; filename=dorje-ai-chat-assets.zip"})
@router.post("/table", response_model=StructuredTable)
async def convert_to_table(request: TableConversionRequest):
    return await orchestrator.structure_table(request.content)


@router.post("/analytics/generate", response_model=AnalyticsResponse)
def generate_analytics(request: AnalyticsRequest, current_user: User = Depends(get_current_user)):
    try:
        return analytics_service.generate(request, str(current_user.id))
    except AnalyticsValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/analytics/assets/{user_id}/{conversation_id}/{filename}")
def get_analytics_asset(user_id: str, conversation_id: str, filename: str, current_user: User = Depends(get_current_user)):
    if user_id != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chart asset not found")
    try:
        path = analytics_service.asset_path(user_id, conversation_id, filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chart asset not found") from exc
    media_types = {".png": "image/png", ".svg": "image/svg+xml", ".csv": "text/csv", ".json": "application/json"}
    return Response(content=path.read_bytes(), media_type=media_types.get(path.suffix, "application/octet-stream"), headers={"Content-Disposition": f'attachment; filename="{path.name}"'})


@router.post("/table/xlsx")
def export_table_xlsx(table: StructuredTable):
    workbook = table_exporter.export_xlsx(table)
    return Response(
        content=workbook,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=dorje-ai-table.xlsx"},
    )


@router.post("/table/pdf")
def export_table_pdf(table: StructuredTable):
    document = table_exporter.export_pdf(table)
    return Response(content=document, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=dorje-ai-table.pdf"})


@router.post("/table/png")
def export_table_png(table: StructuredTable):
    image = table_exporter.export_png(table)
    return Response(content=image, media_type="image/png", headers={"Content-Disposition": "attachment; filename=dorje-ai-table.png"})


@router.post("/report/docx")
async def generate_report_docx(request: DorjeChatRequest, current_user: User = Depends(get_current_user)):
    if blocked := blocked_feature_response(current_user, "long_reports"):
        return blocked
    result = await orchestrator.execute(
        message=f"Create a consulting-grade report for this request: {request.message}",
        context=request.context,
        history=request.history,
        files=request.files,
    )
    docx_bytes = report_exporter.export_docx(result.content)
    return Response(content=docx_bytes, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers={"Content-Disposition": "attachment; filename=dorje-ai-report.docx"})


@router.post("/image-prompt", response_model=DorjeImagePromptResponse)
async def generate_image_prompt(request: DorjeChatRequest, current_user: User = Depends(get_current_user)):
    if blocked := blocked_feature_response(current_user, "image_generation"):
        return blocked
    prompt = await orchestrator.optimize_image_prompt(request.message, request.context, request.image_preferences)
    return DorjeImagePromptResponse(prompt=prompt)


@router.post("/image")
async def generate_image(request: DorjeChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if blocked := blocked_feature_response(current_user, "image_generation"):
        return blocked
    if blocked := image_model_blocked_response(current_user, db, request.image_model):
        return blocked
    prompt = await orchestrator.optimize_image_prompt(request.message, request.context, request.image_preferences)
    image_bytes = image_generator.generate(prompt, width=request.image_width, height=request.image_height, model=request.image_model)
    return Response(
        content=image_bytes,
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/image/jobs", status_code=status.HTTP_202_ACCEPTED)
async def create_image_job(
    request: DorjeChatRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if blocked := blocked_feature_response(current_user, "image_generation"):
        return blocked
    if blocked := image_model_blocked_response(current_user, db, request.image_model):
        return blocked
    job_id = str(uuid.uuid4())
    image_job_store.create(job_id, current_user.id)
    enhanced_prompt = await orchestrator.optimize_image_prompt(request.message, request.context, request.image_preferences)
    image_job_store.update(
        job_id,
        original_prompt=request.message,
        enhanced_prompt=enhanced_prompt,
        prompt=enhanced_prompt,
        width=request.image_width,
        height=request.image_height,
        model=request.image_model,
    )
    background_tasks.add_task(
        run_image_job,
        job_id,
        enhanced_prompt,
        request.image_width,
        request.image_height,
        request.image_model,
    )
    return {"job_id": job_id, "status": "queued", "enhanced_prompt": enhanced_prompt, "width": request.image_width, "height": request.image_height, "model": request.image_model}


def get_owned_image_job(job_id: str, user: User) -> dict:
    job = image_job_store.get(job_id)
    if not job or job["user_id"] != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image job not found")
    return job


@router.get("/image/jobs/{job_id}")
def get_image_job(job_id: str, current_user: User = Depends(get_current_user)):
    job = get_owned_image_job(job_id, current_user)
    return {
        "job_id": job_id,
        "status": job["status"],
        "error": job.get("error"),
        "enhanced_prompt": job.get("enhanced_prompt"),
        "width": job.get("width"),
        "height": job.get("height"),
        "model": job.get("model"),
    }


@router.get("/image/jobs/{job_id}/content")
def get_image_job_content(job_id: str, current_user: User = Depends(get_current_user)):
    job = get_owned_image_job(job_id, current_user)
    if job["status"] == "failed":
        raise HTTPException(status_code=422, detail=job["error"])
    if job["status"] != "complete":
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={"status": job["status"]},
        )
    image_bytes = image_job_store.image(job_id)
    if image_bytes is None:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Generated image content is missing")
    image_job_store.update(job_id, downloads=int(job.get("downloads") or 0) + 1)
    return Response(
        content=image_bytes,
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )
