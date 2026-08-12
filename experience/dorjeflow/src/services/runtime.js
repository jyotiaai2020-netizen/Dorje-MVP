
export const DEPLOYMENT_PROFILES = {
  local: {
    id: "local",
    label: "Local",
    database: "encrypted SQLite or device store",
    ai: "local model gateway",
    files: "encrypted local vault",
    sync: false
  },
  hybrid: {
    id: "hybrid",
    label: "Hybrid",
    database: "local source of truth plus selective synchronization",
    ai: "local-first with approved cloud escalation",
    files: "local vault plus encrypted object storage",
    sync: true
  },
  cloud: {
    id: "cloud",
    label: "Cloud SaaS",
    database: "tenant-isolated PostgreSQL or Base44 entities",
    ai: "capability gateway and scalable workers",
    files: "tenant-scoped object storage",
    sync: true
  }
};

export function getDeploymentProfile(mode = "local") {
  return DEPLOYMENT_PROFILES[mode] || DEPLOYMENT_PROFILES.local;
}

export function createCanonicalEnvelope(entityType, payload, options = {}) {
  const now = new Date().toISOString();
  return {
    entity_id: options.entityId || crypto.randomUUID(),
    entity_type: entityType,
    owner_id: options.ownerId || "local-user",
    source_type: options.sourceType || "user_entry",
    payload,
    sensitivity: options.sensitivity || "private",
    consent_state: options.consentState || "approved_for_local_use",
    sync_state: options.syncState || "local",
    revision: options.revision || 1,
    created_at: now,
    updated_at: now
  };
}

export function requiresConfirmation(actionType) {
  return ["calendar_write", "email_send", "file_share", "form_fill", "form_submit", "cloud_processing"].includes(actionType);
}