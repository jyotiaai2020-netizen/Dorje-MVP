from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import get_current_user
from app.models.user import User
from app.services.context_os_service import context_os_service

router = APIRouter(prefix="/context-os", tags=["Context Operating System"])


@router.get("/registry")
def registry(domain: str | None = None, layer: str | None = None, workspace: str | None = None, current_user: User = Depends(get_current_user)):
    return context_os_service.registry(current_user.id, domain, layer, workspace)


@router.get("/search")
def search(query: str = Query(min_length=1, max_length=500), domain: str | None = None, workspace: str | None = None, limit: int = Query(default=20, ge=1, le=100), current_user: User = Depends(get_current_user)):
    return context_os_service.search(current_user.id, query, domain, workspace, limit)


@router.get("/related/{context_id}")
def related(context_id: str, current_user: User = Depends(get_current_user)):
    try:
        return context_os_service.related(current_user.id, context_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/workspaces")
def workspaces(current_user: User = Depends(get_current_user)):
    return context_os_service.workspaces(current_user.id)


@router.get("/health")
def health(current_user: User = Depends(get_current_user)):
    return context_os_service.health(current_user.id)
