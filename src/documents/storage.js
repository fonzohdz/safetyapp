/* Generic namespaced draft storage for the four new field documents added
   in this mission (Disciplinary Notice, Uncontrolled Event, Medical Event,
   Separation). Mirrors incidentStorage.js's shape (safeJson parse-or-null,
   one localStorage key per document type, no cross-document migration)
   but is generic over the storage key so it isn't copy-pasted four times.

   Deliberately does NOT touch sdc.jsa.* or sdc.incident.* — those keep
   their own existing, unmodified storage modules. Each new document gets
   its own ".v1" key below; see docKeys() for the actual key names. */

function safeJson(raw, fallback) {
  if (raw == null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

/* Namespaced storage keys for each new document's single-draft slot.
   ".v1" suffix follows the same versioning convention as sdc.jsa.draft.v4
   / sdc.incident.draft.v1 — bump the suffix (not the value) if a shape
   change is ever incompatible with existing saved drafts. */
export const DOCUMENT_STORAGE_KEYS = {
  disciplinary: 'sdc.discipline.draft.v1',
  uncontrolledEvent: 'sdc.uncontrolled.draft.v1',
  medicalEvent: 'sdc.medical.draft.v1',
  separation: 'sdc.separation.draft.v1',
};

export function loadDraft(storageKey) {
  return safeJson(localStorage.getItem(storageKey), null);
}

export function saveDraft(storageKey, model) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(model));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(storageKey) {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}
