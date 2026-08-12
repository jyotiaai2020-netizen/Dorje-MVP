from enum import Enum
from typing import Any

try:
    from app.services.device_profile import ConnectivityMode, normalize_connectivity_mode
    from app.services.tier_policy import TierName, normalize_tier
except Exception:  # lightweight test fallback when optional backend deps are unavailable
    class ConnectivityMode(str, Enum):
        OFFLINE = "offline"
        HYBRID = "hybrid"
        ONLINE = "online"

    class TierName(str, Enum):
        FREE = "free"
        PAID = "paid"
        ENTERPRISE = "enterprise"

    def normalize_connectivity_mode(value=None):
        try:
            return ConnectivityMode(str(value or ConnectivityMode.HYBRID.value).lower())
        except ValueError:
            return ConnectivityMode.HYBRID

    def normalize_tier(value=None):
        try:
            return TierName(str(value or TierName.FREE.value).lower())
        except ValueError:
            return TierName.FREE


class MemoryClass(str, Enum):
    TEMPORARY = "temporary"
    SESSION = "session"
    WORKSPACE = "workspace"
    DURABLE = "durable"
    SENSITIVE = "sensitive"


SENSITIVE_TERMS = {
    "password",
    "passcode",
    "secret",
    "client_secret",
    "api key",
    "token",
    "ssn",
    "social security",
    "private key",
}


def normalize_memory_class(value: MemoryClass | str | None) -> MemoryClass:
    if isinstance(value, MemoryClass):
        return value
    try:
        return MemoryClass(str(value or MemoryClass.TEMPORARY.value).lower())
    except ValueError:
        return MemoryClass.TEMPORARY


class MemoryPolicyEngine:
    """Govern whether an extracted memory can outlive the current interaction."""

    def classify(self, payload: dict[str, Any]) -> MemoryClass:
        explicit = payload.get("memory_class")
        if explicit:
            return normalize_memory_class(str(explicit))
        text = " ".join(
            str(payload.get(key) or "")
            for key in ("summary", "content", "text", "user_statement", "stored_instruction")
        ).lower()
        if any(term in text for term in SENSITIVE_TERMS):
            return MemoryClass.SENSITIVE
        if payload.get("project_id") or payload.get("document_id") or payload.get("task_id") or payload.get("note_id"):
            return MemoryClass.WORKSPACE
        if payload.get("approved") or payload.get("user_approved") or payload.get("explicit_memory_setting"):
            return MemoryClass.DURABLE
        if payload.get("session_id"):
            return MemoryClass.SESSION
        return MemoryClass.TEMPORARY

    def evaluate(
        self,
        payload: dict[str, Any],
        memory_class: MemoryClass | str | None = None,
        *,
        user_approved: bool = False,
        explicit_memory_setting: bool = False,
        connectivity_mode: ConnectivityMode | str | None = None,
        tier: TierName | str | None = None,
        tenant_id: str | int | None = None,
        role: str | None = None,
    ) -> dict[str, Any]:
        selected = normalize_memory_class(memory_class) if memory_class else self.classify(payload)
        normalized_connectivity = normalize_connectivity_mode(connectivity_mode)
        normalized_tier = normalize_tier(tier)
        approved = bool(
            user_approved
            or explicit_memory_setting
            or payload.get("approved")
            or payload.get("user_approved")
            or payload.get("explicit_memory_setting")
            or str(payload.get("status") or "").lower() in {"approved", "active"}
        )
        policy = str(payload.get("policy_applied") or payload.get("policy") or "").strip()
        workspace_ref = bool(payload.get("project_id") or payload.get("document_id") or payload.get("task_id") or payload.get("note_id"))

        allowed = True
        reason = "Memory allowed by class policy."
        expires = "interaction_end"
        requires_user_approval = False
        requires_workspace_reference = False

        if selected == MemoryClass.TEMPORARY:
            expires = "interaction_end"
            reason = "Temporary memory expires after the current interaction."
        elif selected == MemoryClass.SESSION:
            expires = "session_end"
            reason = "Session memory expires after the active session."
        elif selected == MemoryClass.WORKSPACE:
            expires = "workspace_lifecycle"
            requires_workspace_reference = not workspace_ref
            allowed = workspace_ref
            reason = (
                "Workspace memory is attached to a project, note, task, or document."
                if allowed
                else "Workspace memory requires a project, note, task, or document reference."
            )
        elif selected == MemoryClass.DURABLE:
            expires = "policy_retention"
            requires_user_approval = True
            allowed = approved and bool(policy)
            reason = (
                "Durable memory is policy-approved by the user."
                if allowed
                else "Durable memory requires user approval or an explicit memory setting plus an applied policy."
            )
        elif selected == MemoryClass.SENSITIVE:
            allowed = False
            expires = "never"
            requires_user_approval = True
            reason = "Sensitive memory must not be stored automatically."

        encryption_required = normalized_connectivity == ConnectivityMode.OFFLINE or selected in {
            MemoryClass.WORKSPACE,
            MemoryClass.DURABLE,
            MemoryClass.SENSITIVE,
        }
        return {
            "allowed": allowed,
            "memory_class": selected.value,
            "reason": reason,
            "expires": expires,
            "requires_user_approval": requires_user_approval,
            "requires_workspace_reference": requires_workspace_reference,
            "policy_applied": policy or None,
            "encrypted_local_storage_required": encryption_required,
            "storage_mode": "encrypted_local" if encryption_required else "transient",
            "tenant_boundary_required": normalized_tier == TierName.ENTERPRISE,
            "role_boundary_required": normalized_tier == TierName.ENTERPRISE,
            "tenant_id": str(tenant_id) if tenant_id is not None else None,
            "role": role,
        }

    def evaluate_durable_memory(self, payload: dict[str, Any]) -> dict[str, Any]:
        decision = self.evaluate(payload, MemoryClass.DURABLE)
        return {
            "allowed": decision["allowed"],
            "reason": "policy-approved durable memory" if decision["allowed"] else decision["reason"],
            "requires_policy_engine": True,
            "policy_applied": decision["policy_applied"],
        }

    def catalog(self, connectivity_mode: ConnectivityMode | str | None = None, tier: TierName | str | None = None) -> dict[str, Any]:
        samples = [
            self.evaluate({}, MemoryClass.TEMPORARY, connectivity_mode=connectivity_mode, tier=tier),
            self.evaluate({}, MemoryClass.SESSION, connectivity_mode=connectivity_mode, tier=tier),
            self.evaluate({"project_id": "example"}, MemoryClass.WORKSPACE, connectivity_mode=connectivity_mode, tier=tier),
            self.evaluate({"policy_applied": "user_approved_context", "approved": True}, MemoryClass.DURABLE, connectivity_mode=connectivity_mode, tier=tier),
            self.evaluate({"summary": "password"}, MemoryClass.SENSITIVE, connectivity_mode=connectivity_mode, tier=tier),
        ]
        return {
            "classes": samples,
            "rules": {
                "temporary": "Expires after the current interaction.",
                "session": "Expires after the active session.",
                "workspace": "Must belong to a project, note, task, or document.",
                "durable": "Requires user approval or an explicit memory setting.",
                "sensitive": "Never stored automatically.",
                "offline": "Offline memory remains encrypted locally when possible.",
                "enterprise": "Enterprise memory respects tenant and role boundaries.",
            },
        }


memory_policy_engine = MemoryPolicyEngine()
