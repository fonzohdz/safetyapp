/* ── Employee Medical Event data model ──
   Field-for-field from the company Employee Medical Event form. This form
   documents an employee-reported medical condition/event WITHOUT the app
   ever automatically declaring it occupational — see the mission brief's
   explicit design rule: distinguish WHAT THE EMPLOYEE REPORTED from WHAT
   SAFETY/SUPERVISION OBSERVED, never infer causation, never determine OSHA
   recordability. Field names below reflect that split
   (reportedSymptoms/symptomsOnset/specificWorkEventReported are employee-
   reported; safetyObservations is what safety/supervision actually saw and
   did) so the distinction is structural, not just a UI label. */

export const MEDICAL_EVENT_SCHEMA_VERSION = 1;

function makeId() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowHM() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SYMPTOM_ONSET_OPTIONS = [
  { value: 'beforeWork', label: 'Before Work' },
  { value: 'duringWork', label: 'During Work' },
  { value: 'unknown', label: 'Unknown' },
];

export const RESPONSE_ACTIONS = [
  'Water / Electrolytes Offered',
  'Rest Period',
  'First Aid',
  'EMS Contacted',
  'Medical Evaluation Recommended',
  'Transport Provided',
  'Other',
];

export const MEDICAL_EVALUATION_TYPES = [
  { value: 'notRequested', label: 'Not Requested' },
  { value: 'personalVisit', label: 'Personal Medical Visit' },
  { value: 'emsER', label: 'EMS / Emergency Room' },
  { value: 'other', label: 'Other' },
];

export const WORK_STATUS_OPTIONS = [
  { value: 'fullDuty', label: 'Full Duty' },
  { value: 'restrictedDuty', label: 'Restricted Duty' },
  { value: 'offWork', label: 'Off Work Until' },
  { value: 'pending', label: 'Pending' },
];

export const INITIAL_CLASSIFICATIONS = [
  { value: 'nonOccupational', label: 'Non-Occupational Medical Event' },
  { value: 'workRelated', label: 'Work-Related / Incident Report Required' },
  { value: 'pendingReview', label: 'Pending Review' },
];

export function emptyMedicalEvent() {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    schemaVersion: MEDICAL_EVENT_SCHEMA_VERSION,
    status: 'draft', // 'draft' | 'ready' | 'completed'
    createdAt: now,
    lastSavedAt: '',
    completedAt: '',

    // Employee Information
    employeeName: '',
    supervisor: '',
    position: '',
    projectLocation: '',
    eventDate: todayISO(),
    timeReported: nowHM(),

    // Employee-Reported Condition
    reportedSymptoms: '',
    symptomsOnset: '', // '' | 'beforeWork' | 'duringWork' | 'unknown'
    specificWorkEventReported: '', // '' | 'yes' | 'no'
    workEventDescription: '',

    // Response / Actions Taken
    responseActions: [],
    responseActionsOther: '',
    safetyObservations: '', // what safety/supervision observed and did — never merged with employee-reported fields

    // Medical Evaluation / Work Status
    medicalEvaluationType: '', // '' | 'notRequested' | 'personalVisit' | 'emsER' | 'other'
    medicalEvaluationOther: '',
    clinicProvider: '',
    workStatus: '', // '' | 'fullDuty' | 'restrictedDuty' | 'offWork' | 'pending'
    offWorkUntilDate: '',
    providerNoteAttached: false,

    // Initial Classification (never auto-set by the app)
    initialClassification: '', // '' | 'nonOccupational' | 'workRelated' | 'pendingReview'

    // Signatures
    employeeSignatureData: null, // employee may not always be able to sign
    employeeSignatureDate: '',
    supervisorSignatureData: null,
    supervisorSignatureDate: '',

    notes: '',
  };
}

export function hasMeaningfulMedicalEventContent(model) {
  if (!model) return false;
  return [
    model.employeeName, model.supervisor, model.reportedSymptoms,
  ].some(v => String(v || '').trim().length > 0)
    || Boolean(model.symptomsOnset) || Boolean(model.specificWorkEventReported) || Boolean(model.initialClassification);
}

export const MEDICAL_EVENT_STEPS = [
  { id: 'condition', label: 'Event & Response', helper: 'Employee info, reported condition, and response taken' },
  { id: 'evaluation', label: 'Evaluation & Classification', helper: 'Medical evaluation, work status, and signatures' },
  { id: 'review', label: 'Review & Export', helper: 'Save, generate, and share the PDF' },
];

export function getMedicalEventReadinessChecks(model) {
  const has = v => String(v || '').trim().length > 0;
  const checks = [
    { key: 'employeeName', label: 'Employee name', ok: has(model.employeeName) },
    { key: 'supervisor', label: 'Supervisor', ok: has(model.supervisor) },
    { key: 'eventDate', label: 'Date', ok: has(model.eventDate) },
    { key: 'reportedSymptoms', label: 'Employee-reported symptoms / concerns', ok: has(model.reportedSymptoms) },
    { key: 'symptomsOnset', label: 'When symptoms first appeared', ok: has(model.symptomsOnset) },
    { key: 'specificWorkEventReported', label: 'Specific work event/exposure question answered', ok: has(model.specificWorkEventReported) },
    { key: 'initialClassification', label: 'Initial classification selected', ok: has(model.initialClassification) },
    { key: 'supervisorSignature', label: 'Supervisor / Safety signature', ok: Boolean(model.supervisorSignatureData) },
  ];
  if (model.specificWorkEventReported === 'yes') {
    checks.push({ key: 'workEventDescription', label: 'Work event/exposure description', ok: has(model.workEventDescription) });
  }
  if (model.workStatus === 'offWork') {
    checks.push({ key: 'offWorkUntilDate', label: '"Off Work Until" date', ok: has(model.offWorkUntilDate) });
  }
  return checks;
}

export function isMedicalEventReady(model) {
  return getMedicalEventReadinessChecks(model).every(c => c.ok);
}

export function medicalEventStepStatus(model, stepId) {
  const has = v => String(v || '').trim().length > 0;
  switch (stepId) {
    case 'condition':
      return has(model.employeeName) && has(model.supervisor) && has(model.reportedSymptoms) && has(model.symptomsOnset) && has(model.specificWorkEventReported) ? 'complete' : 'needs-info';
    case 'evaluation':
      return has(model.initialClassification) && Boolean(model.supervisorSignatureData) ? 'complete' : 'needs-info';
    case 'review':
      return isMedicalEventReady(model) ? 'complete' : 'needs-info';
    default:
      return 'needs-info';
  }
}

export function medicalEventStepProgress(model) {
  const total = MEDICAL_EVENT_STEPS.length - 1;
  const done = MEDICAL_EVENT_STEPS.slice(0, -1).filter(s => medicalEventStepStatus(model, s.id) === 'complete').length;
  return { done, total };
}

export function medicalEventNextStepHint(model) {
  const next = MEDICAL_EVENT_STEPS.find(s => medicalEventStepStatus(model, s.id) !== 'complete');
  return next ? next.label : 'Review & Export';
}

export function isMedicalEventPrintFinal(model) {
  return model.status === 'ready' || model.status === 'completed';
}

export function buildMedicalEventExportName(model) {
  const name = (model.employeeName || 'Employee').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  const date = model.eventDate || todayISO();
  const draftSuffix = isMedicalEventPrintFinal(model) ? '' : '_DRAFT';
  return `${name}_MedicalEvent_${date}${draftSuffix}`;
}
