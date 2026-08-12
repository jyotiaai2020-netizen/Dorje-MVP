from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.security import get_current_user
from app.models.user import User
from app.models.user_connector import UserConnector
from app.db.session import get_db
from sqlalchemy.orm import Session
from app.services.workspace_knowledge_service import WKIMError, wkim_service

router = APIRouter(prefix="/wkim", tags=["Workspace & Knowledge Infrastructure"])


class WorkspaceRegistration(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    location: str = Field(min_length=1, max_length=2000)
    storage_type: str = "local"
    category: str = "personal"
    sync_mode: str = "local_only"
    permission_level: str = "read_only"
    policy_binding: str = "PIE-WORKSPACE-DEFAULT"
    watcher_enabled: bool = False


class DocumentReference(BaseModel):
    workspace_id: str
    physical_location: str = Field(min_length=1, max_length=4000)
    title: str | None = Field(default=None, max_length=240)
    summary: str = Field(default="", max_length=2000)
    metadata: dict[str, Any] = Field(default_factory=dict)
    security_classification: str = "private"


class WatcherEvent(BaseModel):
    event_type: str
    physical_location: str = Field(min_length=1, max_length=4000)


def guarded(operation):
    try:
        return operation()
    except WKIMError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/workspaces")
def workspaces(current_user: User = Depends(get_current_user)):
    return wkim_service.list_workspaces(current_user.id)


@router.get("/storage-locations")
def storage_locations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    connectors = db.query(UserConnector).filter(UserConnector.user_id == current_user.id, UserConnector.status == "connected").all()
    return wkim_service.storage_locations(current_user.id, connectors)


@router.post("/workspaces", status_code=201)
def register(request: WorkspaceRegistration, current_user: User = Depends(get_current_user)):
    return guarded(lambda: wkim_service.register_workspace(current_user.id, **request.model_dump()))


@router.get("/catalog")
def catalog(workspace_id: str | None = None, domain: str | None = None, current_user: User = Depends(get_current_user)):
    return guarded(lambda: wkim_service.catalog(current_user.id, workspace_id, domain))


@router.delete("/catalog")
def clear_catalog(workspace_id: str | None = None, current_user: User = Depends(get_current_user)):
    return guarded(lambda: wkim_service.clear_catalog(current_user.id, workspace_id))


@router.delete("/catalog/{document_id}")
def remove_reference(document_id: str, current_user: User = Depends(get_current_user)):
    return guarded(lambda: wkim_service.remove_document_reference(current_user.id, document_id))


@router.post("/catalog/reference", status_code=201)
def add_reference(request: DocumentReference, current_user: User = Depends(get_current_user)):
    values = request.model_dump()
    workspace_id = values.pop("workspace_id")
    physical_location = values.pop("physical_location")
    return guarded(lambda: wkim_service.catalog_reference(current_user.id, workspace_id, physical_location, **values))


@router.get("/search")
def search(query: str = Query(min_length=1, max_length=500), workspace_id: str | None = None,
           domain: str | None = None, limit: int = Query(default=20, ge=1, le=100),
           current_user: User = Depends(get_current_user)):
    return guarded(lambda: wkim_service.search(current_user.id, query, workspace_id=workspace_id, domain=domain, limit=limit))


@router.post("/workspaces/{workspace_id}/events")
def watcher_event(workspace_id: str, request: WatcherEvent, current_user: User = Depends(get_current_user)):
    return guarded(lambda: wkim_service.watcher_event(current_user.id, workspace_id, request.event_type, request.physical_location))


@router.delete("/workspaces/{workspace_id}")
def disconnect_workspace(workspace_id: str, clear_catalog: bool = False, current_user: User = Depends(get_current_user)):
    return guarded(lambda: wkim_service.disconnect_workspace(current_user.id, workspace_id, clear_catalog=clear_catalog))


@router.get("/health")
def health(current_user: User = Depends(get_current_user)):
    return guarded(lambda: wkim_service.health(current_user.id))


@router.get("/activity")
def activity(limit: int = Query(default=50, ge=1, le=200), current_user: User = Depends(get_current_user)):
    return wkim_service.activity(current_user.id, limit)
