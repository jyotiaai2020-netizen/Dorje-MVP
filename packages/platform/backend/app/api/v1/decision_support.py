from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.decision_support_service import decision_support_service

router = APIRouter(prefix="/decision-support", tags=["Decision Support"])


class ScenarioCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    domain: str = Field(default="general", max_length=60)
    purpose: str = Field(default="", max_length=1000)
    workspace_id: str = Field(default="default", max_length=120)
    assumptions: dict[str, Any] = Field(default_factory=dict)
    objective: dict[str, Any] = Field(default_factory=dict)
    constraints: dict[str, Any] = Field(default_factory=dict)
    source_context_ids: list[str] = Field(default_factory=list)


class WhatIfRequest(BaseModel):
    scenario_id: str
    changes: dict[str, Any] = Field(default_factory=dict)


class SimulationRequest(BaseModel):
    scenario_id: str | None = None
    inputs: dict[str, Any] = Field(default_factory=dict)


class OptimizationRequest(BaseModel):
    scenario_id: str | None = None
    inputs: dict[str, Any] = Field(default_factory=dict)


class RecommendationRequest(BaseModel):
    scenario_id: str | None = None
    options: list[dict[str, Any]] = Field(default_factory=list)
    criteria_weights: dict[str, float] | None = None


@router.post("/scenarios", status_code=status.HTTP_201_CREATED)
def create_scenario(request: ScenarioCreateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return decision_support_service.create_scenario(
        db,
        user=current_user,
        title=request.title,
        domain=request.domain,
        purpose=request.purpose,
        workspace_id=request.workspace_id,
        assumptions=request.assumptions,
        objective=request.objective,
        constraints=request.constraints,
        source_context_ids=request.source_context_ids,
    )


@router.post("/what-if")
def what_if(request: WhatIfRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        return decision_support_service.what_if(db, user=current_user, scenario_id=request.scenario_id, changes=request.changes)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/simulate")
def simulate(request: SimulationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        return decision_support_service.simulate(db, user=current_user, scenario_id=request.scenario_id, inputs=request.inputs)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/optimize")
def optimize(request: OptimizationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        return decision_support_service.optimize(db, user=current_user, scenario_id=request.scenario_id, inputs=request.inputs)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/recommend")
def recommend(request: RecommendationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        return decision_support_service.recommend(db, user=current_user, scenario_id=request.scenario_id, options=request.options, criteria_weights=request.criteria_weights)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/history")
def history(limit: int = Query(default=50, ge=1, le=200), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return decision_support_service.history(db, user=current_user, limit=limit)
