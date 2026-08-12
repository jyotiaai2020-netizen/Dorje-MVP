from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String

from app.db.database import Base


class OAuthState(Base):
    __tablename__ = "oauth_states"

    id = Column(Integer, primary_key=True)
    state_hash = Column(String(64), nullable=False, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(50), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    consumed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
