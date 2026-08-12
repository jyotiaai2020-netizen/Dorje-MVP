from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.security import get_current_user
from app.models.user import User
from app.services.context_graph_service import context_graph_service

router = APIRouter(prefix="/context-graph", tags=["Context Graph"])


class RelationshipDefinitionRequest(BaseModel):
    relationship_type: str = Field(min_length=2, max_length=64, pattern=r"^[a-z][a-z0-9_]{1,63}$")
    domain: str = Field(default="general", max_length=80)
    description: str = Field(min_length=3, max_length=500)
    inverse_type: str | None = Field(default=None, max_length=64)
    allowed_source_types: list[str] = Field(default_factory=list, max_length=50)
    allowed_target_types: list[str] = Field(default_factory=list, max_length=50)


class RecordRegistrationRequest(BaseModel):
    record_type: str = Field(min_length=1, max_length=80)
    record_id: str = Field(min_length=2, max_length=128)
    table_name: str = Field(min_length=1, max_length=120)
    organization_id: str = Field(default="local", max_length=120)
    workspace_id: str = Field(default="default", max_length=120)
    source_module: str = Field(default="api", max_length=120)
    action: str = Field(default="register_record", max_length=80)


class ArchitectureValidationRequest(BaseModel):
    record_type: str = Field(min_length=1, max_length=80)
    record_id: str = Field(min_length=2, max_length=128)
    table_name: str = Field(min_length=1, max_length=120)
    operation: str = Field(default="create_record", max_length=80)
    relationship_type: str | None = Field(default=None, max_length=64)
    organization_id: str = Field(default="local", max_length=120)
    workspace_id: str = Field(default="default", max_length=120)


class RelationshipRequest(BaseModel):
    source_type: str = Field(min_length=1, max_length=80)
    source_id: str = Field(min_length=2, max_length=128)
    relationship_type: str = Field(min_length=2, max_length=64, pattern=r"^[a-z][a-z0-9_]{1,63}$")
    target_type: str = Field(min_length=1, max_length=80)
    target_id: str = Field(min_length=2, max_length=128)
    organization_id: str = Field(default="local", max_length=120)
    workspace_id: str = Field(default="default", max_length=120)
    confidence: float = Field(default=1.0, ge=0, le=1)
    policy_id: str | None = Field(default=None, max_length=120)
    metadata: dict[str, Any] = Field(default_factory=dict)


@router.get("/architecture/policies")
def architecture_policies(current_user: User = Depends(get_current_user)):
    return {"items": context_graph_service.architecture_policies()}


@router.post("/architecture/validate-record")
def validate_record(request: ArchitectureValidationRequest, current_user: User = Depends(get_current_user)):
    return context_graph_service.validate_record_architecture(
        current_user.id,
        request.record_type,
        request.record_id,
        request.table_name,
        operation=request.operation,
        relationship_type=request.relationship_type,
        organization_id=request.organization_id,
        workspace_id=request.workspace_id,
    )


@router.post("/records/register")
def register_record(request: RecordRegistrationRequest, current_user: User = Depends(get_current_user)):
    try:
        return context_graph_service.register_record(
            current_user.id,
            request.record_type,
            request.record_id,
            request.table_name,
            organization_id=request.organization_id,
            workspace_id=request.workspace_id,
            source_module=request.source_module,
            action=request.action,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/records/changes")
def record_changes(record_type: str | None = None, record_id: str | None = None, limit: int = Query(default=100, ge=1, le=500), current_user: User = Depends(get_current_user)):
    return {"items": context_graph_service.record_changes(current_user.id, record_type, record_id, limit)}


@router.get("/relationships/definitions")
def relationship_definitions(include_inactive: bool = False, current_user: User = Depends(get_current_user)):
    return {"items": context_graph_service.relationship_definitions(include_inactive)}


@router.post("/relationships/definitions")
def create_relationship_definition(request: RelationshipDefinitionRequest, current_user: User = Depends(get_current_user)):
    try:
        return context_graph_service.create_relationship_definition(
            request.relationship_type,
            request.domain,
            request.description,
            inverse_type=request.inverse_type,
            allowed_source_types=request.allowed_source_types,
            allowed_target_types=request.allowed_target_types,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/relationships")
def create_relationship(request: RelationshipRequest, current_user: User = Depends(get_current_user)):
    try:
        return context_graph_service.create_relationship(
            current_user.id,
            request.source_type,
            request.source_id,
            request.relationship_type,
            request.target_type,
            request.target_id,
            organization_id=request.organization_id,
            workspace_id=request.workspace_id,
            confidence=request.confidence,
            policy_id=request.policy_id,
            metadata=request.metadata,
            created_by=str(current_user.id),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/nodes/{node_type}/{node_id}/neighbors")
def neighbors(node_type: str, node_id: str, direction: str = Query(default="both", pattern="^(both|inbound|outbound)$"), organization_id: str = "local", workspace_id: str = "default", current_user: User = Depends(get_current_user)):
    return context_graph_service.get_neighbors(current_user.id, node_type, node_id, organization_id=organization_id, workspace_id=workspace_id, direction=direction)


@router.get("/related")
def related(type: str = Query(..., min_length=1, max_length=80), id: str = Query(..., min_length=2, max_length=128), depth: int = Query(default=2, ge=1, le=4), organization_id: str = "local", workspace_id: str = "default", current_user: User = Depends(get_current_user)):
    return context_graph_service.get_related(current_user.id, type, id, depth=depth, organization_id=organization_id, workspace_id=workspace_id)


@router.get("/dependencies/{node_type}/{node_id}")
def dependencies(node_type: str, node_id: str, organization_id: str = "local", workspace_id: str = "default", current_user: User = Depends(get_current_user)):
    return context_graph_service.get_dependencies(current_user.id, node_type, node_id, organization_id=organization_id, workspace_id=workspace_id)


@router.get("/impact")
def impact(type: str = Query(..., min_length=1, max_length=80), id: str = Query(..., min_length=2, max_length=128), depth: int = Query(default=3, ge=1, le=5), organization_id: str = "local", workspace_id: str = "default", current_user: User = Depends(get_current_user)):
    return context_graph_service.get_impact(current_user.id, type, id, depth=depth, organization_id=organization_id, workspace_id=workspace_id)


@router.delete("/relationships/{relationship_id}")
def archive_relationship(relationship_id: str, organization_id: str = "local", workspace_id: str = "default", current_user: User = Depends(get_current_user)):
    try:
        return context_graph_service.archive_relationship(current_user.id, relationship_id, organization_id=organization_id, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
