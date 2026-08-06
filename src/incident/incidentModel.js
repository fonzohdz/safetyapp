/* ── Incident Report data model ──
   Mirrors the reference document ("SCH Blank incident report (1).docx")
   field-for-field: labels, option wording, and section order below are
   transcribed directly from that source and must not be silently edited,
   reworded, or "corrected". If the reference wording ever needs to change,
   that is a deliberate content decision, not a refactor.

   This module owns the incident data shape only -- no storage, no React,
   no PDF rendering -- so it can be imported anywhere (workflow, PDF
   renderer, verification fixtures) without pulling in unrelated code. */

export const INCIDENT_SCHEMA_VERSION = 1;

function makeId() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* ── Nature of Injury (reference: "Nature of Injury (circle one)") ──
   The reference document uses a single-circle selection; this app
   deliberately uses multi-select instead (explicitly directed in the
   product spec for this module, not a silent deviation) because more than
   one injury type is common in practice. Wording/order is unchanged. */
export const INJURY_NATURE_OPTIONS = [
  'Sprain/strain',
  'Fracture',
  'Laceration/cut',
  'Bruising',
  'Scratch/abrasion',
  'Amputation',
  'Dislocation',
  'Internal',
  'Burn/scald',
  'Foreign body',
  'Chemical reaction',
  'Allergic reaction',
  'Concussion',
  'Heat-related illness',
  'Other',
];

/* ── Cause analysis (reference: "WHY DID THE INCIDENT OCCUR?") ──
   Three parallel columns, each 15 named causes + "Other". Item wording and
   order match the reference table exactly. */
export const CAUSE_CATEGORIES = [
  {
    id: 'unsafeActs',
    label: 'Unsafe Acts',
    otherField: 'unsafeActsOther',
    items: [
      'Improper work technique',
      'Improper type PPE or use of it',
      'Safety rule violation',
      'Operation without authorization',
      'Failure to warn or secure',
      'Operating at improper speeds',
      'Bypassing safety devices',
      'Guards not used',
      'Improper loading or placement',
      'Improper lifting',
      'Servicing/adjusting machinery',
      'Horseplay',
      'Drug or alcohol use',
      'Unsafe act(s) of others',
      'Unnecessary haste/rush',
      'Other',
    ],
  },
  {
    id: 'unsafeConditions',
    label: 'Unsafe Conditions',
    otherField: 'unsafeConditionsOther',
    items: [
      'Poor workstation design/layout',
      'Fire or explosion hazard',
      'Congested work area',
      'Hazardous substances',
      'Inadequate ventilation',
      'Improper material storage',
      'Improper tool or equipment',
      'Insufficient job knowledge',
      'Slippery conditions',
      'Poor housekeeping',
      'Excessive noise',
      'Inadequate guarding of hazards',
      'Defective tools/equipment',
      'Insufficient lighting',
      'Inadequate fall protection',
      'Other',
    ],
  },
  {
    id: 'managementDeficiencies',
    label: 'Management System Deficiencies',
    otherField: 'managementDeficienciesOther',
    items: [
      'Lack of written procedures/safety rules',
      'Safety rules not enforced',
      'Hazards not identified',
      'PPE unavailable',
      'Insufficient worker training',
      'Insufficient supervisor training',
      'Improper maintenance',
      'Inadequate supervision',
      'Insufficient job planning',
      'Inadequate hiring practices',
      'Poor process design',
      'Inadequate workplace inspection',
      'Inadequate equipment',
      'Unsafe design or construction',
      'Unrealistic scheduling',
      'Other',
    ],
  },
];

/* Stable selection key for a single cause item -- used in selectedCauses
   and primaryCause. Not shown to the user, just an internal identifier. */
export function causeKey(categoryId, item) {
  return `${categoryId}::${item}`;
}

export function emptyWitness() {
  return {
    id: makeId(),
    name: '',
    company: '',
    supervisor: '',
    phone: '',
    email: '',
    statement: '',
    signatureData: null,
    signatureDate: '',
  };
}

export function emptyTeamMember() {
  return {
    id: makeId(),
    name: '',
    title: '',
    signatureData: null,
    date: '',
  };
}

/* The canonical shape of an Incident Report. Every field the reference
   document prints (or that this app's approved deviations add, e.g.
   multi-select injury nature) lives here so nothing is invented ad hoc in
   the workflow or PDF renderer. */
export function emptyIncident() {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    schemaVersion: INCIDENT_SCHEMA_VERSION,
    status: 'draft', // 'draft' | 'ready' | 'completed'
    createdAt: now,
    lastSavedAt: '',
    completedAt: '',
    reportNumber: '',

    // PAGE 1 -- Incident information
    workplaceLocation: '',
    incidentDate: '',
    incidentTime: '',
    writtenReportDateTime: localDateTimeNow(),
    reportedToSupervisorDateTime: '',
    investigatorName: '',
    investigatorTitle: '',
    investigatorPhone: '',
    investigatorEmail: '',
    incidentSpecificLocation: '',
    detailedIncidentDescription: '',

    // PAGE 2 -- Injury
    injuryOccurred: 'unselected', // 'yes' | 'no' | 'unselected'
    injuredPartyName: '',
    injuredPartyTitle: '',
    injuredPartyYearsWithCompany: '',
    injuredPartyCurrentTrade: '',
    injuredPartyPhone: '',
    injuredPartyEmail: '',
    injuryNature: [],
    injuryNatureOther: '',
    bodyPartsAffectedText: '',
    treatmentLevel: 'unselected', // 'firstAid' | 'beyondFirstAid' | 'unselected'
    treatingPhysicianOrClinic: '',
    injuryRemarks: '',
    bodyDiagramMarks: [], // [{ id, xPct, yPct }]

    // PAGE 3-4 -- Witnesses (max 3)
    witnesses: [],

    // PAGE 4 -- Property damage
    propertyDamageOccurred: 'unselected', // 'yes' | 'no' | 'unselected'
    propertyOrMaterialDamaged: '',
    natureOfDamage: '',
    objectMachineToolOrSubstance: '',
    approximateDamageCost: '',

    // PAGE 5 -- Cause analysis
    selectedCauses: [], // [causeKey, ...]
    primaryCause: null, // causeKey | null
    unsafeActsOther: '',
    unsafeConditionsOther: '',
    managementDeficienciesOther: '',

    // PAGE 6 -- Notes and investigation team
    supervisorNotes: '',
    safetyConsultantNotes: '',
    investigationTeam: [], // max 4, see emptyTeamMember()

    // Internal-only, never printed (mirrors the JSA's "notes" field)
    notes: '',
  };
}

function localDateTimeNow() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function hasMeaningfulIncidentContent(incident) {
  if (!incident) return false;
  return [
    incident.workplaceLocation,
    incident.incidentDate,
    incident.incidentSpecificLocation,
    incident.detailedIncidentDescription,
    incident.investigatorName,
  ].some(v => String(v || '').trim().length > 0)
    || incident.injuryOccurred !== 'unselected'
    || incident.propertyDamageOccurred !== 'unselected'
    || (incident.witnesses || []).length > 0
    || (incident.selectedCauses || []).length > 0
    || (incident.investigationTeam || []).length > 0;
}

/* Readiness checks for "Ready" / final (non-draft) status and export --
   exactly the list specified for this module. Safety Consultant Notes and
   witnesses are intentionally excluded (optional). */
export function getIncidentReadinessChecks(incident) {
  const has = v => String(v || '').trim().length > 0;
  return [
    { key: 'workplaceLocation', label: 'Workplace location', ok: has(incident.workplaceLocation) },
    { key: 'incidentDate', label: 'Incident date', ok: has(incident.incidentDate) },
    { key: 'incidentTime', label: 'Incident time', ok: has(incident.incidentTime) },
    { key: 'writtenReportDateTime', label: 'Written report date/time', ok: has(incident.writtenReportDateTime) },
    { key: 'reportedToSupervisorDateTime', label: 'Reported-to-supervisor date/time', ok: has(incident.reportedToSupervisorDateTime) },
    { key: 'investigatorName', label: 'Investigator name', ok: has(incident.investigatorName) },
    { key: 'investigatorTitle', label: 'Investigator title', ok: has(incident.investigatorTitle) },
    { key: 'investigatorContact', label: 'Investigator phone or email', ok: has(incident.investigatorPhone) || has(incident.investigatorEmail) },
    { key: 'incidentSpecificLocation', label: 'Exact incident location', ok: has(incident.incidentSpecificLocation) },
    { key: 'detailedIncidentDescription', label: 'Detailed incident description', ok: has(incident.detailedIncidentDescription) },
    { key: 'injuryOccurred', label: 'Injury Yes/No selected', ok: incident.injuryOccurred === 'yes' || incident.injuryOccurred === 'no' },
    { key: 'propertyDamageOccurred', label: 'Property Damage Yes/No selected', ok: incident.propertyDamageOccurred === 'yes' || incident.propertyDamageOccurred === 'no' },
    { key: 'cause', label: 'At least one cause selected', ok: (incident.selectedCauses || []).length > 0 },
    { key: 'supervisorNotes', label: 'Supervisor notes', ok: has(incident.supervisorNotes) },
    { key: 'investigationTeam', label: 'At least one investigation-team member', ok: (incident.investigationTeam || []).some(m => has(m.name)) },
  ];
}

export function isIncidentReady(incident) {
  return getIncidentReadinessChecks(incident).every(c => c.ok);
}

export const INCIDENT_STEPS = [
  { id: 'details', label: 'Incident Details', helper: 'Location, timing, and description' },
  { id: 'injury', label: 'Injury', helper: 'Injured party and injury details' },
  { id: 'witnesses', label: 'Witnesses', helper: 'Up to 3 witness statements' },
  { id: 'property', label: 'Property Damage', helper: 'Damaged property and cost' },
  { id: 'cause', label: 'Cause Analysis', helper: 'Unsafe acts, conditions, and management factors' },
  { id: 'notes', label: 'Notes & Team', helper: 'Summaries and investigation team' },
  { id: 'review', label: 'Review & Export', helper: 'Save, generate, and share the PDF' },
];

export function incidentStepStatus(incident, stepId) {
  const has = v => String(v || '').trim().length > 0;
  switch (stepId) {
    case 'details':
      return has(incident.workplaceLocation) && has(incident.incidentDate) && has(incident.detailedIncidentDescription) ? 'complete' : 'needs-info';
    case 'injury':
      return incident.injuryOccurred === 'yes' || incident.injuryOccurred === 'no' ? 'complete' : 'needs-info';
    case 'witnesses':
      return 'complete'; // always optional
    case 'property':
      return incident.propertyDamageOccurred === 'yes' || incident.propertyDamageOccurred === 'no' ? 'complete' : 'needs-info';
    case 'cause':
      return (incident.selectedCauses || []).length > 0 ? 'complete' : 'needs-info';
    case 'notes':
      return has(incident.supervisorNotes) && (incident.investigationTeam || []).some(m => has(m.name)) ? 'complete' : 'needs-info';
    case 'review':
      return isIncidentReady(incident) ? 'complete' : 'needs-info';
    default:
      return 'needs-info';
  }
}

export function incidentStepProgress(incident) {
  const total = INCIDENT_STEPS.length - 1; // exclude review itself
  const done = INCIDENT_STEPS.slice(0, -1).filter(s => incidentStepStatus(incident, s.id) === 'complete').length;
  return { done, total };
}

export function incidentNextStepHint(incident) {
  const next = INCIDENT_STEPS.find(s => incidentStepStatus(incident, s.id) !== 'complete');
  return next ? next.label : 'Review & Export';
}
