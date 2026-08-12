from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import math
import random
import statistics
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.decision_support import DecisionAuditEvent, DecisionRecommendation, DecisionScenario, DecisionSimulation
from app.services.ceda_service import ceda_service


def decision_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12].upper()}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = (len(ordered) - 1) * percentile
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return round(ordered[int(index)], 4)
    return round(ordered[lower] * (upper - index) + ordered[upper] * (index - lower), 4)


@dataclass(frozen=True)
class PolicyGate:
    decision_id: str | None
    allowed: bool
    requires_consent: bool
    explanation: str


class DecisionSupportService:
    """Local-first scenario, simulation, optimization and recommendation layer.

    The first implementation deliberately avoids heavy Airflow/RL dependencies.
    Student-LAD can run what-if analysis offline; Professional/Enterprise can
    later add workflow orchestrators, RL engines, or external solvers behind the
    same API contract.
    """

    def create_scenario(
        self,
        db: Session,
        *,
        user,
        title: str,
        domain: str = "general",
        purpose: str = "",
        workspace_id: str = "default",
        assumptions: dict[str, Any] | None = None,
        objective: dict[str, Any] | None = None,
        constraints: dict[str, Any] | None = None,
        source_context_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        policy = self._evaluate_policy(
            user,
            action="create_decision_scenario",
            domain=domain,
            workspace=workspace_id,
            context_ids=source_context_ids or [],
            purpose=purpose or title,
        )
        if not policy.allowed:
            return {"allowed": False, "policy": policy.__dict__, "scenario": None}
        row = DecisionScenario(
            id=decision_id("DSC"),
            organization_id=getattr(user, "organization_id", None),
            user_id=user.id,
            workspace_id=workspace_id or "default",
            title=title[:180],
            domain=domain or "general",
            purpose=purpose or "",
            assumptions_json=assumptions or {},
            objective_json=objective or {},
            constraints_json=constraints or {},
            source_context_ids_json=source_context_ids or [],
            policy_decision_ref=policy.decision_id,
        )
        db.add(row)
        db.flush()
        self._audit(db, user=user, scenario_id=row.id, event_type="scenario_created", payload={"title": row.title, "domain": row.domain, "policy": policy.__dict__})
        db.commit()
        return {"allowed": True, "policy": policy.__dict__, "scenario": self._scenario_public(row)}

    def what_if(self, db: Session, *, user, scenario_id: str, changes: dict[str, Any]) -> dict[str, Any]:
        scenario = self._scenario_for_user(db, user, scenario_id)
        baseline = dict(scenario.assumptions_json or {})
        changed = {**baseline, **changes}
        comparison = []
        for key in sorted(set(baseline) | set(changed)):
            comparison.append({"field": key, "before": baseline.get(key), "after": changed.get(key), "changed": baseline.get(key) != changed.get(key)})
        score_delta = self._simple_score(changed) - self._simple_score(baseline)
        result = {
            "scenario_id": scenario.id,
            "summary": f"{len([item for item in comparison if item['changed']])} assumption(s) changed.",
            "comparison": comparison,
            "estimated_direction": "improves" if score_delta > 0 else "declines" if score_delta < 0 else "neutral",
            "estimated_delta": round(score_delta, 4),
            "requires_confirmation": False,
        }
        self._audit(db, user=user, scenario_id=scenario.id, event_type="what_if_compared", payload=result)
        db.commit()
        return result

    def simulate(self, db: Session, *, user, scenario_id: str | None, inputs: dict[str, Any]) -> dict[str, Any]:
        scenario = self._scenario_for_user(db, user, scenario_id) if scenario_id else None
        domain = scenario.domain if scenario else str(inputs.get("domain") or "general")
        policy = self._evaluate_policy(user, action="run_decision_simulation", domain=domain, workspace=scenario.workspace_id if scenario else "default", purpose="Monte Carlo decision support simulation")
        if not policy.allowed:
            return {"allowed": False, "policy": policy.__dict__, "simulation": None}
        trials = max(100, min(int(inputs.get("trials") or 1000), 10000))
        rng = random.Random(int(inputs.get("seed") or 42))
        variables = list(inputs.get("variables") or [])
        formula = inputs.get("formula") or {}
        outcomes = [self._sample_outcome(rng, variables, formula) for _ in range(trials)]
        threshold = inputs.get("risk_threshold")
        threshold_direction = str(inputs.get("risk_direction") or "below")
        risk_probability = None
        if isinstance(threshold, int | float):
            if threshold_direction == "above":
                risk_probability = sum(1 for value in outcomes if value > float(threshold)) / trials
            else:
                risk_probability = sum(1 for value in outcomes if value < float(threshold)) / trials
        result = {
            "trials": trials,
            "mean": round(statistics.fmean(outcomes), 4),
            "stdev": round(statistics.pstdev(outcomes), 4),
            "p10": _percentile(outcomes, 0.10),
            "p50": _percentile(outcomes, 0.50),
            "p90": _percentile(outcomes, 0.90),
            "min": round(min(outcomes), 4),
            "max": round(max(outcomes), 4),
            "risk_probability": round(risk_probability, 4) if risk_probability is not None else None,
            "interpretation": self._simulation_interpretation(outcomes, risk_probability),
        }
        row = DecisionSimulation(
            id=decision_id("SIM"),
            scenario_id=scenario.id if scenario else None,
            organization_id=getattr(user, "organization_id", None),
            user_id=user.id,
            inputs_json=inputs,
            result_json=result,
            confidence=0.82 if variables else 0.5,
            policy_decision_ref=policy.decision_id,
        )
        db.add(row)
        self._audit(db, user=user, scenario_id=scenario.id if scenario else None, event_type="simulation_created", payload={"simulation_id": row.id, "policy": policy.__dict__})
        db.commit()
        return {"allowed": True, "policy": policy.__dict__, "simulation": self._simulation_public(row)}

    def optimize(self, db: Session, *, user, scenario_id: str | None, inputs: dict[str, Any]) -> dict[str, Any]:
        scenario = self._scenario_for_user(db, user, scenario_id) if scenario_id else None
        options = list(inputs.get("options") or [])
        budget = float(inputs.get("budget") or inputs.get("constraints", {}).get("budget") or 0)
        selected: list[dict[str, Any]] = []
        remaining = budget
        for option in sorted(options, key=lambda item: float(item.get("benefit") or 0) / max(float(item.get("cost") or 1), 0.0001), reverse=True):
            cost = float(option.get("cost") or 0)
            if cost <= remaining:
                selected.append(option)
                remaining -= cost
        total_cost = round(sum(float(item.get("cost") or 0) for item in selected), 4)
        total_benefit = round(sum(float(item.get("benefit") or 0) for item in selected), 4)
        result = {
            "method": "local_greedy_linear_baseline",
            "objective": inputs.get("objective") or "maximize_benefit_under_budget",
            "selected_options": selected,
            "total_cost": total_cost,
            "total_benefit": total_benefit,
            "remaining_budget": round(budget - total_cost, 4),
            "explanation": "Selected options by highest benefit-to-cost ratio within the available budget. Use an enterprise solver for strict LP/IP guarantees.",
        }
        recommendation = self._save_recommendation(db, user=user, scenario_id=scenario.id if scenario else None, recommendation_type="optimization", recommendation=result, rationale=result["explanation"], score=total_benefit)
        db.commit()
        return {"allowed": True, "optimization": result, "recommendation": self._recommendation_public(recommendation)}

    def recommend(self, db: Session, *, user, scenario_id: str | None, options: list[dict[str, Any]], criteria_weights: dict[str, float] | None = None) -> dict[str, Any]:
        scenario = self._scenario_for_user(db, user, scenario_id) if scenario_id else None
        weights = criteria_weights or {"impact": 0.35, "urgency": 0.25, "confidence": 0.20, "effort": -0.10, "risk": -0.10}
        ranked = []
        for option in options:
            score = 0.0
            for criterion, weight in weights.items():
                score += float(option.get(criterion) or 0) * float(weight)
            ranked.append({**option, "decision_score": round(score, 4)})
        ranked.sort(key=lambda item: item["decision_score"], reverse=True)
        top = ranked[:3]
        result = {
            "top_recommendations": top,
            "all_options": ranked,
            "weights": weights,
            "requires_confirmation": True,
            "next_step": "Review the top option, edit assumptions if needed, then confirm before any action is created.",
        }
        rationale = "Ranked options using impact, urgency, confidence, effort, and risk. No action was executed."
        recommendation = self._save_recommendation(db, user=user, scenario_id=scenario.id if scenario else None, recommendation_type="ranked_options", recommendation=result, rationale=rationale, score=float(top[0]["decision_score"]) if top else 0.0)
        db.commit()
        return {"allowed": True, "recommendation": self._recommendation_public(recommendation)}

    def history(self, db: Session, *, user, limit: int = 50) -> dict[str, Any]:
        rows = db.query(DecisionScenario).filter(DecisionScenario.user_id == user.id, DecisionScenario.organization_id == getattr(user, "organization_id", None)).order_by(DecisionScenario.created_at.desc()).limit(limit).all()
        return {"scenarios": [self._scenario_public(row) for row in rows]}

    def _sample_outcome(self, rng: random.Random, variables: list[dict[str, Any]], formula: dict[str, Any]) -> float:
        sampled: dict[str, float] = {}
        for variable in variables:
            name = str(variable.get("name") or f"var_{len(sampled)}")
            distribution = str(variable.get("distribution") or "fixed").lower()
            if distribution == "uniform":
                sampled[name] = rng.uniform(float(variable.get("min") or 0), float(variable.get("max") or 1))
            elif distribution == "normal":
                sampled[name] = rng.gauss(float(variable.get("mean") or 0), float(variable.get("std") or 1))
            elif distribution == "triangular":
                sampled[name] = rng.triangular(float(variable.get("min") or 0), float(variable.get("max") or 1), float(variable.get("mode") or variable.get("mean") or 0.5))
            else:
                sampled[name] = float(variable.get("value") or variable.get("mean") or 0)
        base = float(formula.get("base") or 0)
        coefficients = dict(formula.get("coefficients") or {})
        return base + sum(float(coefficients.get(name, 1.0)) * value for name, value in sampled.items())

    def _simple_score(self, assumptions: dict[str, Any]) -> float:
        score = 0.0
        for value in assumptions.values():
            if isinstance(value, bool):
                score += 1.0 if value else -1.0
            elif isinstance(value, int | float):
                score += float(value)
            elif isinstance(value, str) and value.strip():
                score += 0.2
        return score

    def _simulation_interpretation(self, outcomes: list[float], risk_probability: float | None) -> str:
        spread = _percentile(outcomes, 0.9) - _percentile(outcomes, 0.1)
        if risk_probability is not None and risk_probability >= 0.5:
            return "High risk probability. Review assumptions before acting."
        if spread > max(abs(statistics.fmean(outcomes)), 1) * 0.75:
            return "Outcome range is wide. Treat the recommendation as uncertain."
        return "Outcome range is manageable under the supplied assumptions."

    def _save_recommendation(self, db: Session, *, user, scenario_id: str | None, recommendation_type: str, recommendation: dict[str, Any], rationale: str, score: float) -> DecisionRecommendation:
        row = DecisionRecommendation(
            id=decision_id("REC"),
            scenario_id=scenario_id,
            organization_id=getattr(user, "organization_id", None),
            user_id=user.id,
            recommendation_type=recommendation_type,
            recommendation_json=recommendation,
            rationale=rationale,
            score=round(score, 4),
            status="draft",
        )
        db.add(row)
        self._audit(db, user=user, scenario_id=scenario_id, event_type="recommendation_created", payload={"recommendation_id": row.id, "type": recommendation_type, "score": row.score})
        return row

    def _evaluate_policy(self, user, *, action: str, domain: str, workspace: str, context_ids: list[str] | None = None, purpose: str = "") -> PolicyGate:
        try:
            decision = ceda_service.policy_engine.evaluate(user.id, action, domain=domain, workspace=workspace, context_ids=context_ids or [], sensitivity="private", purpose=purpose)
            return PolicyGate(decision.get("decision_id"), bool(decision.get("allowed") or decision.get("requires_consent")), bool(decision.get("requires_consent")), decision.get("explanation", "Policy evaluated."))
        except Exception:
            return PolicyGate(None, True, False, "Policy service unavailable; local-only decision support allowed with no external action.")

    def _scenario_for_user(self, db: Session, user, scenario_id: str) -> DecisionScenario:
        row = db.query(DecisionScenario).filter(DecisionScenario.id == scenario_id, DecisionScenario.user_id == user.id, DecisionScenario.organization_id == getattr(user, "organization_id", None)).first()
        if not row:
            raise LookupError("Decision scenario not found")
        return row

    def _audit(self, db: Session, *, user, scenario_id: str | None, event_type: str, payload: dict[str, Any]) -> None:
        db.add(DecisionAuditEvent(id=decision_id("DAE"), scenario_id=scenario_id, organization_id=getattr(user, "organization_id", None), user_id=user.id, event_type=event_type, payload_json=payload))

    def _scenario_public(self, row: DecisionScenario) -> dict[str, Any]:
        return {
            "id": row.id,
            "workspace_id": row.workspace_id,
            "title": row.title,
            "domain": row.domain,
            "purpose": row.purpose,
            "assumptions": row.assumptions_json,
            "objective": row.objective_json,
            "constraints": row.constraints_json,
            "source_context_ids": row.source_context_ids_json,
            "policy_decision_ref": row.policy_decision_ref,
            "status": row.status,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }

    def _simulation_public(self, row: DecisionSimulation) -> dict[str, Any]:
        return {
            "id": row.id,
            "scenario_id": row.scenario_id,
            "simulation_type": row.simulation_type,
            "inputs": row.inputs_json,
            "result": row.result_json,
            "confidence": row.confidence,
            "policy_decision_ref": row.policy_decision_ref,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }

    def _recommendation_public(self, row: DecisionRecommendation) -> dict[str, Any]:
        return {
            "id": row.id,
            "scenario_id": row.scenario_id,
            "recommendation_type": row.recommendation_type,
            "recommendation": row.recommendation_json,
            "rationale": row.rationale,
            "score": row.score,
            "status": row.status,
            "policy_decision_ref": row.policy_decision_ref,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }


decision_support_service = DecisionSupportService()
