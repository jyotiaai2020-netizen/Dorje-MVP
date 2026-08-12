from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, status

from app.core.config import settings


class TokenEncryptionService:
    """Encrypts OAuth credentials at rest. Plaintext tokens never leave services."""

    def _cipher(self) -> Fernet:
        if not settings.TOKEN_ENCRYPTION_KEY:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OAuth token encryption is not configured",
            )
        try:
            return Fernet(settings.TOKEN_ENCRYPTION_KEY.encode("ascii"))
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OAuth token encryption key is invalid",
            ) from exc

    def encrypt(self, value: str | None) -> str | None:
        return self._cipher().encrypt(value.encode("utf-8")).decode("ascii") if value else None

    def decrypt(self, value: str | None) -> str | None:
        if not value:
            return None
        try:
            return self._cipher().decrypt(value.encode("ascii")).decode("utf-8")
        except InvalidToken as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Stored OAuth credentials could not be decrypted",
            ) from exc
