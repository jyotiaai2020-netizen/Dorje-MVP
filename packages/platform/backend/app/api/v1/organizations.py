from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.rbac import Role, enforce_organization_access, require_roles
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.organization import Organization
from app.models.user import User
from app.schemas.organization import OrganizationCreate, OrganizationResponse, OrganizationUpdate

router = APIRouter(prefix="/organizations", tags=["Organizations"])


def get_organization_or_404(organization_id: int, db: Session) -> Organization:
    organization = db.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return organization


@router.post("/", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    request: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.SUPER_ADMIN)),
):
    organization = Organization(**request.model_dump())
    db.add(organization)
    db.commit()
    db.refresh(organization)
    return organization


@router.get("/", response_model=list[OrganizationResponse])
def list_organizations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == Role.SUPER_ADMIN.value:
        return db.query(Organization).order_by(Organization.id).all()
    if current_user.organization_id is None:
        return []
    organization = db.get(Organization, current_user.organization_id)
    return [organization] if organization else []


@router.get("/{organization_id}", response_model=OrganizationResponse)
def get_organization(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enforce_organization_access(current_user, organization_id)
    return get_organization_or_404(organization_id, db)


@router.patch("/{organization_id}", response_model=OrganizationResponse)
def update_organization(
    organization_id: int,
    request: OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)),
):
    enforce_organization_access(current_user, organization_id)
    organization = get_organization_or_404(organization_id, db)
    for field, value in request.model_dump(exclude_unset=True).items():
        setattr(organization, field, value)
    db.commit()
    db.refresh(organization)
    return organization


@router.delete("/{organization_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_organization(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.SUPER_ADMIN)),
):
    organization = get_organization_or_404(organization_id, db)
    db.delete(organization)
    db.commit()
