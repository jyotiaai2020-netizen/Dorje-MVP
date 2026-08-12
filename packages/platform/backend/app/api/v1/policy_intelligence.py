from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.security import get_current_user
from app.models.user import User
from app.services.ceda_service import ceda_service

router = APIRouter(prefix="/pie", tags=["Policy Intelligence Engine"])


class PolicyCreate(BaseModel):
    name: str = Field(min_length=2,max_length=160)
    scope_type: str
    scope_id: str | None = None
    effect: str
    actions: list[str] = Field(min_length=1)
    rules: dict[str,Any] = Field(default_factory=dict)
    reason: str = Field(min_length=2,max_length=200)


class PolicyUpdate(BaseModel):
    changes: dict[str,Any]
    reason: str = Field(min_length=2,max_length=200)


class EvaluationRequest(BaseModel):
    action: str
    domain: str | None = None
    workspace: str | None = None
    project: str | None = None
    context_ids: list[str] = Field(default_factory=list)
    sensitivity: str = "private"
    connector: str | None = None
    model: str | None = None
    destination: str | None = None
    purpose: str = ""


class ConsentDecision(BaseModel):
    approved: bool
    reason: str = Field(default="",max_length=200)


@router.get("/policies")
def policies(include_disabled: bool=False,current_user:User=Depends(get_current_user)):
    return ceda_service.policy_engine.list_policies(current_user.id,include_disabled)


@router.post("/policies",status_code=201)
def create_policy(request:PolicyCreate,current_user:User=Depends(get_current_user)):
    try: return ceda_service.policy_engine.create_policy(current_user.id,request.name,request.scope_type,request.scope_id,request.effect,request.actions,request.rules,request.reason)
    except ValueError as exc: raise HTTPException(status_code=400,detail=str(exc)) from exc


@router.patch("/policies/{policy_id}")
def update_policy(policy_id:str,request:PolicyUpdate,current_user:User=Depends(get_current_user)):
    try: return ceda_service.policy_engine.update_policy(current_user.id,policy_id,request.changes,request.reason)
    except ValueError as exc: raise HTTPException(status_code=400,detail=str(exc)) from exc


@router.delete("/policies/{policy_id}")
def disable_policy(policy_id:str,reason:str="User disabled policy",current_user:User=Depends(get_current_user)):
    try: return ceda_service.policy_engine.disable_policy(current_user.id,policy_id,reason)
    except ValueError as exc: raise HTTPException(status_code=404,detail=str(exc)) from exc


@router.post("/policies/{policy_id}/restore")
def restore_policy(policy_id:str,reason:str="User restored policy",current_user:User=Depends(get_current_user)):
    try: return ceda_service.policy_engine.restore_policy(current_user.id,policy_id,reason)
    except ValueError as exc: raise HTTPException(status_code=404,detail=str(exc)) from exc


@router.post("/evaluate")
def evaluate(request:EvaluationRequest,current_user:User=Depends(get_current_user)):
    return ceda_service.policy_engine.evaluate(current_user.id,request.action,domain=request.domain,workspace=request.workspace,project=request.project,context_ids=request.context_ids,sensitivity=request.sensitivity,connector=request.connector,model=request.model,destination=request.destination,purpose=request.purpose)


@router.post("/validate/context")
def validate_context(request:EvaluationRequest,current_user:User=Depends(get_current_user)):
    return evaluate(request,current_user)


@router.post("/validate/connector")
def validate_connector(request:EvaluationRequest,current_user:User=Depends(get_current_user)):
    request.action="connector_access"; return evaluate(request,current_user)


@router.post("/validate/model")
def validate_model(request:EvaluationRequest,current_user:User=Depends(get_current_user)):
    request.action="send_to_model"; return evaluate(request,current_user)


@router.post("/consents/{consent_id}")
def consent(consent_id:str,request:ConsentDecision,current_user:User=Depends(get_current_user)):
    try: return ceda_service.policy_engine.decide_consent(current_user.id,consent_id,request.approved,request.reason)
    except ValueError as exc: raise HTTPException(status_code=404,detail=str(exc)) from exc


@router.get("/decisions")
def decisions(limit:int=Query(default=50,ge=1,le=200),current_user:User=Depends(get_current_user)):
    return ceda_service.policy_engine.decisions(current_user.id,limit)


@router.get("/decisions/{decision_id}")
def explain(decision_id:str,current_user:User=Depends(get_current_user)):
    try: return ceda_service.policy_engine.explain_decision(current_user.id,decision_id)
    except ValueError as exc: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail=str(exc)) from exc
