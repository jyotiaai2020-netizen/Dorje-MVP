from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.rbac import Role, enforce_organization_access, require_roles
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["Projects"])


def get_project_or_404(project_id: int, db: Session) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    request: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.CONSULTANT)
    ),
):
    enforce_organization_access(current_user, request.organization_id)
    project = Project(**request.model_dump(), created_by_user_id=current_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/", response_model=list[ProjectResponse])
def list_projects(
    organization_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_organization_id = organization_id or current_user.organization_id
    if target_organization_id is None:
        return []
    enforce_organization_access(current_user, target_organization_id)
    return db.query(Project).filter(Project.organization_id == target_organization_id).all()


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_or_404(project_id, db)
    enforce_organization_access(current_user, project.organization_id)
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    request: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.CONSULTANT)
    ),
):
    project = get_project_or_404(project_id, db)
    enforce_organization_access(current_user, project.organization_id)
    for field, value in request.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)),
):
    project = get_project_or_404(project_id, db)
    enforce_organization_access(current_user, project.organization_id)
    db.delete(project)
    db.commit()
