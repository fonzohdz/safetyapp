/* ── Employee Disciplinary Notice data model ──
   Field-for-field from the company Employee Disciplinary Notice form:
   employee/supervisor/position/date, a four-level warning checkbox, and
   seven numbered sections, then employee + manager signature/date. Wording
   and section order are transcribed from the mission brief's source
   description and must not be reworded or reordered without a deliberate
   content decision.

   This module owns the data shape only — no storage, no React, no PDF
   rendering — mirroring incidentModel.js's own separation of concerns. */

export const DISCIPLINARY_SCHEMA_VERSION = 1;

function makeId() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export const WARNING_LEVELS = [
  { value: 'verbal', label: 'Verbal Warning' },
  { value: 'written', label: 'Written Warning' },
  { value: 'secondWritten', label: '2nd Written Warning' },
  { value: 'final', label: 'Final Warning' },
];

export function warningLevelLabel(v) {
  return WARNING_LEVELS.find(w => w.value === v)?.label || '';
}

export function emptyDisciplinary() {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    schemaVersion: DISCIPLINARY_SCHEMA_VERSION,
    status: 'draft', // 'draft' | 'ready' | 'completed'
    createdAt: now,
    lastSavedAt: '',
    completedAt: '',

    // Employee information
    employeeName: '',
    supervisor: '',
    position: '',
    noticeDate: todayISO(),

    // Warning level (single-select)
    warningLevel: '', // '' | 'verbal' | 'written' | 'secondWritten' | 'final'

    // Seven numbered sections, verbatim order from the reference form
    whatOccurred: '', // 1. What occurred
    earlierWarnings: '', // 2. Earlier verbal or written warnings/discussions on this issue
    companyPolicyStates: '', // 3. Company policy states
    employeeStatement: '', // 4. Employee statement
    correctiveActionRequired: '', // 5. Corrective action that must be taken by the employee
    companyWill: '', // 6. The company will
    ifNotCorrected: '', // 7. If behavior is not corrected / performance does not improve

    // Signatures
    employeeSignatureData: null,
    employeeSignatureDate: '',
    managerSignatureData: null,
    managerSignatureDate: '',

    // Internal-only, never printed
    notes: '',
  };
}

// Every real user-entered field, not just a handful -- this drives the
// unsaved-changes guard on Start Blank/Start New, so a gap here means real
// field data can be silently wiped with no warning. Excludes noticeDate
// (defaults to today, never empty) and internal-only `notes`.
export function hasMeaningfulDisciplinaryContent(model) {
  if (!model) return false;
  return [
    model.employeeName, model.supervisor, model.position,
    model.whatOccurred, model.earlierWarnings, model.companyPolicyStates, model.employeeStatement,
    model.correctiveActionRequired, model.companyWill, model.ifNotCorrected,
  ].some(v => String(v || '').trim().length > 0)
    || Boolean(model.warningLevel)
    || Boolean(model.employeeSignatureData)
    || Boolean(model.managerSignatureData);
}

export const DISCIPLINARY_STEPS = [
  { id: 'notice', label: 'Notice Details', helper: 'Employee info, warning level, and what occurred' },
  { id: 'response', label: 'Corrective Action', helper: 'Required correction and signatures' },
  { id: 'review', label: 'Review & Export', helper: 'Save, generate, and share the PDF' },
];

export function getDisciplinaryReadinessChecks(model) {
  const has = v => String(v || '').trim().length > 0;
  return [
    { key: 'employeeName', label: 'Employee name', ok: has(model.employeeName), step: 'notice' },
    { key: 'supervisor', label: 'Supervisor', ok: has(model.supervisor), step: 'notice' },
    { key: 'noticeDate', label: 'Date', ok: has(model.noticeDate), step: 'notice' },
    { key: 'warningLevel', label: 'Warning level selected', ok: has(model.warningLevel), step: 'notice' },
    { key: 'whatOccurred', label: 'Section 1 — What occurred', ok: has(model.whatOccurred), step: 'notice' },
    { key: 'correctiveActionRequired', label: 'Section 5 — Corrective action required', ok: has(model.correctiveActionRequired), step: 'response' },
    { key: 'employeeSignature', label: 'Employee signature', ok: Boolean(model.employeeSignatureData), step: 'response' },
    { key: 'managerSignature', label: 'Manager signature', ok: Boolean(model.managerSignatureData), step: 'response' },
  ];
}

export function isDisciplinaryReady(model) {
  return getDisciplinaryReadinessChecks(model).every(c => c.ok);
}

export function disciplinaryStepStatus(model, stepId) {
  const has = v => String(v || '').trim().length > 0;
  switch (stepId) {
    case 'notice':
      return has(model.employeeName) && has(model.supervisor) && Boolean(model.warningLevel) && has(model.whatOccurred) ? 'complete' : 'needs-info';
    case 'response':
      return has(model.correctiveActionRequired) && model.employeeSignatureData && model.managerSignatureData ? 'complete' : 'needs-info';
    case 'review':
      return isDisciplinaryReady(model) ? 'complete' : 'needs-info';
    default:
      return 'needs-info';
  }
}

export function disciplinaryStepProgress(model) {
  const total = DISCIPLINARY_STEPS.length - 1;
  const done = DISCIPLINARY_STEPS.slice(0, -1).filter(s => disciplinaryStepStatus(model, s.id) === 'complete').length;
  return { done, total };
}

export function disciplinaryNextStepHint(model) {
  const next = DISCIPLINARY_STEPS.find(s => disciplinaryStepStatus(model, s.id) !== 'complete');
  return next ? next.label : 'Review & Export';
}

/* "Final" print state mirrors Incident's own status gate — 'ready' and
   'completed' print identically un-watermarked; editing a printed field
   after either reverts to 'draft' (see useDraftDocument's upd()). */
export function isDisciplinaryPrintFinal(model) {
  return model.status === 'ready' || model.status === 'completed';
}

export function buildDisciplinaryExportName(model) {
  const name = (model.employeeName || 'Employee').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  const date = model.noticeDate || todayISO();
  const draftSuffix = isDisciplinaryPrintFinal(model) ? '' : '_DRAFT';
  return `${name}_DisciplinaryNotice_${date}${draftSuffix}`;
}
