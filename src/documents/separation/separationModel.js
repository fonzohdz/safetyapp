/* ── Employee Separation data model ──
   The historical company document combines Employee Data Change and
   Employee Separation on one form. This app implements ONLY the
   separation portion — no address/phone/pay-rate/tax-withholding/
   benefits/loan/payroll-status fields, which belong to actual HR/payroll
   systems, not a safety documentation tool (see the mission brief's
   explicit scope boundary). Field names below cover exactly the
   separation-specific content: reason, explanation, discharge warning
   history, rehire eligibility, and supervisor/employee signatures. */

export const SEPARATION_SCHEMA_VERSION = 1;

function makeId() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export const SEPARATION_REASONS = [
  'Lack of Work',
  'Discharge',
  'Resignation',
  'No Call / No Show',
  'Leave of Absence',
  'Working Part-time',
  'Other',
];

export function emptySeparation() {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    schemaVersion: SEPARATION_SCHEMA_VERSION,
    status: 'draft', // 'draft' | 'ready' | 'completed'
    createdAt: now,
    lastSavedAt: '',
    completedAt: '',

    // Employee information
    employeeName: '',
    supervisor: '',
    position: '',
    separationDate: todayISO(),

    // Reason for separation
    separationReason: '', // one of SEPARATION_REASONS
    separationReasonOther: '',
    detailedExplanation: '',

    // If Discharge
    warningNoticesGiven: '', // '' | 'yes' | 'no'
    warningNoticesCount: '',

    // Rehire
    wouldRehire: '', // '' | 'yes' | 'no'

    // Signatures
    supervisorSignatureData: null,
    supervisorSignatureDate: '',
    employeeSignatureData: null,
    employeeSignatureDate: '',

    notes: '',
  };
}

export function hasMeaningfulSeparationContent(model) {
  if (!model) return false;
  return [
    model.employeeName, model.supervisor, model.detailedExplanation,
  ].some(v => String(v || '').trim().length > 0) || Boolean(model.separationReason);
}

export const SEPARATION_STEPS = [
  { id: 'details', label: 'Separation Details', helper: 'Employee info, reason, explanation, and signatures' },
  { id: 'review', label: 'Review & Export', helper: 'Save, generate, and share the PDF' },
];

export function getSeparationReadinessChecks(model) {
  const has = v => String(v || '').trim().length > 0;
  const checks = [
    { key: 'employeeName', label: 'Employee name', ok: has(model.employeeName) },
    { key: 'supervisor', label: 'Supervisor', ok: has(model.supervisor) },
    { key: 'separationDate', label: 'Separation date', ok: has(model.separationDate) },
    { key: 'separationReason', label: 'Reason for separation selected', ok: has(model.separationReason) },
    { key: 'detailedExplanation', label: 'Detailed explanation', ok: has(model.detailedExplanation) },
    { key: 'wouldRehire', label: 'Re-hire eligibility answered', ok: model.wouldRehire === 'yes' || model.wouldRehire === 'no' },
    { key: 'supervisorSignature', label: 'Supervisor signature', ok: Boolean(model.supervisorSignatureData) },
  ];
  if (model.separationReason === 'Other') {
    checks.push({ key: 'separationReasonOther', label: 'Other reason (specify)', ok: has(model.separationReasonOther) });
  }
  if (model.separationReason === 'Discharge') {
    checks.push({ key: 'warningNoticesGiven', label: 'Were warning notices given? (Yes/No)', ok: model.warningNoticesGiven === 'yes' || model.warningNoticesGiven === 'no' });
    if (model.warningNoticesGiven === 'yes') {
      checks.push({ key: 'warningNoticesCount', label: 'Number of warning notices given', ok: has(model.warningNoticesCount) });
    }
  }
  return checks;
}

export function isSeparationReady(model) {
  return getSeparationReadinessChecks(model).every(c => c.ok);
}

export function separationStepStatus(model, stepId) {
  const has = v => String(v || '').trim().length > 0;
  switch (stepId) {
    case 'details':
      return has(model.employeeName) && has(model.supervisor) && has(model.separationReason) && has(model.detailedExplanation) ? 'complete' : 'needs-info';
    case 'review':
      return isSeparationReady(model) ? 'complete' : 'needs-info';
    default:
      return 'needs-info';
  }
}

export function separationStepProgress(model) {
  const total = SEPARATION_STEPS.length - 1;
  const done = SEPARATION_STEPS.slice(0, -1).filter(s => separationStepStatus(model, s.id) === 'complete').length;
  return { done, total };
}

export function separationNextStepHint(model) {
  const next = SEPARATION_STEPS.find(s => separationStepStatus(model, s.id) !== 'complete');
  return next ? next.label : 'Review & Export';
}

export function isSeparationPrintFinal(model) {
  return model.status === 'ready' || model.status === 'completed';
}

export function buildSeparationExportName(model) {
  const name = (model.employeeName || 'Employee').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  const date = model.separationDate || todayISO();
  const draftSuffix = isSeparationPrintFinal(model) ? '' : '_DRAFT';
  return `${name}_EmployeeSeparation_${date}${draftSuffix}`;
}
