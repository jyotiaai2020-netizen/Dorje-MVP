from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.user_connector import UserConnector
from app.schemas.dorje_ai_connectors import (
    ConnectorResponse,
    EmailDraftRequest,
    EmailDraftResponse,
    MediaDraftRequest,
    MediaDraftResponse,
    PlaceholderConnectionResponse,
    SocialDraftRequest,
    SocialDraftResponse,
    WordDocumentRequest,
    WordDocumentResponse,
)
from app.services.dorje_ai_connector_service import DorjeAIConnectorService
from app.services.document_service import DocumentService
from app.services.gmail_connector_service import GmailConnectorService

router = APIRouter(
    prefix="/dorje-ai",
    tags=["DorjeAI Productivity"],
    dependencies=[Depends(get_current_user)],
)
service = DorjeAIConnectorService()
gmail_service = GmailConnectorService()
document_service = DocumentService()

CONNECTORS = {
    "gmail": "Gmail",
    "google-ai-studio": "Google AI Studio",
    "google-sheets": "Google Sheets",
    "google-docs": "Google Docs",
    "google-drive": "Google Drive",
    "google-flow": "Google Flow",
    "google-notebooklm": "NotebookLM",
    "google-gemini": "Gemini",
    "google-calendar": "Google Calendar",
    "google-youtube": "YouTube",
    "google-photos": "Google Photos",
    "outlook": "Outlook",
    "microsoft-login": "Microsoft Login",
    "microsoft-email": "Microsoft Email",
    "microsoft-calendar": "Microsoft Calendar",
    "microsoft-office": "Microsoft Office Suite",
    "microsoft-word": "Microsoft Word",
    "microsoft-excel": "Microsoft Excel",
    "microsoft-365": "Microsoft 365",
    "onedrive": "OneDrive",
    "sharepoint": "SharePoint",
    "apple": "Apple",
    "apple-login": "Apple Login",
    "apple-mail": "Apple Mail / iCloud Mail",
    "apple-calendar": "Apple Calendar / iCloud Calendar",
    "apple-drive": "iCloud Drive",
    "linkedin": "LinkedIn",
    "instagram": "Instagram",
    "facebook": "Facebook",
    "medium": "Medium",
    "chatgpt": "ChatGPT",
    "dropbox": "Dropbox",
    "notion": "Notion",
}


def connector_is_authorized(provider: str, gmail: UserConnector | None) -> bool:
    if gmail is None:
        return False
    scopes = set((gmail.scope or "").split())
    if provider == "google-sheets":
        return "https://www.googleapis.com/auth/spreadsheets" in scopes and "https://www.googleapis.com/auth/drive.readonly" in scopes
    required_scope = {
        "gmail": "https://www.googleapis.com/auth/gmail.send",
        "google-drive": "https://www.googleapis.com/auth/drive.readonly",
        "google-calendar": "https://www.googleapis.com/auth/calendar.events",
        "google-sheets": "https://www.googleapis.com/auth/spreadsheets",
        "google-docs": "https://www.googleapis.com/auth/documents",
        "google-youtube": "https://www.googleapis.com/auth/youtube.readonly",
        "google-photos": "https://www.googleapis.com/auth/photoslibrary.appendonly",
    }.get(provider)
    return bool(required_scope and required_scope in scopes)


@router.get("/connectors", response_model=list[ConnectorResponse])
def list_connectors(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    gmail = gmail_service.connected_connector(current_user, db)
    connected = {provider: gmail_service.connected_connector_for(current_user, db, provider) for provider in CONNECTORS}
    return [ConnectorResponse(
        provider=provider,
        name=name,
        status="connected" if connector_is_authorized(provider, connected.get(provider)) or connector_is_authorized(provider, gmail) else "not_connected",
        account_email=(connected.get(provider) or gmail).provider_account_email if connector_is_authorized(provider, connected.get(provider)) or connector_is_authorized(provider, gmail) else None,
        scopes=(connected.get(provider) or gmail).scope.split() if connector_is_authorized(provider, connected.get(provider)) or connector_is_authorized(provider, gmail) else [],
        connected_at=(connected.get(provider) or gmail).updated_at.isoformat() if connector_is_authorized(provider, connected.get(provider)) or connector_is_authorized(provider, gmail) else None,
    ) for provider, name in CONNECTORS.items()]


@router.post(
    "/connectors/{provider}/connect",
    response_model=PlaceholderConnectionResponse,
)
def connect_placeholder(provider: str):
    if provider == "gmail":
        raise HTTPException(
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
            detail="Use GET /api/v1/connectors/google/gmail/connect for Gmail OAuth",
        )
    name = CONNECTORS.get(provider, provider.replace("-", " ").title())
    return PlaceholderConnectionResponse(
        provider=provider,
        status="not_connected",
        message=f"OAuth connection for {name} is coming soon. No credentials or tokens were stored.",
    )


@router.post("/connectors/{provider}/disconnect", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_placeholder(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(UserConnector).filter(
        UserConnector.user_id == current_user.id,
        UserConnector.provider == provider,
    ).update({
        UserConnector.status: "disconnected",
        UserConnector.access_token_encrypted: None,
        UserConnector.refresh_token_encrypted: None,
    })
    db.commit()
    return None


@router.post("/email/draft", response_model=EmailDraftResponse)
def email_draft(request: EmailDraftRequest):
    return service.email_draft(request)


@router.post("/documents/word", response_model=WordDocumentResponse)
def word_document(request: WordDocumentRequest, current_user: User = Depends(get_current_user)):
    return document_service.create_word_document(
        user_id=current_user.id,
        filename=request.filename,
        title=request.title,
        body=request.body,
        mode=request.mode,
        document_id=request.document_id,
    )


@router.post("/social/draft", response_model=SocialDraftResponse)
def social_draft(request: SocialDraftRequest):
    return service.social_draft(request)


@router.post("/media/image-prompt", response_model=MediaDraftResponse)
def media_image_prompt(request: MediaDraftRequest):
    return MediaDraftResponse(content=service.media_draft("image-prompt", request))


@router.post("/media/carousel", response_model=MediaDraftResponse)
def media_carousel(request: MediaDraftRequest):
    return MediaDraftResponse(content=service.media_draft("carousel", request))


@router.post("/media/video-script", response_model=MediaDraftResponse)
def media_video_script(request: MediaDraftRequest):
    return MediaDraftResponse(content=service.media_draft("video-script", request))


@router.post("/media/captions", response_model=MediaDraftResponse)
def media_captions(request: MediaDraftRequest):
    return MediaDraftResponse(content=service.media_draft("captions", request))
