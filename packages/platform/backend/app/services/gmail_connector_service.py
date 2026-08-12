from base64 import b64decode, b64encode, urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import parseaddr
import hashlib
import io
import json
import logging
import re
import secrets
from pathlib import Path
from tempfile import NamedTemporaryFile

import httpx
from fastapi import HTTPException, status
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token as google_id_token
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rbac import Role
from app.models.audit_event import AuditEvent
from app.models.oauth_state import OAuthState
from app.models.organization import Organization
from app.models.user import User
from app.models.user_connector import UserConnector
from app.schemas.dorje_ai_connectors import GmailSendRequest
from app.services.document_service import DocumentService
from app.services.token_encryption_service import TokenEncryptionService


GMAIL_SCOPES = (
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/drive.readonly",
)
GOOGLE_CONNECTOR_SCOPES: dict[str, tuple[str, ...]] = {
    "gmail": GMAIL_SCOPES,
    "google-drive": ("openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/drive.readonly"),
    "google-calendar": ("openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/calendar.events"),
    "google-sheets": ("openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"),
    "google-docs": ("openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"),
    "google-youtube": ("openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube.upload"),
    "google-photos": ("openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/photoslibrary.appendonly", "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"),
}
CONNECTOR_LABELS = {
    "google-drive": "Google Drive",
    "google-docs": "Google Docs",
    "google-sheets": "Google Sheets",
}
logger = logging.getLogger("lotus.connectors.google")
GOOGLE_DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder"
GOOGLE_EXPORTS = {
    "application/vnd.google-apps.document": ("text/plain", ".txt"),
    "application/vnd.google-apps.spreadsheet": ("text/csv", ".csv"),
    "application/vnd.google-apps.presentation": ("text/plain", ".txt"),
}
GMAIL_READ_SCOPES = {
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
}


def _decode_google_base64(data: str | None) -> bytes:
    if not data:
        return b""
    padding = "=" * (-len(data) % 4)
    return urlsafe_b64decode(f"{data}{padding}".encode("ascii"))


def _plain_text_from_html(value: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", value or "")
    text = re.sub(r"(?s)<br\s*/?>", "\n", text)
    text = re.sub(r"(?s)</p\s*>", "\n\n", text)
    text = re.sub(r"(?s)<.*?>", " ", text)
    return re.sub(r"[ \t\r\f\v]+", " ", text).strip()


def _summarize_text(value: str, limit: int = 900) -> str:
    cleaned = re.sub(r"\s+", " ", (value or "").strip())
    if not cleaned:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    summary = " ".join(sentence for sentence in sentences[:4] if sentence).strip()
    return (summary or cleaned)[:limit]


def _google_exchange_error(exc: Exception) -> str:
    """Return a useful OAuth error without leaking tokens or client secrets."""
    error = str(getattr(exc, "error", "") or "").strip()
    description = str(getattr(exc, "description", "") or "").strip()
    combined = f"{error} {description} {exc}".lower()
    if "invalid_grant" in combined:
        return "Google rejected the authorization code. Start Connect Gmail again; do not reuse or refresh the callback page."
    if "scope has changed" in combined:
        return "Google returned permissions from an earlier sign-in session. Start Connect Gmail again in a private browser window."
    if "redirect_uri_mismatch" in combined or "redirect uri" in combined:
        return f"Google OAuth redirect URI mismatch. Configure exactly: {settings.GOOGLE_REDIRECT_URI}"
    if "invalid_client" in combined or "unauthorized_client" in combined:
        return "Google rejected the OAuth client credentials. Check the client ID and secret for the selected Google Cloud project."
    if "invalid_scope" in combined:
        return "Google rejected one or more requested Gmail, Calendar, or Drive permissions."
    return "Google OAuth token exchange failed. Start the Gmail connection again and approve the requested permissions."


def _gmail_send_error(exc: Exception) -> tuple[int, str]:
    """Decode Gmail API failures into safe, actionable messages."""
    if not isinstance(exc, HttpError):
        return status.HTTP_502_BAD_GATEWAY, "Gmail could not send the message. Check the backend log for the Google API response."
    http_status = int(getattr(exc.resp, "status", 502) or 502)
    reason = ""
    message = ""
    try:
        payload = json.loads(exc.content.decode("utf-8"))
        error = payload.get("error", {})
        message = str(error.get("message", ""))
        details = error.get("errors") or []
        reason = str(details[0].get("reason", "")) if details else ""
    except (AttributeError, UnicodeDecodeError, json.JSONDecodeError, TypeError):
        pass
    combined = f"{reason} {message}".lower()
    if "accessnotconfigured" in combined or "api has not been used" in combined or "gmail api" in combined and "disabled" in combined:
        return status.HTTP_503_SERVICE_UNAVAILABLE, "Gmail API is not enabled for the Google Cloud project. Enable Gmail API for this OAuth client, wait a minute, then retry."
    if "insufficientpermissions" in combined or "insufficient permission" in combined:
        return status.HTTP_403_FORBIDDEN, "The connected Google account did not grant Gmail send permission. Disconnect Gmail, reconnect it, and approve Gmail access."
    if "failedprecondition" in combined or "mail service not enabled" in combined:
        return status.HTTP_409_CONFLICT, "This Google account does not have an active Gmail mailbox. Open Gmail for the account once, then retry."
    if http_status == 401:
        return status.HTTP_401_UNAUTHORIZED, "Gmail authorization is no longer valid. Disconnect and reconnect Gmail."
    if http_status == 429 or "ratelimit" in combined or "quota" in combined:
        return status.HTTP_429_TOO_MANY_REQUESTS, "Google temporarily rejected the email because of a Gmail quota or rate limit. Try again later."
    if http_status == 403:
        return status.HTTP_403_FORBIDDEN, f"Google denied the Gmail send request{f': {message}' if message else '.'}"
    return status.HTTP_502_BAD_GATEWAY, f"Gmail could not send the message{f': {message}' if message else '.'}"


def _google_drive_error(exc: Exception, action: str) -> tuple[int, str]:
    if not isinstance(exc, HttpError):
        return status.HTTP_502_BAD_GATEWAY, f"Google Drive could not {action}. Check the backend log for the Google API response."
    http_status = int(getattr(exc.resp, "status", 502) or 502)
    reason = ""
    message = ""
    try:
        payload = json.loads(exc.content.decode("utf-8"))
        error = payload.get("error", {})
        message = str(error.get("message", ""))
        details = error.get("errors") or []
        reason = str(details[0].get("reason", "")) if details else ""
    except (AttributeError, UnicodeDecodeError, json.JSONDecodeError, TypeError):
        pass
    combined = f"{reason} {message}".lower()
    if "accessnotconfigured" in combined or "drive api has not been used" in combined or "drive api" in combined and "disabled" in combined:
        return status.HTTP_503_SERVICE_UNAVAILABLE, "Google Drive API is not enabled for Google Cloud project 361010820913. Enable Google Drive API, wait a few minutes, then reconnect Google Drive and try again."
    if "insufficientpermissions" in combined or "insufficient permission" in combined:
        return status.HTTP_403_FORBIDDEN, "The connected Google account did not grant Drive read permission. Disconnect Google Drive, reconnect it, and approve Drive read access."
    if http_status == 401:
        return status.HTTP_401_UNAUTHORIZED, "Google Drive authorization is no longer valid. Disconnect and reconnect Google Drive."
    if http_status == 429 or "ratelimit" in combined or "quota" in combined:
        return status.HTTP_429_TOO_MANY_REQUESTS, "Google Drive temporarily rejected the request because of quota or rate limits. Try again later."
    if http_status == 403:
        return status.HTTP_403_FORBIDDEN, f"Google denied the Drive request{f': {message}' if message else '.'}"
    return status.HTTP_502_BAD_GATEWAY, f"Google Drive could not {action}{f': {message}' if message else '.'}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def as_google_expiry(value: datetime | None) -> datetime | None:
    """google-auth expects a naive UTC expiry with the installed library version."""
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


class GmailConnectorService:
    def __init__(self) -> None:
        self.tokens = TokenEncryptionService()

    @staticmethod
    def _require_configuration() -> None:
        missing = [
            name for name, value in {
                "GOOGLE_CLIENT_ID": settings.GOOGLE_CLIENT_ID,
                "GOOGLE_CLIENT_SECRET": settings.GOOGLE_CLIENT_SECRET,
                "GOOGLE_REDIRECT_URI": settings.GOOGLE_REDIRECT_URI,
                "TOKEN_ENCRYPTION_KEY": settings.TOKEN_ENCRYPTION_KEY,
            }.items() if not value
        ]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Gmail OAuth is not configured: {', '.join(missing)}",
            )

    @staticmethod
    def _client_config() -> dict:
        return {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
            }
        }

    def authorization_url(self, user: User, db: Session, code_verifier: str, provider: str = "gmail") -> str:
        self._require_configuration()
        scopes = GOOGLE_CONNECTOR_SCOPES.get(provider)
        if scopes is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This Google service does not provide a supported DorjeAI OAuth connection")
        if user.organization_id is None:
            organization = Organization(name=f"{user.full_name or user.email}'s Workspace")
            db.add(organization); db.flush()
            user.organization_id = organization.id
            if not user.role: user.role = Role.ORG_ADMIN.value
            db.commit(); db.refresh(user)
        raw_state = secrets.token_urlsafe(48)
        db.add(OAuthState(
            state_hash=hashlib.sha256(raw_state.encode()).hexdigest(),
            user_id=user.id,
            organization_id=user.organization_id,
            provider=f"google:{provider}",
            expires_at=utcnow() + timedelta(minutes=10),
        ))
        db.commit()
        flow = Flow.from_client_config(self._client_config(), scopes=scopes, state=raw_state, code_verifier=code_verifier, autogenerate_code_verifier=False)
        flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
        url, _ = flow.authorization_url(
            access_type="offline",
            prompt="consent select_account",
            login_hint=user.email,
        )
        return url

    def complete_authorization(self, code: str, state_value: str, db: Session, code_verifier: str) -> UserConnector:
        self._require_configuration()
        state_hash = hashlib.sha256(state_value.encode()).hexdigest()
        state_record = db.query(OAuthState).filter(OAuthState.state_hash == state_hash).first()
        if not state_record or state_record.consumed or as_utc(state_record.expires_at) <= utcnow() or not state_record.provider.startswith("google:"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state is invalid or expired")
        provider = state_record.provider.removeprefix("google:")
        scopes = GOOGLE_CONNECTOR_SCOPES.get(provider)
        if scopes is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google connector type is not supported")
        flow = Flow.from_client_config(self._client_config(), scopes=scopes, state=state_value, code_verifier=code_verifier, autogenerate_code_verifier=False)
        flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
        try:
            flow.fetch_token(code=code)
            credentials = flow.credentials
            raw_id_token = credentials.id_token
            if not raw_id_token:
                raise ValueError("Google did not return an ID token for the connected account")
            profile = google_id_token.verify_oauth2_token(
                raw_id_token,
                GoogleAuthRequest(),
                settings.GOOGLE_CLIENT_ID,
                clock_skew_in_seconds=10,
            )
            account_email = str(profile.get("email") or "").strip().lower()
            if not account_email or profile.get("email_verified") is not True:
                raise ValueError("Google connector account email is not verified")
        except Exception as exc:
            logger.exception(
                "gmail_oauth_exchange_failed error_type=%s oauth_error=%s oauth_description=%s redirect_uri=%s",
                type(exc).__name__,
                getattr(exc, "error", None),
                getattr(exc, "description", None),
                settings.GOOGLE_REDIRECT_URI,
            )
            db.rollback()
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=_google_exchange_error(exc)) from exc

        # Consume state only after Google accepts the authorization code. A failed
        # exchange can then be diagnosed without corrupting an otherwise valid state.
        state_record.consumed = True

        connector = (
            db.query(UserConnector)
            .filter(
                UserConnector.user_id == state_record.user_id,
                UserConnector.provider == provider,
                UserConnector.provider_account_email == account_email,
            )
            .first()
        )
        if connector is None:
            connector = UserConnector(
                user_id=state_record.user_id,
                organization_id=state_record.organization_id,
                provider=provider,
                provider_account_email=account_email,
            )
            db.add(connector)
        existing_refresh = self.tokens.decrypt(connector.refresh_token_encrypted)
        refresh_token = credentials.refresh_token or existing_refresh
        if not refresh_token:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google did not return a refresh token; reconnect with consent")
        connector.access_token_encrypted = self.tokens.encrypt(credentials.token)
        connector.refresh_token_encrypted = self.tokens.encrypt(refresh_token)
        connector.scope = " ".join(credentials.granted_scopes or credentials.scopes or scopes)
        connector.token_type = "Bearer"
        connector.expiry_date = as_utc(credentials.expiry)
        connector.status = "connected"
        connector.updated_at = utcnow()
        db.add(AuditEvent(
            user_id=state_record.user_id,
            organization_id=state_record.organization_id,
            action=f"{provider}.connected",
            event_metadata={"account_email": account_email, "provider": provider},
        ))
        db.commit()
        db.refresh(connector)
        return connector

    @staticmethod
    def connected_connector(user: User, db: Session) -> UserConnector | None:
        return GmailConnectorService.connected_connector_for(user, db, "gmail")

    @staticmethod
    def connected_connector_for(user: User, db: Session, provider: str) -> UserConnector | None:
        return (
            db.query(UserConnector)
            .filter(UserConnector.user_id == user.id, UserConnector.provider == provider, UserConnector.status == "connected")
            .order_by(UserConnector.updated_at.desc())
            .first()
        )

    def _credentials(self, connector: UserConnector, db: Session) -> Credentials:
        credentials = Credentials(
            token=self.tokens.decrypt(connector.access_token_encrypted),
            refresh_token=self.tokens.decrypt(connector.refresh_token_encrypted),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
            scopes=connector.scope.split(),
            expiry=as_google_expiry(connector.expiry_date),
        )
        if not credentials.valid:
            try:
                credentials.refresh(GoogleAuthRequest())
            except Exception as exc:
                connector.status = "reauthorization_required"
                db.commit()
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Gmail authorization expired; reconnect Gmail") from exc
            connector.access_token_encrypted = self.tokens.encrypt(credentials.token)
            connector.expiry_date = as_utc(credentials.expiry)
            connector.updated_at = utcnow()
            db.commit()
        return credentials

    @staticmethod
    def _enforce_send_rate(user: User, db: Session) -> None:
        one_minute_ago = utcnow() - timedelta(minutes=1)
        one_day_ago = utcnow() - timedelta(days=1)
        query = db.query(AuditEvent).filter(AuditEvent.user_id == user.id, AuditEvent.action == "gmail.email_sent")
        if query.filter(AuditEvent.created_at >= one_minute_ago).count() >= 10:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Gmail send limit reached; wait one minute")
        if query.filter(AuditEvent.created_at >= one_day_ago).count() >= 100:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Daily Gmail send limit reached")

    def send(self, user: User, request: GmailSendRequest, db: Session) -> dict:
        self._require_configuration()
        connector = self.connected_connector(user, db)
        if not connector:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Connect Gmail before sending email")
        self._enforce_send_rate(user, db)
        credentials = self._credentials(connector, db)
        message = EmailMessage()
        message["To"] = ", ".join(str(item) for item in request.to)
        if request.cc:
            message["Cc"] = ", ".join(str(item) for item in request.cc)
        if request.bcc:
            message["Bcc"] = ", ".join(str(item) for item in request.bcc)
        message["Subject"] = request.subject
        if request.html:
            message.set_content("This message contains HTML content.")
            message.add_alternative(request.body, subtype="html")
        else:
            message.set_content(request.body)
        for attachment in request.attachments:
            try:
                payload = b64decode(attachment.data_base64, validate=True)
            except Exception as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Attachment {attachment.filename} is not valid base64") from exc
            maintype, _, subtype = attachment.content_type.partition("/")
            if not maintype or not subtype:
                maintype, subtype = "application", "octet-stream"
            message.add_attachment(payload, maintype=maintype, subtype=subtype, filename=attachment.filename)
        raw = urlsafe_b64encode(message.as_bytes()).decode("ascii").rstrip("=")
        try:
            result = build("gmail", "v1", credentials=credentials, cache_discovery=False).users().messages().send(
                userId="me", body={"raw": raw}
            ).execute()
        except Exception as exc:
            logger.exception(
                "gmail_send_failed account=%s error_type=%s",
                connector.provider_account_email,
                type(exc).__name__,
            )
            error_status, detail = _gmail_send_error(exc)
            raise HTTPException(status_code=error_status, detail=detail) from exc
        db.add(AuditEvent(
            user_id=user.id,
            organization_id=user.organization_id,
            action="gmail.email_sent",
            event_metadata={"to": [str(item) for item in request.to], "subject": request.subject, "message_id": result.get("id"), "attachments": [item.filename for item in request.attachments]},
        ))
        db.commit()
        return {"success": True, "message_id": result.get("id"), "account_email": connector.provider_account_email}

    def send_test(self, user: User, db: Session) -> dict:
        connector = self.connected_connector(user, db)
        if not connector:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Connect Gmail before sending a test")
        return self.send(user, GmailSendRequest(
            to=[connector.provider_account_email],
            subject="Dorje AI Gmail connection test",
            body="<p>Your Gmail connector is working.</p>",
        ), db)

    def _gmail_read_connector(self, user: User, db: Session) -> UserConnector:
        self._require_configuration()
        connector = self.connected_connector(user, db)
        if not connector:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Connect Gmail before reading email")
        scopes = set((connector.scope or "").split())
        if not scopes.intersection(GMAIL_READ_SCOPES):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reconnect Gmail and approve email read access before summarizing inbox content")
        return connector

    @staticmethod
    def _message_headers(payload: dict) -> dict[str, str]:
        return {str(item.get("name", "")).lower(): str(item.get("value", "")) for item in payload.get("headers", [])}

    def _extract_gmail_payload(self, gmail, message_id: str, payload: dict) -> tuple[str, str, list[dict]]:
        plain_chunks: list[str] = []
        html_chunks: list[str] = []
        attachments: list[dict] = []

        def visit(part: dict) -> None:
            mime_type = str(part.get("mimeType") or "application/octet-stream")
            filename = str(part.get("filename") or "")
            body = part.get("body") or {}
            attachment_id = body.get("attachmentId")
            raw = _decode_google_base64(body.get("data"))
            if attachment_id:
                attachment_response = gmail.users().messages().attachments().get(
                    userId="me",
                    messageId=message_id,
                    id=attachment_id,
                ).execute()
                raw = _decode_google_base64(attachment_response.get("data"))
            if filename:
                preview = ""
                suffix = Path(filename).suffix
                try:
                    if mime_type.startswith("text/") or suffix.lower() in {".txt", ".md", ".csv", ".json"}:
                        preview = raw.decode("utf-8", errors="replace")[:8_000]
                    elif raw:
                        with NamedTemporaryFile(delete=False, suffix=suffix) as temporary:
                            temporary.write(raw)
                            temporary_path = Path(temporary.name)
                        try:
                            preview = DocumentService().extract_text(temporary_path, mime_type)[:8_000]
                        finally:
                            temporary_path.unlink(missing_ok=True)
                except Exception:
                    preview = ""
                attachments.append({
                    "attachment_id": str(attachment_id or body.get("partId") or filename),
                    "filename": filename,
                    "content_type": mime_type,
                    "size": int(body.get("size") or len(raw) or 0),
                    "text_preview": preview,
                    "data_base64": b64encode(raw).decode("ascii") if raw and len(raw) <= 10 * 1024 * 1024 else None,
                })
            elif mime_type == "text/plain" and raw:
                plain_chunks.append(raw.decode("utf-8", errors="replace"))
            elif mime_type == "text/html" and raw:
                html = raw.decode("utf-8", errors="replace")
                html_chunks.append(html)
                if not plain_chunks:
                    plain_chunks.append(_plain_text_from_html(html))
            for child in part.get("parts") or []:
                visit(child)

        visit(payload)
        return "\n\n".join(chunk.strip() for chunk in plain_chunks if chunk.strip())[:50_000], "\n\n".join(html_chunks)[:100_000], attachments

    def list_email_messages(self, user: User, db: Session, query: str = "", max_results: int = 10) -> dict:
        connector = self._gmail_read_connector(user, db)
        credentials = self._credentials(connector, db)
        gmail = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        safe_query = (query or "newer_than:30d").strip()[:240] or "newer_than:30d"
        try:
            response = gmail.users().messages().list(userId="me", q=safe_query, maxResults=max(1, min(max_results, 25))).execute()
            messages = []
            for item in response.get("messages", []):
                detail = gmail.users().messages().get(
                    userId="me",
                    id=item["id"],
                    format="metadata",
                    metadataHeaders=["From", "To", "Cc", "Subject", "Date"],
                ).execute()
                headers = self._message_headers(detail.get("payload") or {})
                messages.append({
                    "provider": "gmail",
                    "message_id": detail.get("id"),
                    "thread_id": detail.get("threadId"),
                    "subject": headers.get("subject", ""),
                    "sender": headers.get("from", ""),
                    "recipients": [headers.get("to", "")] if headers.get("to") else [],
                    "received_at": headers.get("date"),
                    "snippet": detail.get("snippet", ""),
                    "has_attachments": "filename" in json.dumps(detail.get("payload") or {}).lower(),
                })
        except Exception as exc:
            logger.exception("gmail_list_messages_failed account=%s", connector.provider_account_email)
            error_status, detail = _gmail_send_error(exc)
            raise HTTPException(status_code=error_status, detail=detail.replace("send", "read")) from exc
        return {"provider": "gmail", "account_email": connector.provider_account_email, "messages": messages}

    def read_email_message(self, user: User, db: Session, message_id: str) -> dict:
        connector = self._gmail_read_connector(user, db)
        credentials = self._credentials(connector, db)
        gmail = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        try:
            detail = gmail.users().messages().get(userId="me", id=message_id, format="full").execute()
            payload = detail.get("payload") or {}
            headers = self._message_headers(payload)
            body_text, body_html, attachments = self._extract_gmail_payload(gmail, message_id, payload)
        except Exception as exc:
            logger.exception("gmail_read_message_failed account=%s message_id=%s", connector.provider_account_email, message_id)
            error_status, detail_message = _gmail_send_error(exc)
            raise HTTPException(status_code=error_status, detail=detail_message.replace("send", "read")) from exc
        return {
            "provider": "gmail",
            "message_id": detail.get("id"),
            "thread_id": detail.get("threadId"),
            "subject": headers.get("subject", ""),
            "sender": headers.get("from", ""),
            "recipients": [headers.get("to", "")] if headers.get("to") else [],
            "received_at": headers.get("date"),
            "snippet": detail.get("snippet", ""),
            "has_attachments": bool(attachments),
            "body_text": body_text,
            "body_html": body_html,
            "attachments": attachments,
        }

    def summarize_email_message(self, user: User, db: Session, message_id: str) -> dict:
        detail = self.read_email_message(user, db, message_id)
        attachment_summaries = [
            f"{item['filename']}: {_summarize_text(item.get('text_preview', ''), 280) or 'No readable text extracted.'}"
            for item in detail["attachments"]
        ]
        summary = _summarize_text(detail.get("body_text", ""), 900)
        if not summary and attachment_summaries:
            summary = "The email body has little readable text; attachment summaries are available."
        return {
            "provider": "gmail",
            "message_id": message_id,
            "subject": detail.get("subject", ""),
            "sender": detail.get("sender", ""),
            "summary": summary or detail.get("snippet", ""),
            "attachment_summaries": attachment_summaries,
            "suggested_actions": [
                "Create an editable document from this email and attachments.",
                "Draft a reply to the sender.",
                "Save the document to Google Docs or export as DOCX/PDF before sending.",
            ],
        }

    def reply_to_email(self, user: User, request, db: Session) -> dict:
        self._require_configuration()
        connector = self.connected_connector(user, db)
        if not connector:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Connect Gmail before replying to email")
        self._enforce_send_rate(user, db)
        credentials = self._credentials(connector, db)
        gmail = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        original = self.read_email_message(user, db, request.message_id)
        _, sender_email = parseaddr(original.get("sender", ""))
        if not sender_email:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The original sender email address could not be identified")
        subject = request.subject or original.get("subject", "")
        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}".strip()
        message = EmailMessage()
        message["To"] = sender_email
        message["Subject"] = subject or "Re:"
        message.set_content(request.body)
        for attachment in request.attachments:
            payload = b64decode(attachment.data_base64, validate=True)
            maintype, _, subtype = attachment.content_type.partition("/")
            if not maintype or not subtype:
                maintype, subtype = "application", "octet-stream"
            message.add_attachment(payload, maintype=maintype, subtype=subtype, filename=attachment.filename)
        raw = urlsafe_b64encode(message.as_bytes()).decode("ascii").rstrip("=")
        try:
            result = gmail.users().messages().send(
                userId="me",
                body={"raw": raw, "threadId": original.get("thread_id")},
            ).execute()
        except Exception as exc:
            logger.exception("gmail_reply_failed account=%s message_id=%s", connector.provider_account_email, request.message_id)
            error_status, detail = _gmail_send_error(exc)
            raise HTTPException(status_code=error_status, detail=detail) from exc
        db.add(AuditEvent(
            user_id=user.id,
            organization_id=user.organization_id,
            action="gmail.email_replied",
            event_metadata={"source_message_id": request.message_id, "message_id": result.get("id"), "attachments": [item.filename for item in request.attachments]},
        ))
        db.commit()
        return {"success": True, "message_id": result.get("id"), "account_email": connector.provider_account_email}

    def _google_drive_connector(self, user: User, db: Session, provider: str = "google-drive") -> UserConnector:
        self._require_configuration()
        connector = self.connected_connector_for(user, db, provider) or self.connected_connector_for(user, db, "google-drive") or self.connected_connector(user, db)
        if not connector:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Connect {CONNECTOR_LABELS.get(provider, 'Google Drive')} before browsing files")
        scopes = set((connector.scope or "").split())
        if "https://www.googleapis.com/auth/drive.readonly" not in scopes and "https://www.googleapis.com/auth/drive" not in scopes:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Reconnect {CONNECTOR_LABELS.get(provider, 'Google Drive')} and approve Drive read access before browsing files")
        return connector

    def _google_docs_connector(self, user: User, db: Session) -> UserConnector:
        self._require_configuration()
        connector = self.connected_connector_for(user, db, "google-docs")
        if not connector:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Connect Google Docs before creating documents")
        scopes = set((connector.scope or "").split())
        if "https://www.googleapis.com/auth/documents" not in scopes:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reconnect Google Docs and approve document creation access")
        return connector

    def create_google_doc(self, user: User, db: Session, title: str, body: str = "") -> dict:
        connector = self._google_docs_connector(user, db)
        credentials = self._credentials(connector, db)
        docs = build("docs", "v1", credentials=credentials, cache_discovery=False)
        clean_title = (title or "DorjeAI Document").strip()[:120] or "DorjeAI Document"
        try:
            document = docs.documents().create(body={"title": clean_title}).execute()
            document_id = document.get("documentId")
            if body.strip() and document_id:
                docs.documents().batchUpdate(
                    documentId=document_id,
                    body={"requests": [{"insertText": {"location": {"index": 1}, "text": body.strip()[:200_000]}}]},
                ).execute()
        except Exception as exc:
            logger.exception("google_docs_create_failed account=%s", connector.provider_account_email)
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Google Docs could not create the document. Reconnect Google Docs and try again.") from exc
        return {
            "provider": "google-docs",
            "document_id": document_id,
            "title": clean_title,
            "web_view_link": f"https://docs.google.com/document/d/{document_id}/edit" if document_id else "",
            "account_email": connector.provider_account_email,
        }

    def list_drive_files(self, user: User, db: Session, folder_id: str = "root", query: str = "", provider: str = "google-drive") -> dict:
        connector = self._google_drive_connector(user, db, provider)
        credentials = self._credentials(connector, db)
        drive = build("drive", "v3", credentials=credentials, cache_discovery=False)
        folder = (folder_id or "root").strip()
        safe_query = query.strip().replace("'", "\\'")[:120]
        filters = ["trashed = false"]
        if provider == "google-docs":
            filters.append("mimeType = 'application/vnd.google-apps.document'")
        elif provider == "google-sheets":
            filters.append("mimeType = 'application/vnd.google-apps.spreadsheet'")
        if safe_query:
            filters.append(f"name contains '{safe_query}'")
        else:
            filters.append(f"'{folder}' in parents")
        try:
            response = drive.files().list(
                q=" and ".join(filters),
                pageSize=60,
                orderBy="folder,name",
                fields="files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink)",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute()
        except Exception as exc:
            logger.exception("google_drive_list_failed account=%s", connector.provider_account_email)
            error_status, detail = _google_drive_error(exc, "list files")
            raise HTTPException(status_code=error_status, detail=detail) from exc
        return {
            "provider": provider,
            "folder_id": folder,
            "query": safe_query,
            "files": [
                {
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "mime_type": item.get("mimeType"),
                    "is_folder": item.get("mimeType") == GOOGLE_DRIVE_FOLDER_MIME,
                    "size": int(item.get("size") or 0),
                    "modified_time": item.get("modifiedTime"),
                    "web_view_link": item.get("webViewLink"),
                    "icon_link": item.get("iconLink"),
                }
                for item in response.get("files", [])
            ],
        }

    def import_drive_file(self, user: User, db: Session, file_id: str, provider: str = "google-drive") -> dict:
        connector = self._google_drive_connector(user, db, provider)
        credentials = self._credentials(connector, db)
        drive = build("drive", "v3", credentials=credentials, cache_discovery=False)
        try:
            metadata = drive.files().get(
                fileId=file_id,
                fields="id,name,mimeType,size,webViewLink",
                supportsAllDrives=True,
            ).execute()
            mime_type = metadata.get("mimeType") or "application/octet-stream"
            name = metadata.get("name") or "Google Drive file"
            if mime_type == GOOGLE_DRIVE_FOLDER_MIME:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select a file, not a folder")
            export = GOOGLE_EXPORTS.get(mime_type)
            if export:
                content_type, suffix = export
                request = drive.files().export_media(fileId=file_id, mimeType=content_type)
                filename = f"{Path(name).stem}{suffix}"
            else:
                content_type = mime_type
                filename = name
                request = drive.files().get_media(fileId=file_id, supportsAllDrives=True)
            buffer = io.BytesIO()
            downloader = MediaIoBaseDownload(buffer, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            data = buffer.getvalue()
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("google_drive_import_failed account=%s file_id=%s", connector.provider_account_email, file_id)
            error_status, detail = _google_drive_error(exc, "import this file")
            raise HTTPException(status_code=error_status, detail=detail) from exc

        if content_type.startswith("text/") or filename.lower().endswith((".txt", ".md", ".csv", ".json")):
            content = data.decode("utf-8", errors="replace")[:50_000]
        else:
            with NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as temporary:
                temporary.write(data)
                temporary_path = Path(temporary.name)
            try:
                content = DocumentService().extract_text(temporary_path, content_type)
            finally:
                temporary_path.unlink(missing_ok=True)
        if not content.strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="DorjeAI could not extract readable content from this Drive file")
        return {
            "name": filename,
            "type": content_type,
            "content": content,
            "stored_name": f"{provider}:{file_id}",
            "source_label": CONNECTOR_LABELS.get(provider, "Google Drive"),
            "web_view_link": metadata.get("webViewLink"),
        }

    def disconnect(self, user: User, db: Session) -> None:
        self.disconnect_provider(user, db, "gmail")

    def disconnect_provider(self, user: User, db: Session, provider: str) -> None:
        connector = self.connected_connector_for(user, db, provider)
        if not connector:
            return
        revoke_token = self.tokens.decrypt(connector.refresh_token_encrypted) or self.tokens.decrypt(connector.access_token_encrypted)
        if revoke_token:
            try:
                httpx.post("https://oauth2.googleapis.com/revoke", data={"token": revoke_token}, timeout=10).raise_for_status()
            except httpx.HTTPError:
                pass
        connector.status = "disconnected"
        connector.access_token_encrypted = None
        connector.refresh_token_encrypted = None
        connector.updated_at = utcnow()
        db.add(AuditEvent(
            user_id=user.id,
            organization_id=user.organization_id,
            action=f"{provider}.disconnected",
            event_metadata={"account_email": connector.provider_account_email, "provider": provider},
        ))
        db.commit()
