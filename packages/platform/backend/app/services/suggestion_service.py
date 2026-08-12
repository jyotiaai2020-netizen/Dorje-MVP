from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import re
import uuid

from sqlalchemy.orm import Session

from app.models.suggestion import CEDASuggestion
from app.repositories.suggestion_repository import suggestion_repository, sug_id
from app.schemas.dorje_ai import UploadedFileReference
from app.services.action_registry import ActionRegistryEntry, action_registry
from app.services.context_os_service import context_os_service
from app.services.tier_policy import TierPolicyEngine


SENSITIVE_RE = re.compile(r"\b(passport|visa|sevis|i-?20|ead|uscis|ssn|password|token|secret|medical|bank|routing|card)\b", re.I)
DATE_RE = re.compile(r"\b(?:due|deadline|expires?|ends?|starts?|appointment|interview|meeting|by)\s*(?:on|at|:|-)?\s*([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4})", re.I)


@dataclass(frozen=True)
class CandidateSuggestion:
    action_type: str
    label: str
    instruction: str
    reason: str
    evidence_refs: list[str]
    confidence: float
    relevance: float
    urgency: float
    actionability: float
    continuity: float
    sensitivity: str

    @property
    def score(self) -> float:
        return round(0.30 * self.relevance + 0.25 * self.urgency + 0.20 * self.actionability + 0.15 * self.continuity + 0.10 * self.confidence, 4)

    @property
    def components(self) -> dict:
        return {"relevance": self.relevance, "urgency": self.urgency, "actionability": self.actionability, "continuity": self.continuity, "confidence": self.confidence, "score": self.score}


class SuggestionService:
    def __init__(self) -> None:
        self.tier_policy = TierPolicyEngine()
        self.prompt_version = "nba-suggestions-v1"

    def generate(self, *, db: Session, user, surface: str, workspace_id: str, conversation_id: str, current_message: str | None, files: list[UploadedFileReference], maximum_suggestions: int = 3) -> dict:
        safe_workspace = (workspace_id or "default")[:120]
        text = self._combined_text(current_message, files)
        source_ids = self._source_ids(files)
        sensitivity = "high" if SENSITIVE_RE.search(text) else "medium" if files else "low"
        try:
            approved_context = context_os_service.retrieve_for_request(user.id, (current_message or text or "suggest next action")[:1000], "dorje_ai" if surface == "dorje_workspace" else "kamal")
        except Exception:
            approved_context = ""
        candidates = self._candidate_suggestions(surface=surface, current_message=current_message or "", files=files, text=text, approved_context=approved_context, sensitivity=sensitivity)
        filtered = self._policy_and_capability_filter(user, surface, candidates)
        selected = self._diverse_top_three(filtered, maximum_suggestions)
        rows = [self._to_model(user, safe_workspace, conversation_id, surface, source_ids, candidate) for candidate in selected]
        rows = suggestion_repository.create_suggestions(db, rows)
        for row in rows:
            suggestion_repository.mark_displayed(row)
        db.commit()
        greeting = self._greeting(surface, files, approved_context, selected)
        return {
            "greeting": greeting,
            "context_summary": self._context_summary(files, approved_context),
            "suggestions": [self._public(row) for row in rows],
            "policy": {"context_scope": "workspace" if surface == "dorje_workspace" else "personal", "processing_location": "local", "durable_memory_updated": False},
        }

    def select(self, *, db: Session, user, suggestion_id: str) -> dict:
        suggestion = self._authorized_suggestion(db, user, suggestion_id)
        suggestion_repository.update_status(suggestion, "copied_to_composer")
        suggestion_repository.add_feedback(db, suggestion=suggestion, feedback_type="copied_to_composer")
        preview = self._action_preview(suggestion)
        instruction_hash = hashlib.sha256(suggestion.editable_instruction.encode()).hexdigest()[:16]
        action = suggestion_repository.create_action(db, suggestion=suggestion, preview=preview, idempotency_key=f"select:{suggestion.id}:{instruction_hash}")
        action.status = "copied_to_composer"
        action.executed_at = None
        action.outcome_json = {"side_effect": False, "message": "Suggestion copied to composer. No action has been executed."}
        db.commit()
        return {
            "action_id": action.id,
            "status": action.status,
            "preview": action.preview_json,
            "requires_confirmation": action.requires_confirmation,
            "instruction": suggestion.editable_instruction,
            "draft_metadata": {
                "suggestion_id": suggestion.id,
                "action_type": suggestion.action_type,
                "workspace_id": suggestion.workspace_id,
                "conversation_id": suggestion.conversation_id,
                "surface": suggestion.surface,
                "source_document_ids": list(suggestion.source_document_ids_json or []),
                "policy_decision_ref": suggestion.policy_decision_ref,
            },
        }

    def edit(self, *, db: Session, user, suggestion_id: str, edited_instruction: str) -> dict:
        suggestion = self._authorized_suggestion(db, user, suggestion_id)
        suggestion_repository.add_feedback(db, suggestion=suggestion, feedback_type="edited", edited_instruction=edited_instruction)
        suggestion.editable_instruction = edited_instruction
        suggestion.status = "edited"
        db.commit()
        return self._public(suggestion)

    def dismiss(self, *, db: Session, user, suggestion_id: str, reason: str) -> dict:
        suggestion = self._authorized_suggestion(db, user, suggestion_id)
        suggestion_repository.update_status(suggestion, "dismissed")
        suggestion_repository.add_feedback(db, suggestion=suggestion, feedback_type="dismissed", metadata={"reason": reason})
        db.commit()
        return self._public(suggestion)

    def confirm_action(self, *, db: Session, user, action_id: str) -> dict:
        action = suggestion_repository.get_action_for_user(db, action_id=action_id, user_id=user.id, organization_id=user.organization_id)
        if not action:
            raise LookupError("Action not found")
        now = datetime.now(timezone.utc)
        if action.status == "executed":
            return {"action_id": action.id, "status": action.status, "outcome": action.outcome_json}
        action.confirmed_at = now
        action.executed_at = now
        action.status = "executed"
        action.outcome_json = {"side_effect": False, "message": "Action confirmed and routed for governed execution.", "preview": action.preview_json}
        db.commit()
        return {"action_id": action.id, "status": action.status, "outcome": action.outcome_json}

    def cancel_action(self, *, db: Session, user, action_id: str) -> dict:
        action = suggestion_repository.get_action_for_user(db, action_id=action_id, user_id=user.id, organization_id=user.organization_id)
        if not action:
            raise LookupError("Action not found")
        action.cancelled_at = datetime.now(timezone.utc)
        action.status = "cancelled"
        action.outcome_json = {"side_effect": False, "message": "Action cancelled by user."}
        db.commit()
        return {"action_id": action.id, "status": action.status, "outcome": action.outcome_json}

    def action_events(self, *, db: Session, user, action_id: str) -> dict:
        action = suggestion_repository.get_action_for_user(db, action_id=action_id, user_id=user.id, organization_id=user.organization_id)
        if not action:
            raise LookupError("Action not found")
        return {"events": [{"action_id": action.id, "status": action.status, "outcome": action.outcome_json, "created_at": action.created_at.isoformat() if action.created_at else None}]}

    def get(self, *, db: Session, user, suggestion_id: str) -> dict:
        return self._public(self._authorized_suggestion(db, user, suggestion_id))

    def _authorized_suggestion(self, db: Session, user, suggestion_id: str) -> CEDASuggestion:
        row = suggestion_repository.get_for_user(db, suggestion_id=suggestion_id, user_id=user.id, organization_id=user.organization_id)
        if not row:
            raise LookupError("Suggestion not found")
        return row

    def _combined_text(self, current_message: str | None, files: list[UploadedFileReference]) -> str:
        parts = [current_message or ""]
        for file in files:
            parts.append(f"\n--- {file.name} ({file.type}) ---\n{(file.content or '')[:12000]}")
        return "\n".join(parts).strip()[:50000]

    def _source_ids(self, files: list[UploadedFileReference]) -> list[str]:
        return [file.stored_name or file.name for file in files]

    def _candidate_suggestions(self, *, surface: str, current_message: str, files: list[UploadedFileReference], text: str, approved_context: str, sensitivity: str) -> list[CandidateSuggestion]:
        if not files:
            return self._context_greeting_candidates(surface, approved_context, current_message)
        lower = text.casefold()
        evidence = self._evidence_refs(files, text)
        urgency = 0.85 if DATE_RE.search(text) else 0.45
        continuity = 0.75 if approved_context else 0.4
        candidates: list[CandidateSuggestion] = []
        if re.search(r"\b(syllabus|course|assignment|grading|exam|quiz|submission)\b", lower):
            candidates += [
                CandidateSuggestion("extract_deadlines", "Extract deadlines", "Extract all assignment, quiz, exam, and submission deadlines into a clean table.", "The document appears to contain academic dates or submission requirements.", evidence, 0.92, 0.95, urgency, 0.9, continuity, sensitivity),
                CandidateSuggestion("create_study_plan", "Create study plan", "Create a weekly study plan using the detected course schedule, grading requirements, and deadlines.", "Academic requirements can be organized into a planning workflow.", evidence[:2], 0.88, 0.86, urgency, 0.82, continuity, sensitivity),
                CandidateSuggestion("extract_requirements", "Summarize rules", "Summarize grading rules, submission instructions, and professor expectations.", "The document likely contains course requirements the user must follow.", evidence[:2], 0.86, 0.82, 0.4, 0.75, continuity, sensitivity),
            ]
        elif re.search(r"\b(cpt|internship|offer|employer|start date|employment|dso)\b", lower):
            candidates += [
                CandidateSuggestion("draft_questions", "Questions for DSO", "Draft questions for my DSO based on the offer details and any CPT/OPT uncertainty.", "Employment and immigration terms may require official verification.", evidence, 0.9, 0.9, urgency, 0.78, continuity, "high"),
                CandidateSuggestion("extract_deadlines", "Response dates", "Extract response deadlines, start dates, and required next steps from this offer.", "The document may include dated employment obligations.", evidence, 0.86, 0.85, urgency, 0.86, continuity, sensitivity),
                CandidateSuggestion("validate_missing_information", "Missing info", "List missing information needed before I can safely act on this offer.", "Offer review should identify unknowns before creating actions.", evidence[:2], 0.82, 0.8, 0.5, 0.78, continuity, sensitivity),
            ]
        elif re.search(r"\b(methodology|abstract|findings|references|citation|literature|study|sample|results)\b", lower):
            candidates += [
                CandidateSuggestion("summarize_document", "Summarize findings", "Summarize the paper's research question, method, findings, and limitations.", "The document appears to be research or academic source material.", evidence, 0.9, 0.9, 0.35, 0.8, continuity, sensitivity),
                CandidateSuggestion("assess_methodology", "Assess method", "Assess the methodology, assumptions, sample, measures, and limitations.", "Methodology terms were detected in the document.", evidence[:2], 0.86, 0.84, 0.35, 0.76, continuity, sensitivity),
                CandidateSuggestion("extract_citations", "Extract citations", "Extract citation details and quoted source references into a clean list.", "Research documents often need citations organized for future writing.", evidence[:2], 0.8, 0.72, 0.25, 0.78, continuity, sensitivity),
            ]
        else:
            candidates += [
                CandidateSuggestion("summarize_document", "Summarize", "Summarize the attached document with key facts, risks, and next steps.", "The attachment has readable content that can be summarized locally.", evidence, 0.78, 0.72, urgency, 0.76, continuity, sensitivity),
                CandidateSuggestion("extract_action_items", "Action items", "Extract action items, owners, dates, and missing information from the attachment.", "The document may contain actionable obligations or decisions.", evidence, 0.76, 0.72, urgency, 0.82, continuity, sensitivity),
                CandidateSuggestion("validate_missing_information", "Missing info", "Identify missing or unclear information that should be confirmed before acting.", "Low or broad document classification benefits from verification first.", evidence[:2], 0.7, 0.65, 0.4, 0.78, continuity, sensitivity),
            ]
        if DATE_RE.search(text):
            candidates.append(CandidateSuggestion("create_reminder_candidates", "Prepare reminders", "Prepare reminder candidates for detected dates; do not create them until I confirm.", "One or more dates were detected, so reminders may be useful.", evidence, 0.84, 0.82, 0.9, 0.84, continuity, sensitivity))
        if re.search(r"\b(data|spreadsheet|csv|xlsx|table|rows|columns|statistics)\b", lower):
            candidates.append(CandidateSuggestion("analyze_dataset", "Analyze data", "Analyze the attached dataset and identify patterns, outliers, and useful charts.", "The attachment appears to include structured data.", evidence, 0.82, 0.86, 0.55, 0.86, continuity, sensitivity))
        return candidates

    def _context_greeting_candidates(self, surface: str, approved_context: str, current_message: str) -> list[CandidateSuggestion]:
        continuity = 0.8 if approved_context else 0.2
        if surface == "kamal_chat":
            return [
                CandidateSuggestion("plan_day", "Plan my day", "Plan my day using approved reminders, deadlines, and priorities.", "Kamal can use approved near-term context to organize the day.", ["CEDA:approved-context"], 0.74, 0.78, 0.7, 0.9, continuity, "low"),
                CandidateSuggestion("review_open_actions", "Review deadlines", "Review open deadlines and items needing attention.", "Approved CEDA context can surface upcoming work without exposing private details.", ["CEDA:approved-context"], 0.72, 0.74, 0.75, 0.86, continuity, "low"),
                CandidateSuggestion("continue_previous_work", "Continue draft", "Continue the most relevant unfinished draft or active workflow.", "Continuity suggestions help resume prior work when permitted context exists.", ["CEDA:approved-context"], 0.68, 0.7, 0.45, 0.72, continuity, "low"),
            ]
        return [
            CandidateSuggestion("continue_previous_work", "Continue work", "Continue the most relevant active Workspace AI work using approved context.", "Workspace AI can continue active plans and deliverables when context is permitted.", ["CEDA:approved-context"], 0.75, 0.8, 0.45, 0.78, continuity, "low"),
            CandidateSuggestion("review_open_actions", "Open actions", "Review open action items connected to this workspace.", "Open actions are useful before starting a new workflow.", ["CEDA:approved-context"], 0.72, 0.74, 0.7, 0.84, continuity, "low"),
            CandidateSuggestion("create_action_plan", "Start new", "Start a new action plan from my current goal.", "A fresh plan is safe when no document-specific action is selected.", ["current-message" if current_message else "workspace"], 0.68, 0.65, 0.35, 0.85, continuity, "low"),
        ]

    def _policy_and_capability_filter(self, user, surface: str, candidates: list[CandidateSuggestion]) -> list[tuple[CandidateSuggestion, ActionRegistryEntry]]:
        tier = self.tier_policy.resolve_user_tier(user)
        filtered: list[tuple[CandidateSuggestion, ActionRegistryEntry]] = []
        seen = set()
        for candidate in sorted(candidates, key=lambda item: item.score, reverse=True):
            entry = action_registry.get(candidate.action_type)
            if not entry or surface not in entry.supported_surfaces or candidate.sensitivity not in entry.permitted_sensitivity:
                continue
            if any(not self.tier_policy.can_use(tier, capability) for capability in entry.required_capabilities):
                continue
            key = (candidate.action_type, candidate.label.casefold())
            if key in seen:
                continue
            seen.add(key)
            filtered.append((candidate, entry))
        return filtered

    def _diverse_top_three(self, candidates: list[tuple[CandidateSuggestion, ActionRegistryEntry]], maximum: int) -> list[tuple[CandidateSuggestion, ActionRegistryEntry]]:
        buckets = (("understand", {"summarize_document", "assess_methodology", "extract_citations", "compare_documents"}), ("organize", {"extract_deadlines", "extract_action_items", "extract_requirements", "validate_missing_information", "analyze_dataset"}), ("act", {"create_study_plan", "create_action_plan", "create_reminder_candidates", "draft_email", "draft_response", "draft_questions", "prepare_calendar_event", "link_to_workspace", "plan_day", "review_open_actions", "continue_previous_work"}))
        selected: list[tuple[CandidateSuggestion, ActionRegistryEntry]] = []
        for _, action_types in buckets:
            match = next((item for item in candidates if item[0].action_type in action_types and item not in selected), None)
            if match:
                selected.append(match)
            if len(selected) >= maximum:
                return selected
        for item in candidates:
            if item not in selected:
                selected.append(item)
            if len(selected) >= maximum:
                break
        return selected[:maximum]

    def _to_model(self, user, workspace_id: str, conversation_id: str, surface: str, source_ids: list[str], item: tuple[CandidateSuggestion, ActionRegistryEntry]) -> CEDASuggestion:
        candidate, entry = item
        idempotency = hashlib.sha256(f"{user.id}|{workspace_id}|{conversation_id}|{surface}|{candidate.action_type}|{candidate.instruction}|{source_ids}".encode()).hexdigest()
        return CEDASuggestion(
            id=sug_id(),
            organization_id=user.organization_id,
            workspace_id=workspace_id,
            user_id=user.id,
            conversation_id=conversation_id[:160],
            surface=surface,
            source_document_ids_json=source_ids,
            action_type=candidate.action_type,
            label=candidate.label[:80],
            editable_instruction=candidate.instruction,
            original_instruction=candidate.instruction,
            reason=candidate.reason,
            evidence_refs_json=candidate.evidence_refs,
            confidence=candidate.confidence,
            score_components_json=candidate.components,
            required_permissions_json=list(entry.required_permissions),
            required_connector=entry.required_connector,
            sensitivity=candidate.sensitivity,
            processing_locality=entry.processing_locality,
            requires_confirmation=entry.requires_confirmation,
            status="generated",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
            idempotency_key=idempotency,
            model_metadata_json={"generator": "deterministic_ceda_suggestion_service", "prompt_version": self.prompt_version, "chain_of_thought_stored": False},
            policy_decision_ref=f"POL-SUG-{idempotency[:12].upper()}",
        )

    def _public(self, row: CEDASuggestion) -> dict:
        return {
            "id": row.id,
            "label": row.label,
            "editable_instruction": row.editable_instruction,
            "action_type": row.action_type,
            "reason": row.reason,
            "evidence_refs": list(row.evidence_refs_json or []),
            "confidence": round(float(row.confidence or 0), 2),
            "requires_confirmation": bool(row.requires_confirmation),
            "required_connector": row.required_connector,
            "status": row.status,
        }

    def _evidence_refs(self, files: list[UploadedFileReference], text: str) -> list[str]:
        refs: list[str] = []
        for index, file in enumerate(files[:3], start=1):
            document_id = file.stored_name or f"DOC-{hashlib.sha1(file.name.encode()).hexdigest()[:8].upper()}"
            if file.type.endswith("pdf") or file.name.lower().endswith(".pdf"):
                refs.append(f"{document_id}:page-1")
            elif "spreadsheet" in file.type or file.name.lower().endswith((".xlsx", ".csv")):
                refs.append(f"{document_id}:sheet-1")
            elif file.type.startswith("image/"):
                refs.append(f"{document_id}:ocr-region-1")
            else:
                refs.append(f"{document_id}:section-1")
        return refs or ["current-message"]

    def _greeting(self, surface: str, files: list[UploadedFileReference], approved_context: str, selected: list[tuple[CandidateSuggestion, ActionRegistryEntry]]) -> str:
        if files:
            names = ", ".join(file.name for file in files[:2])
            return f"I reviewed {names} and found evidence-backed next steps you can choose from."
        if approved_context:
            return "Welcome back. I found approved context that can help guide your next step."
        return "What would you like to work on next?"

    def _context_summary(self, files: list[UploadedFileReference], approved_context: str) -> str:
        if files:
            return "Current attachment plus authorized CEDA context were used. Extracted facts remain proposed until approved."
        if approved_context:
            return "Approved CEDA context only; no sensitive details are shown in the suggestion labels."
        return "No durable context was required for these suggestions."

    def _action_preview(self, suggestion: CEDASuggestion) -> dict:
        return {
            "suggestion_id": suggestion.id,
            "action_type": suggestion.action_type,
            "instruction": suggestion.editable_instruction,
            "evidence_refs": list(suggestion.evidence_refs_json or []),
            "requires_confirmation": bool(suggestion.requires_confirmation),
            "side_effect_before_confirmation": False,
        }


suggestion_service = SuggestionService()
