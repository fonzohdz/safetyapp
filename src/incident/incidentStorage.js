/* Incident Report storage. Completely separate localStorage keys from the
   JSA module (sdc.jsa.*) -- must never read or write JSA keys, and vice
   versa. Versioned the same way the JSA storage is (".v1" suffix, no
   migration logic yet -- bump the suffix if the shape ever changes
   incompatibly). */

export const INCIDENT_KEYS = {
  draft: 'sdc.incident.draft.v1',
  records: 'sdc.incident.records.v1',
};

function safeJson(raw, fallback) {
  if (raw == null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function loadIncidentDraft() {
  const raw = localStorage.getItem(INCIDENT_KEYS.draft);
  return safeJson(raw, null);
}

export function saveIncidentDraft(incident) {
  try {
    localStorage.setItem(INCIDENT_KEYS.draft, JSON.stringify(incident));
    return true;
  } catch {
    return false;
  }
}

export function clearIncidentDraft() {
  try {
    localStorage.removeItem(INCIDENT_KEYS.draft);
  } catch {
    /* ignore */
  }
}

export function loadIncidentRecords() {
  const raw = localStorage.getItem(INCIDENT_KEYS.records);
  const list = safeJson(raw, []);
  return Array.isArray(list) ? list : [];
}

/* Upserts a lightweight metadata record (not the full incident) whenever a
   final, non-draft PDF is successfully generated. This is metadata-only
   preservation, not a full records browser -- see project notes. */
export function upsertIncidentRecord(incident, extra = {}) {
  const records = loadIncidentRecords();
  const meta = {
    id: incident.id,
    reportNumber: incident.reportNumber || '',
    workplaceLocation: incident.workplaceLocation || '',
    incidentDate: incident.incidentDate || '',
    status: incident.status,
    completedAt: incident.completedAt || '',
    pageCount: extra.pageCount || null,
  };
  const idx = records.findIndex(r => r.id === incident.id);
  if (idx >= 0) records[idx] = meta;
  else records.push(meta);
  try {
    localStorage.setItem(INCIDENT_KEYS.records, JSON.stringify(records));
  } catch {
    /* ignore -- non-fatal, the draft itself already persisted */
  }
  return records;
}
