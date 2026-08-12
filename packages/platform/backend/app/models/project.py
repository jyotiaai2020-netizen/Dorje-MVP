from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.db.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)

    organization_id = Column(
        Integer,
        ForeignKey("organizations.id"),
        nullable=False,
    )
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    status = Column(String, default="Draft")
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship(
        "Organization",
        back_populates="projects",
    )
