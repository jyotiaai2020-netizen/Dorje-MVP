from urllib.parse import parse_qs, quote, urlparse
from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.dorje_ai_connectors import (
    ConnectorResponse,
    EmailDocumentRequest,
    EmailDocumentResponse,
    EmailMessageDetail,
    EmailMessageListItem,
    EmailReplyRequest,
    EmailSummaryResponse,
    GmailSendRequest,
    GmailSendResponse,
)
from app.services.document_service import DocumentService
from app.services.gmail_connector_service import GmailConnectorService
from app.api.v1.dorje_ai_connectors import CONNECTORS, connector_is_authorized


router = APIRouter(tags=["Google OAuth Connectors"])
service = GmailConnectorService()
_google_connector_sessions: dict[str, tuple[str, datetime]] = {}


class GoogleDocCreateRequest(BaseModel):
    title: str = "DorjeAI Document"
    body: str = ""


class EmailMessageListResponse(BaseModel):
    provider: str
    account_email: str
    messages: list[EmailMessageListItem]


def _state_hash(state: str) -> str:
    return hashlib.sha256(state.encode()).hexdigest()


def _remember_connector_session(state: str, code_verifier: str) -> None:
    now = datetime.now(timezone.utc)
    expired = [key for key, (_, expires_at) in _google_connector_sessions.items() if expires_at <= now]
    for key in expired:
        _google_connector_sessions.pop(key, None)
    _google_connector_sessions[_state_hash(state)] = (code_verifier, now + timedelta(minutes=10))


def _consume_connector_session(state: str) -> str | None:
    record = _google_connector_sessions.pop(_state_hash(state), None)
    if not record:
        return None
    code_verifier, expires_at = record
    if expires_at <= datetime.now(timezone.utc):
        return None
    return code_verifier


@router.get("/connectors", response_model=list[ConnectorResponse])
def list_connectors(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connected = {
        provider: service.connected_connector_for(current_user, db, provider)
        for provider in CONNECTORS
    }
    # Older Gmail authorization already contains Drive and Calendar scopes.
    gmail = connected.get("gmail")
    return [ConnectorResponse(
        provider=provider,
        name=name,
        status="connected" if connector_is_authorized(provider, connected.get(provider)) or connector_is_authorized(provider, gmail) else "not_connected",
        account_email=(connected.get(provider) or gmail).provider_account_email if connector_is_authorized(provider, connected.get(provider)) or connector_is_authorized(provider, gmail) else None,
        scopes=(connected.get(provider) or gmail).scope.split() if connector_is_authorized(provider, connected.get(provider)) or connector_is_authorized(provider, gmail) else [],
        connected_at=(connected.get(provider) or gmail).updated_at.isoformat() if connector_is_authorized(provider, connected.get(provider)) or connector_is_authorized(provider, gmail) else None,
    ) for provider, name in CONNECTORS.items()]


@router.get("/connectors/google/{provider}/connect")
def connect_google_service(
    provider: str,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    code_verifier = secrets.token_urlsafe(72)
    authorization_url = service.authorization_url(current_user, db, code_verifier, provider)
    state = parse_qs(urlparse(authorization_url).query).get("state", [""])[0]
    if state:
        _remember_connector_session(state, code_verifier)
    response.set_cookie("lotus_gmail_code_verifier", code_verifier, max_age=600, httponly=True, secure=settings.COOKIE_SECURE, samesite="lax", path="/")
    return {"authorization_url": authorization_url, "provider": provider}


@router.get("/oauth/google/callback")
def google_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    destination = f"{settings.APP_URL.rstrip('/')}/dorje-ai/connectors"
    if error:
        return RedirectResponse(f"{destination}?oauth_error={quote(error)}", status_code=status.HTTP_302_FOUND)
    if not code or not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google OAuth callback is incomplete")
    cookie_code_verifier = request.cookies.get("lotus_gmail_code_verifier")
    code_verifier = cookie_code_verifier or _consume_connector_session(state)
    if not code_verifier:
        return RedirectResponse(f"{destination}?oauth_error={quote('Gmail connection session expired. Start again from the Connectors tab in the same browser window.')}" , status_code=status.HTTP_302_FOUND)
    connector = service.complete_authorization(code, state, db, code_verifier)
    response = RedirectResponse(f"{destination}?connected={quote(connector.provider)}", status_code=status.HTTP_302_FOUND)
    response.delete_cookie("lotus_gmail_code_verifier", path="/")
    return response


@router.post("/connectors/gmail/send", response_model=GmailSendResponse)
def send_gmail(
    request: GmailSendRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.send(current_user, request, db)


@router.post("/connectors/gmail/test", response_model=GmailSendResponse)
def test_gmail(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.send_test(current_user, db)


@router.get("/connectors/gmail/messages", response_model=EmailMessageListResponse)
def list_gmail_messages(
    q: str = Query(default="newer_than:30d"),
    max_results: int = Query(default=10, ge=1, le=25),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.list_email_messages(current_user, db, query=q, max_results=max_results)


@router.get("/connectors/gmail/messages/{message_id}", response_model=EmailMessageDetail)
def read_gmail_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.read_email_message(current_user, db, message_id=message_id)


@router.post("/connectors/gmail/messages/{message_id}/summarize", response_model=EmailSummaryResponse)
def summarize_gmail_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.summarize_email_message(current_user, db, message_id=message_id)


@router.post("/connectors/gmail/reply", response_model=GmailSendResponse)
def reply_gmail_message(
    request: EmailReplyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.reply_to_email(current_user, request, db)


@router.post("/connectors/gmail/disconnect", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_gmail(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.disconnect(current_user, db)


@router.post("/connectors/google/{provider}/disconnect", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_google_service(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if provider not in CONNECTORS or (provider != "gmail" and not provider.startswith("google-")):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Google connector is not supported")
    service.disconnect_provider(current_user, db, provider)


@router.get("/connectors/google-drive/files")
def list_google_drive_files(
    folder_id: str = Query(default="root"),
    q: str = Query(default=""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.list_drive_files(current_user, db, folder_id=folder_id, query=q)


@router.post("/connectors/google-drive/files/{file_id}/import")
def import_google_drive_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.import_drive_file(current_user, db, file_id=file_id)


@router.post("/connectors/google-docs/documents")
def create_google_doc(
    request: GoogleDocCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.create_google_doc(current_user, db, title=request.title, body=request.body)


@router.post("/connectors/documents/from-email", response_model=EmailDocumentResponse)
def create_document_from_email_workflow(
    request: EmailDocumentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create an editable document from email content.

    Google Docs is the first real cloud implementation. Local DOCX is available
    as an offline fallback. Microsoft Word/OneDrive/SharePoint and Apple/iCloud
    require their provider OAuth APIs before server-side creation is possible.
    """
    if request.provider == "google-docs":
        if request.mode != "create":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google Docs rewrite/append is not activated yet; create a fresh document or use local DOCX rewrite.")
        return service.create_google_doc(current_user, db, title=request.title, body=request.body)
    if request.provider == "local-docx":
        document = DocumentService().create_word_document(
            user_id=current_user.id,
            filename=f"{request.title or 'dorje-email-document'}.docx",
            title=request.title,
            body=request.body,
            mode=request.mode,
            document_id=request.document_id,
        )
        return {
            "provider": "local-docx",
            "document_id": document["document_id"],
            "title": request.title,
            "web_view_link": "",
            "account_email": None,
            "attachment": {
                "filename": document["filename"],
                "content_type": document["content_type"],
                "data_base64": document["data_base64"],
            },
        }
    if request.provider in {"microsoft-word", "onedrive", "sharepoint", "apple-drive"}:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"{request.provider} document save requires its OAuth/API connector implementation before DorjeAI can write cloud files.",
        )
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported document provider")


@router.get("/connectors/{provider}/files")
def list_google_workspace_files(
    provider: str,
    folder_id: str = Query(default="root"),
    q: str = Query(default=""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if provider not in {"google-docs", "google-sheets"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector file browser is not supported")
    return service.list_drive_files(current_user, db, folder_id=folder_id, query=q, provider=provider)


@router.post("/connectors/{provider}/files/{file_id}/import")
def import_google_workspace_file(
    provider: str,
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if provider not in {"google-docs", "google-sheets"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector file import is not supported")
    return service.import_drive_file(current_user, db, file_id=file_id, provider=provider)
