/* ── Uncontrolled Event Report data model ──
   Field-for-field from the company Uncontrolled Event Report form: event
   information, classification, outcome/impact, a narrative, notifications/
   attachments, witnesses, and Reported By / Supervisor Review signatures.
   Lighter/faster than the full Incident Report by design — see the mission
   brief's own framing ("This should feel lighter/faster than the full
   Incident Report"). Mirrors incidentModel.js's separation of concerns:
   data shape only, no storage/React/PDF code here. */

export const UNCONTROLLED_EVENT_SCHEMA_VERSION = 1;

function makeId() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function localDateTimeNow() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const EVENT_CLASSIFICATIONS = [
  'Weather / Natural',
  'Utility / Power / Communications',
  'Third-Party Traffic / Public / Delivery',
  'Equipment / Mechanical Failure (not misuse)',
  'Site Condition Change',
  'Medical Event / Illness (non-occupational)',
  'Wildlife / Environmental',
  'Other',
];

export const EVENT_OUTCOMES = [
  'Near Miss',
  'Operational Delay / Shutdown',
  'Property Damage',
  'Environmental Release / Spill',
  'Injury / Illness',
  'Security / Trespass',
  'Other',
];

export const NOTIFICATION_OPTIONS = [
  'Supervisor',
  'Safety',
  'Client / GC',
  'EMS',
  'Utility Provider',
  'Environmental',
];

export const ATTACHMENT_OPTIONS = [
  'Photos',
  'Video',
  'Weather Report',
  'Maintenance Records',
  'Other',
];

export function emptyUncontrolledEvent() {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    schemaVersion: UNCONTROLLED_EVENT_SCHEMA_VERSION,
    status: 'draft', // 'draft' | 'ready' | 'completed'
    createdAt: now,
    lastSavedAt: '',
    completedAt: '',

    // Event Information
    workplaceLocation: '',
    eventDate: todayISO(),
    weatherConditions: '',
    reportWrittenDateTime: localDateTimeNow(),
    reportedToSupervisorDateTime: '',

    // Event Classification (check all that apply)
    eventClassifications: [],
    eventClassificationOther: '',

    // Outcome / Impact (check all that apply)
    eventOutcomes: [],
    eventOutcomeOther: '',
    estimatedCost: '',

    // Narrative
    whatHappened: '',
    immediateActionsTaken: '',

    // Notifications / Attachments (check all that apply)
    notifications: [],
    attachments: [],
    attachmentOther: '',
    witnesses: '', // free text — names, one per line

    // Reported By
    reportedByName: '',
    reportedByTitle: '',
    reportedBySignatureData: null,
    reportedBySignatureDate: '',

    // Supervisor Review
    supervisorReviewName: '',
    supervisorSignatureData: null,
    supervisorSignatureDate: '',

    notes: '',
  };
}

// Every real user-entered field, not just a handful -- this drives the
// unsaved-changes guard on Start Blank/Start New, so a gap here means real
// field data can be silently wiped with no warning. Excludes eventDate/
// reportWrittenDateTime (default to today/now, never empty) and internal-only
// `notes`.
export function hasMeaningfulUncontrolledEventContent(model) {
  if (!model) return false;
  return [
    model.workplaceLocation, model.weatherConditions, model.reportedToSupervisorDateTime,
    model.eventClassificationOther, model.eventOutcomeOther, model.estimatedCost,
    model.whatHappened, model.immediateActionsTaken, model.attachmentOther, model.witnesses,
    model.reportedByName, model.reportedByTitle, model.supervisorReviewName,
  ].some(v => String(v || '').trim().length > 0)
    || (model.eventClassifications || []).length > 0
    || (model.eventOutcomes || []).length > 0
    || (model.notifications || []).length > 0
    || (model.attachments || []).length > 0
    || Boolean(model.reportedBySignatureData) || Boolean(model.supervisorSignatureData);
}

export const UNCONTROLLED_EVENT_STEPS = [
  { id: 'event', label: 'Event Info & Classification', helper: 'Where/when it happened, classification, and outcome' },
  { id: 'narrative', label: 'Narrative & Notifications', helper: 'What happened, who was notified, and signatures' },
  { id: 'review', label: 'Review & Export', helper: 'Save, generate, and share the PDF' },
];

export function getUncontrolledEventReadinessChecks(model) {
  const has = v => String(v || '').trim().length > 0;
  const checks = [
    { key: 'workplaceLocation', label: 'Workplace location / project', ok: has(model.workplaceLocation), step: 'event' },
    { key: 'eventDate', label: 'Date of event', ok: has(model.eventDate), step: 'event' },
    { key: 'eventClassifications', label: 'At least one event classification selected', ok: (model.eventClassifications || []).length > 0, step: 'event' },
    { key: 'eventOutcomes', label: 'At least one outcome/impact selected', ok: (model.eventOutcomes || []).length > 0, step: 'event' },
    { key: 'whatHappened', label: 'What happened / summary', ok: has(model.whatHappened), step: 'narrative' },
    { key: 'reportedByName', label: 'Reported by name', ok: has(model.reportedByName), step: 'narrative' },
    { key: 'reportedBySignature', label: 'Reported by signature', ok: Boolean(model.reportedBySignatureData), step: 'narrative' },
  ];
  if ((model.eventClassifications || []).includes('Other')) {
    checks.push({ key: 'eventClassificationOther', label: 'Other classification (specify)', ok: has(model.eventClassificationOther), step: 'event' });
  }
  if ((model.eventOutcomes || []).includes('Other')) {
    checks.push({ key: 'eventOutcomeOther', label: 'Other outcome (specify)', ok: has(model.eventOutcomeOther), step: 'event' });
  }
  return checks;
}

export function isUncontrolledEventReady(model) {
  return getUncontrolledEventReadinessChecks(model).every(c => c.ok);
}

// Derived directly from getUncontrolledEventReadinessChecks (each check
// already carries the step it belongs to) rather than a second, separately
// hand-picked field list -- the two had drifted (e.g. this considered
// "event" complete without checking the conditionally-required "Other"
// specify fields for classification/outcome).
export function uncontrolledEventStepStatus(model, stepId) {
  if (stepId === 'review') return isUncontrolledEventReady(model) ? 'complete' : 'needs-info';
  const relevant = getUncontrolledEventReadinessChecks(model).filter(c => c.step === stepId);
  if (!relevant.length) return 'complete';
  return relevant.every(c => c.ok) ? 'complete' : 'needs-info';
}

export function uncontrolledEventStepProgress(model) {
  const total = UNCONTROLLED_EVENT_STEPS.length - 1;
  const done = UNCONTROLLED_EVENT_STEPS.slice(0, -1).filter(s => uncontrolledEventStepStatus(model, s.id) === 'complete').length;
  return { done, total };
}

export function uncontrolledEventNextStepHint(model) {
  const next = UNCONTROLLED_EVENT_STEPS.find(s => uncontrolledEventStepStatus(model, s.id) !== 'complete');
  return next ? next.label : 'Review & Export';
}

export function isUncontrolledEventPrintFinal(model) {
  return model.status === 'ready' || model.status === 'completed';
}

export function buildUncontrolledEventExportName(model) {
  const site = (model.workplaceLocation || 'Site').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  const date = model.eventDate || todayISO();
  const draftSuffix = isUncontrolledEventPrintFinal(model) ? '' : '_DRAFT';
  return `${site}_UncontrolledEventReport_${date}${draftSuffix}`;
}
