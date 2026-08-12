from enum import StrEnum

from fastapi import Depends, HTTPException, status

from app.core.security import get_current_user
from app.models.user import User


class Role(StrEnum):
    SUPER_ADMIN = "super_admin"
    ORG_ADMIN = "org_admin"
    CONSULTANT = "consultant"
    CLIENT_USER = "client_user"


def require_roles(*allowed_roles: Role):
    allowed = {role.value for role in allowed_roles}

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return dependency


def can_access_organization(user: User, organization_id: int) -> bool:
    return user.role == Role.SUPER_ADMIN.value or user.organization_id == organization_id


def enforce_organization_access(user: User, organization_id: int) -> None:
    if not can_access_organization(user, organization_id):
        # Avoid confirming that another tenant's resource exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
