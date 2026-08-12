from datetime import datetime, timedelta, timezone
import hashlib
import logging
import secrets

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token as google_id_token
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rbac import Role
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.db.session import get_db
from app.models.organization import Organization
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, ForgotPasswordRequest, LoginRequest, RegisterRequest, ResetPasswordRequest

router = APIRouter(prefix="/auth", tags=["Authentication"])
GOOGLE_IDENTITY_SCOPES = ("openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile")
logger = logging.getLogger("lotus.auth.google")
_google_auth_sessions: dict[str, tuple[str, datetime]] = {}
_google_completion_sessions: dict[str, tuple[dict, datetime]] = {}
_password_reset_sessions: dict[str, tuple[int, datetime]] = {}


def _state_hash(state: str) -> str:
    return hashlib.sha256(state.encode()).hexdigest()


def _remember_google_auth_session(state: str, code_verifier: str) -> None:
    now = datetime.now(timezone.utc)
    expired = [key for key, (_, expires_at) in _google_auth_sessions.items() if expires_at <= now]
    for key in expired:
        _google_auth_sessions.pop(key, None)
    _google_auth_sessions[_state_hash(state)] = (code_verifier, now + timedelta(minutes=10))


def _consume_google_auth_session(state: str) -> str | None:
    record = _google_auth_sessions.pop(_state_hash(state), None)
    if not record:
        return None
    code_verifier, expires_at = record
    if expires_at <= datetime.now(timezone.utc):
        return None
    return code_verifier


def _remember_google_completion_session(access_token: str, refresh_token: str, user: User) -> str:
    now = datetime.now(timezone.utc)
    expired = [key for key, (_, expires_at) in _google_completion_sessions.items() if expires_at <= now]
    for key in expired:
        _google_completion_sessions.pop(key, None)
    ticket = secrets.token_urlsafe(32)
    _google_completion_sessions[ticket] = ({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user_payload(user),
    }, now + timedelta(minutes=5))
    return ticket


def _consume_google_completion_session(ticket: str) -> dict | None:
    record = _google_completion_sessions.pop(ticket, None)
    if not record:
        return None
    payload, expires_at = record
    if expires_at <= datetime.now(timezone.utc):
        return None
    return payload


def _remember_password_reset_session(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    expired = [token for token, (_, expires_at) in _password_reset_sessions.items() if expires_at <= now]
    for token in expired:
        _password_reset_sessions.pop(token, None)
    token = secrets.token_urlsafe(40)
    _password_reset_sessions[token] = (user_id, now + timedelta(minutes=30))
    return token


def _consume_password_reset_session(token: str) -> int | None:
    record = _password_reset_sessions.pop(token, None)
    if not record:
        return None
    user_id, expires_at = record
    if expires_at <= datetime.now(timezone.utc):
        return None
    return user_id


def google_registration_error(exc: Exception) -> str:
    """Translate Google/OAuth failures without exposing credentials or tokens."""
    error = str(getattr(exc, "error", "") or "").strip()
    description = str(getattr(exc, "description", "") or "").strip()
    combined = f"{error} {description} {exc}".lower()
    if "scope has changed" in combined:
        return "Google returned connector permissions during registration. Start Google sign-in again to use identity permissions only."
    if "invalid_grant" in combined:
        return "Google rejected an expired or already-used sign-in code. Start Google registration again without refreshing the callback page."
    if "redirect_uri_mismatch" in combined or "redirect uri" in combined:
        return f"Google registration redirect URI mismatch. Configure exactly: {settings.GOOGLE_REDIRECT_URI}"
    if "invalid_client" in combined or "unauthorized_client" in combined:
        return "Google rejected the registration client credentials. Check the configured Google client ID and secret."
    if "token used too early" in combined or "token expired" in combined:
        return "Google returned a time-sensitive identity token that could not be verified. Check the computer clock and try again."
    if "id token" in combined:
        return "Google did not return a valid identity token. Start Google registration again."
    if "email" in combined and "verified" in combined:
        return "Google did not provide a verified email address for this account."
    return "Google registration could not verify the account. Start Google sign-in again in a new browser tab."


def user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.full_name,
        "organization_id": user.organization_id,
        "role": user.role,
    }


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    cookie_options = {
        "httponly": True,
        "secure": settings.COOKIE_SECURE,
        "samesite": settings.COOKIE_SAMESITE,
        "path": "/",
    }
    response.set_cookie(
        "lotus_access_token",
        access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **cookie_options,
    )
    response.set_cookie(
        "lotus_refresh_token",
        refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        **cookie_options,
    )


def create_refresh_token(user: User, db: Session) -> str:
    raw_token = secrets.token_urlsafe(48)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
            expires_at=datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    return raw_token


def google_client_config() -> dict:
    missing = [name for name, value in {"GOOGLE_CLIENT_ID": settings.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_SECRET": settings.GOOGLE_CLIENT_SECRET, "GOOGLE_REDIRECT_URI": settings.GOOGLE_REDIRECT_URI}.items() if not value]
    if missing:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Google registration is not configured: {', '.join(missing)}")
    return {"web": {"client_id": settings.GOOGLE_CLIENT_ID, "client_secret": settings.GOOGLE_CLIENT_SECRET, "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token", "redirect_uris": [settings.GOOGLE_REDIRECT_URI]}}


@router.get("/google/start")
def start_google_registration(response: Response):
    state_token = jwt.encode({"purpose": "google_auth", "nonce": secrets.token_urlsafe(24), "exp": datetime.now(timezone.utc) + timedelta(minutes=10)}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    state_value = f"auth.{state_token}"
    code_verifier = secrets.token_urlsafe(72)
    flow = Flow.from_client_config(google_client_config(), scopes=GOOGLE_IDENTITY_SCOPES, state=state_value, code_verifier=code_verifier, autogenerate_code_verifier=False)
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    # Registration is deliberately identity-only. Do not merge previously granted
    # Gmail/Calendar/Drive connector scopes into this token response.
    authorization_url, _ = flow.authorization_url(access_type="online", prompt="select_account")
    _remember_google_auth_session(state_value, code_verifier)
    response.set_cookie("lotus_google_code_verifier", code_verifier, max_age=600, httponly=True, secure=settings.COOKIE_SECURE, samesite="lax", path="/")
    return {"authorization_url": authorization_url}


@router.get("/google/callback")
def complete_google_registration(code: str, state: str, request: Request, db: Session = Depends(get_db)):
    if not state.startswith("auth."):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google registration state is invalid")
    try:
        payload = jwt.decode(state.removeprefix("auth."), settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("purpose") != "google_auth": raise JWTError("Wrong state purpose")
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google registration state is invalid or expired") from exc
    cookie_code_verifier = request.cookies.get("lotus_google_code_verifier")
    code_verifier = cookie_code_verifier or _consume_google_auth_session(state)
    if not code_verifier:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google registration session expired. Start again from the registration page in the same browser tab and use http://127.0.0.1:3100/login.")
    flow = Flow.from_client_config(google_client_config(), scopes=GOOGLE_IDENTITY_SCOPES, state=state, code_verifier=code_verifier, autogenerate_code_verifier=False)
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    try:
        flow.fetch_token(code=code)
        raw_id_token = flow.credentials.id_token
        if not raw_id_token: raise ValueError("Google did not return an ID token")
        profile = google_id_token.verify_oauth2_token(
            raw_id_token,
            GoogleAuthRequest(),
            settings.GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10,
        )
        email = str(profile.get("email") or "").strip().lower()
        full_name = str(profile.get("name") or email.split("@", 1)[0]).strip()
        if not email or profile.get("email_verified") is not True: raise ValueError("Google email is not verified")
    except Exception as exc:
        logger.exception(
            "google_registration_verification_failed error_type=%s oauth_error=%s oauth_description=%s redirect_uri=%s",
            type(exc).__name__,
            getattr(exc, "error", None),
            getattr(exc, "description", None),
            settings.GOOGLE_REDIRECT_URI,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=google_registration_error(exc)) from exc
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        organization = Organization(name=f"{full_name}'s Organization"); db.add(organization); db.flush()
        user = User(email=email, full_name=full_name, password_hash=hash_password(secrets.token_urlsafe(48)), organization_id=organization.id, role=Role.ORG_ADMIN.value)
        db.add(user); db.flush()
    elif user.organization_id is None:
        organization = Organization(name=f"{user.full_name or full_name}'s Organization"); db.add(organization); db.flush()
        user.organization_id = organization.id; user.role = Role.ORG_ADMIN.value; db.flush()
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is inactive")
    access_token = create_access_token({"sub": user.email, "user_id": user.id})
    refresh_token = create_refresh_token(user, db); db.commit()
    completion_ticket = _remember_google_completion_session(access_token, refresh_token, user)
    response = RedirectResponse(f"{settings.APP_URL.rstrip('/')}/auth/google/complete?ticket={completion_ticket}", status_code=status.HTTP_302_FOUND)
    _consume_google_auth_session(state)
    response.delete_cookie("lotus_google_code_verifier", path="/")
    set_auth_cookies(response, access_token, refresh_token)
    return response


@router.post("/google/complete")
def exchange_google_completion_ticket(response: Response, payload: dict = Body(default_factory=dict)):
    ticket = str(payload.get("ticket") or "").strip()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google completion ticket is required")
    session_payload = _consume_google_completion_session(ticket)
    if not session_payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google completion ticket is invalid or expired. Start again from the registration page.")
    set_auth_cookies(response, session_payload["access_token"], session_payload["refresh_token"])
    return {"access_token": session_payload["access_token"], "token_type": "bearer", "user": session_payload["user"]}


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(request: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == request.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    organization = Organization(
        name=request.organization_name or f"{request.full_name}'s Organization",
    )
    db.add(organization)
    db.flush()

    user = User(
        email=request.email,
        full_name=request.full_name,
        password_hash=hash_password(request.password),
        organization_id=organization.id,
        role=Role.ORG_ADMIN.value,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "Registration successful", "user": user_payload(user)}


@router.post("/login")
def login_user(request: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    if not user or not verify_password(request.password, user.password_hash) or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token({"sub": user.email, "user_id": user.id})
    refresh_token = create_refresh_token(user, db)
    db.commit()
    set_auth_cookies(response, access_token, refresh_token)
    return {"access_token": access_token, "token_type": "bearer", "user": user_payload(user)}


@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    response = {
        "message": "If this email belongs to a Student-LAD account, password recovery instructions are available.",
        "delivery": "local_development" if settings.APP_ENV != "production" else "email",
    }
    if not user or not user.is_active:
        return response
    token = _remember_password_reset_session(user.id)
    if settings.APP_ENV != "production":
        response["reset_token"] = token
        response["message"] = "Local recovery token created. Use it to set a new password."
    return response


@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    user_id = _consume_password_reset_session(request.token.strip())
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password reset link is invalid or expired. Start recovery again.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password reset link is invalid or expired. Start recovery again.")
    user.password_hash = hash_password(request.new_password)
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False)).update({"revoked": True}, synchronize_session=False)
    db.commit()
    return {"message": "Password updated. Sign in with your new password."}


@router.post("/change-password")
def change_password(request: ChangePasswordRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user or not verify_password(request.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")
    user.password_hash = hash_password(request.new_password)
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False)).update({"revoked": True}, synchronize_session=False)
    db.commit()
    return {"message": "Password changed. Other sessions were signed out."}


@router.post("/refresh")
def refresh_access_token(request: Request, response: Response, db: Session = Depends(get_db)):
    raw_token = request.cookies.get("lotus_refresh_token")
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token required")

    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    stored_token = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if (
        not stored_token
        or stored_token.revoked
        or stored_token.expires_at <= datetime.utcnow()
        or not stored_token.user.is_active
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    stored_token.revoked = True
    user = stored_token.user
    new_access_token = create_access_token({"sub": user.email, "user_id": user.id})
    new_refresh_token = create_refresh_token(user, db)
    db.commit()
    set_auth_cookies(response, new_access_token, new_refresh_token)
    return {"access_token": new_access_token, "token_type": "bearer", "user": user_payload(user)}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout_user(request: Request, response: Response, db: Session = Depends(get_db)):
    raw_token = request.cookies.get("lotus_refresh_token")
    if raw_token:
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        stored_token = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
        if stored_token:
            stored_token.revoked = True
            db.commit()
    response.delete_cookie("lotus_access_token", path="/")
    response.delete_cookie("lotus_refresh_token", path="/")


@router.get("/me")
def current_user(user: User = Depends(get_current_user)):
    return user_payload(user)
