from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    role = Column(String, nullable=False, default="client_user", index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="users")
    reports = relationship("Report", back_populates="created_by")
    refresh_tokens = relationship(
        "RefreshToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    connectors = relationship("UserConnector", back_populates="user", cascade="all, delete-orphan")
    settings = relationship("UserSetting", back_populates="user", cascade="all, delete-orphan", uselist=False)
    
