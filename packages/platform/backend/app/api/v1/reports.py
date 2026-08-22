from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from langchain_ollama import ChatOllama
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rbac import Role, enforce_organization_access, require_roles
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.report import Report
from app.models.user import User
from app.services.ollama_client import ollama_client_options

router = APIRouter(prefix="/reports", tags=["Reports"])


class ReportRequest(BaseModel):
    organization_id: int
    company: str = Field(min_length=1, max_length=200)
    industry: str = Field(min_length=1, max_length=200)
    employees: int = Field(gt=0)
    goal: str = Field(min_length=1)
    report_type: str = Field(default="AI Readiness Assessment", max_length=200)


class ReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    created_by_user_id: int
    company: str
    industry: str
    employees: int
    goal: str
    report_type: str
    report: str
    created_at: datetime


def serialize_report(report: Report) -> dict:
    return {
        "id": report.id,
        "organization_id": report.organization_id,
        "created_by_user_id": report.created_by_user_id,
        "company": report.company,
        "industry": report.industry,
        "employees": report.employees,
        "goal": report.goal,
        "report_type": report.report_type,
        "report": report.content,
        "created_at": report.created_at,
    }


@router.post("/generate", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
def generate_report(
    request: ReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.CONSULTANT)
    ),
):
    enforce_organization_access(current_user, request.organization_id)

    llm = ChatOllama(
        model=settings.OLLAMA_REPORT_MODEL,
        **ollama_client_options(),
        temperature=0.4,
        num_predict=1200,
        keep_alive=settings.OLLAMA_KEEP_ALIVE,
    )
    prompt = f"""
    Create a professional {request.report_type}.

    Company: {request.company}
    Industry: {request.industry}
    Employees: {request.employees}
    Goal: {request.goal}

    Include Executive Summary, Risks, Opportunities, Recommendations, and Next Steps.
    """
    response = llm.invoke(prompt)
    report = Report(
        organization_id=request.organization_id,
        created_by_user_id=current_user.id,
        company=request.company,
        industry=request.industry,
        employees=request.employees,
        goal=request.goal,
        report_type=request.report_type,
        content=str(response.content),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return serialize_report(report)


@router.get("/", response_model=list[ReportResponse])
def list_reports(
    organization_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_organization_id = organization_id or current_user.organization_id
    if target_organization_id is None:
        return []
    enforce_organization_access(current_user, target_organization_id)
    reports = (
        db.query(Report)
        .filter(Report.organization_id == target_organization_id)
        .order_by(Report.created_at.desc())
        .all()
    )
    return [serialize_report(report) for report in reports]


@router.get("/{report_id}", response_model=ReportResponse)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    enforce_organization_access(current_user, report.organization_id)
    return serialize_report(report)
