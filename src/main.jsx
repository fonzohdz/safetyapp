import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

/* ── Storage keys ── */
const KEYS = {
  draft: 'sdc.jsa.draft.v4',
  templates: 'sdc.jsa.templates.v1',
  settings: 'sdc.settings.v2',
};

const APP_NAME = 'Safety Documentation Center';
const APP_SUB = 'Field Safety App';
const SHACKELFORD_LOGO = `${import.meta.env.BASE_URL}icons/shackelford-logo.webp`;
const APP_VERSION = '1.0.4-safe-upgrade';
// Fixed at build time by vite.config.js (`define`) — never the visitor's clock.
// Distinct from the draft "last saved" timestamp, which is user-data and browser-time.
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
const BUILD_COMMIT = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : '';

/* ── Helpers ── */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function nowNice(d = new Date()) {
  const v = d instanceof Date ? d : new Date(d);
  return v.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function buildStamp(iso, commit) {
  if (!iso) return '';
  const d = new Date(iso);
  const datePart = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Updated ${datePart} · ${timePart}${commit ? ` · ${commit}` : ''}`;
}
function safeJson(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}
function dateStr(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}
function hasText(v) { return Boolean(String(v || '').trim()); }
function splitLines(v) {
  return String(v || '').split(/\n|;/).map(s => s.trim()).filter(Boolean);
}
function normalizeEntry(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function entryTokens(value) {
  const stop = new Set(['a','an','and','as','at','for','from','in','into','of','on','or','the','to','when','where','with']);
  return normalizeEntry(value).split(' ').filter(token => token.length > 2 && !stop.has(token));
}
function isNearDuplicate(a, b) {
  const na = normalizeEntry(a);
  const nb = normalizeEntry(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (Math.min(na.length, nb.length) >= 12 && (na.includes(nb) || nb.includes(na))) return true;
  const aa = new Set(entryTokens(a));
  const bb = new Set(entryTokens(b));
  if (!aa.size || !bb.size) return false;
  const intersection = [...aa].filter(token => bb.has(token)).length;
  const union = new Set([...aa, ...bb]).size;
  return union > 0 && intersection / union >= 0.82;
}
function mergeUniqueEntries(existingValue, candidates) {
  const existing = splitLines(existingValue);
  const added = [];
  const skipped = [];
  (Array.isArray(candidates) ? candidates : [candidates]).forEach(candidate => {
    const text = String(candidate || '').trim();
    if (!text) return;
    const match = [...existing, ...added].find(item => isNearDuplicate(item, text));
    if (match) skipped.push({ candidate: text, match });
    else added.push(text);
  });
  return {
    value: [...existing, ...added].join('\n'),
    added,
    skipped,
  };
}
function dedupeList(items) {
  return mergeUniqueEntries('', items).added;
}
function isGenericRow(row) {
  const s = String(row?.step || '').trim().toLowerCase();
  return !s || s === 'daily tasks as discussed during tailgate meeting' || s === 'daily tasks as discussed during the tailgate meeting';
}
function rowsFromSummary(jsa) {
  const steps = splitLines(jsa.dailyTasks);
  const haz = splitLines(jsa.hazardsSummary);
  const con = splitLines(jsa.controlsSummary);
  const n = Math.max(steps.length, haz.length, con.length);
  if (!n) return [];
  return Array.from({ length: n }, (_, i) => ({ step: steps[i] || '', hazards: haz[i] || '', controls: con[i] || '' }));
}
function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter(r => hasText(r.step) || hasText(r.hazards) || hasText(r.controls));
}
function getContentRows(jsa) {
  const detailed = normalizeRows(jsa.taskRows).filter(row => !isGenericRow(row));
  const summary = rowsFromSummary(jsa);
  if (!detailed.length) return summary;
  const remainingSummary = summary.filter(row => {
    if (!hasText(row.step)) return hasText(row.hazards) || hasText(row.controls);
    return !detailed.some(detail => isNearDuplicate(detail.step, row.step));
  });
  return [...detailed, ...remainingSummary];
}
function estimateTextLines(value, charsPerLine) {
  const text = String(value || '');
  if (!text.trim()) return 1;
  return text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
}
function estimateRowUnits(row) {
  return Math.max(
    estimateTextLines(row.step, 44),
    estimateTextLines(row.hazards, 58),
    estimateTextLines(row.controls, 66),
    1,
  );
}
function mainRowCapacity() { return 22; }
function continuationRowCapacity() { return 32; }
function paginateRowsByUnits(rows, capacity) {
  const pages = [];
  let current = [];
  let used = 0;
  let oversized = false;
  rows.forEach(row => {
    const units = estimateRowUnits(row);
    if (units > capacity) oversized = true;
    if (current.length && used + units > capacity) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(row);
    used += units;
  });
  if (current.length) pages.push(current);
  return { pages, oversized };
}
function fillRows(rows, minCount) {
  return [...rows, ...Array.from({ length: Math.max(0, minCount - rows.length) }, () => ({ step: '', hazards: '', controls: '' }))];
}
function paginateTaskContent(jsa) {
  const rows = getContentRows(jsa);
  const mainCapacity = mainRowCapacity(jsa);
  let mainRows = [];
  let mainUsed = 0;
  let cutAt = rows.length;
  let oversized = false;

  for (let i = 0; i < rows.length; i += 1) {
    const units = estimateRowUnits(rows[i]);
    if (units > continuationRowCapacity()) oversized = true;
    if (mainRows.length && mainUsed + units > mainCapacity) { cutAt = i; break; }
    if (!mainRows.length && units > mainCapacity) { cutAt = 0; break; }
    mainRows.push(rows[i]);
    mainUsed += units;
  }

  const remaining = rows.slice(cutAt);
  const paged = paginateRowsByUnits(remaining, continuationRowCapacity());
  oversized = oversized || paged.oversized;
  const mainMinRows = Math.max(16, Math.min(22, mainRows.length + 4));
  return {
    contentRows: rows,
    mainContentRows: mainRows,
    mainRows: fillRows(mainRows, mainMinRows),
    continuationPages: paged.pages.map(page => fillRows(page, 10)),
    oversized,
    mainCapacity,
    mainUsed,
  };
}
function getSignaturePages(signatureLineCount) {
  const count = Math.max(1, Math.min(100, Number(signatureLineCount) || 1));
  const maxPerPage = 40;
  const pageCount = Math.ceil(count / maxPerPage);
  const baseSize = Math.floor(count / pageCount);
  const extra = count % pageCount;
  const pages = [];
  let next = 1;
  for (let i = 0; i < pageCount; i += 1) {
    const size = baseSize + (i < extra ? 1 : 0);
    pages.push(Array.from({ length: size }, () => next++));
  }
  return pages;
}
function getPagePlan(jsa) {
  const taskPlan = paginateTaskContent(jsa);
  const signInPages = getSignaturePages(jsa.signatureLineCount);
  return {
    ...taskPlan,
    signInPages,
    totalPages: 1 + taskPlan.continuationPages.length + signInPages.length,
  };
}
function calcFit(jsa) {
  const plan = getPagePlan(jsa);
  if (plan.oversized) {
    return {
      status: 'bad',
      label: 'Content needs review',
      message: 'At least one task row is too large to fit cleanly on a continuation page. Shorten that row or divide it into smaller task rows.',
    };
  }
  if (plan.continuationPages.length) {
    return {
      status: 'warn',
      label: 'Continuation sheet required',
      message: `${plan.continuationPages.length} JSA continuation page${plan.continuationPages.length === 1 ? '' : 's'} will be generated. Complete rows will move together and will not be split between pages.`,
    };
  }
  if (plan.mainUsed >= plan.mainCapacity * 0.82) {
    return { status: 'warn', label: 'Close to full', message: 'The main JSA fits on one page but is close to its clean layout limit.' };
  }
  return { status: 'good', label: 'Fits on main JSA', message: 'The main JSA fits cleanly on one standard letter page.' };
}
function buildExportName(jsa) {
  const raw = [jsa.jobSite || jsa.location || 'Shackelford', 'JSA', jsa.date || todayISO()].join('_');
  return raw.replace(/[^a-z0-9_-]+/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/* ── Empty JSA ── */
function emptyJsa() {
  return {
    id: crypto.randomUUID?.() || String(Date.now()),
    status: 'draft',
    templateName: '',
    location: '',
    jobSite: '',
    jobNumber: '',
    date: todayISO(),
    timeIssued: '',
    timeExpired: '',
    superintendentForeman: '',
    emergencyPhone: '',
    client: '',
    nearestMedicalFacility: '',
    siteContactPhone: '',
    musterPoint: '',
    assignedMentorSse: '',
    acknowledgement: 'I have reviewed and understand the conditions of this JSA and its attached plans and will comply. I will report hazardous conditions or acts identified on this job site to my supervisor and/or Shackelford representative so they can be corrected if necessary. I will conduct a last minute risk assessment before each task and will exercise stop work authority for any unsafe act, condition, or hazard.',
    tailgateTopic: '',
    previousDaySafety: 'None reported.',
    overallWorkTask: '',
    dailyTasks: '',
    hazardsSummary: '',
    controlsSummary: '',
    taskRows: [],
    signatureLineCount: 30,
    notes: '',
    lastSavedAt: '',
  };
}

const BUILT_IN_TEMPLATES = [{
  id: 'blank-jsa',
  source: 'built-in',
  name: 'Blank JSA',
  description: 'Start from a clean form. Save recurring information as your own custom template.',
  data: emptyJsa(),
}];

function makeTodayFromTemplate(data) {
  return { ...emptyJsa(), ...data, id: crypto.randomUUID?.() || String(Date.now()), status: 'draft', date: todayISO(), timeIssued: '', timeExpired: '', tailgateTopic: '', previousDaySafety: 'None reported.', signatureLineCount: Number(data?.signatureLineCount) || 30, notes: '', lastSavedAt: '' };
}
function templatePayload(jsa, name) {
  return {
    id: crypto.randomUUID?.() || String(Date.now()),
    source: 'custom',
    name,
    description: 'Custom saved JSA template',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    data: { ...jsa, id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), source: 'custom', status: 'template', templateName: name, date: '', timeIssued: '', timeExpired: '', tailgateTopic: '', previousDaySafety: 'None reported.', signatureLineCount: Number(jsa.signatureLineCount) || 30, notes: '', lastSavedAt: '' },
  };
}

/* ── Quick-add libraries ── */
const TAILGATE_GROUPS = [
  { title: 'Core Safety', items: ['Hazard recognition','Incident reporting','Stop work authority','Last minute risk assessment','PPE compliance','Housekeeping','Communication before task start','Good catch / near miss awareness'] },
  { title: 'Equipment / Traffic', items: ['Line of fire','Backing equipment','Equipment blind spots','Spotter awareness','Speeding','Material delivery traffic','No phones/earbuds while operating','Seat belt use','Safe equipment access/egress'] },
  { title: 'Civil / Earthwork', items: ['Ground conditions','Grading and compacting','Excavation awareness','Soil stabilization','Dust control','Material placement','Slope and soft ground awareness','Underground/overhead utility awareness'] },
  { title: 'Weather / Health', items: ['Heat stress / hydration','Cold stress','Severe weather awareness','Lightning safety','Fatigue awareness','Silica/dust exposure','Wildlife/insect awareness'] },
  { title: 'Rail / Industrial', items: ['Railroad right-of-way awareness','Rail clearance','Restricted area control','Utility corridor work','Public/third-party traffic','Industrial vehicle traffic'] },
  { title: 'Administrative', items: ['Review of site rules','Emergency procedures and muster point','Reporting injuries immediately','Worker acknowledgement and stop work authority','Review of previous day observations'] },
];
const PREV_DAY_GROUPS = [
  { title: 'No Issues', items: ['None reported.','No injuries or near misses reported previous day.','No safety concerns reported from previous shift.'] },
  { title: 'Review / Coaching', items: ['Reviewed previous day observations with crew.','Near miss reviewed with crew before starting work.','Reviewed incident reporting expectations with crew.','Reviewed housekeeping and access concerns with crew.'] },
  { title: 'Common Follow-Up', items: ['Housekeeping concern corrected previous day.','Equipment/traffic concern reviewed with supervision.','No phones/earbuds while operating equipment.','Failure to communicate injury the day prior.','Heat exposure concern reviewed with crew.'] },
];
const OVERALL_TASK_GROUPS = [
  { title: 'General', items: ['General site work','Site preparation','Site maintenance','Equipment support operations','Access road preparation','Material handling and placement'] },
  { title: 'Civil / Earthwork', items: ['Mass grading','Earthwork operations','Excavation operations','Rough grading','Fine grading','Roadway / access preparation','Drainage / undercut work','Backfill and compaction operations'] },
  { title: 'Stabilization / Materials', items: ['Lime stabilization','Cement stabilization','Rock placement','Stone placement','Place and compact stone','Material delivery and hauling','Concrete placement support'] },
  { title: 'Rail / Industrial', items: ['Railroad support work','Right-of-way support','Industrial site support','Utility corridor work','Track area access support'] },
];
const DAILY_TASK_GROUPS = [
  { title: 'General Site Work', items: ['Site inspection','Housekeeping','Install/maintain barricades','Site mobilization','Site demobilization','Install signage','Material handling','Equipment setup'] },
  { title: 'Site Prep / Clearing', items: ['Mark work limits','Mark overhead and underground utilities','Clearing and grubbing','Mulching','Tree and vegetation removal','Demolish existing structures','Remove existing fence','Debris removal','Survey and staking'] },
  { title: 'Earthwork / Grading', items: ['Mass grading','Rough grading','Fine grading','Finish grading','Strip topsoil','Work in undercut','Backfill','Grade and compact','Compact soil','Proof roll','Dress slopes','GPS grading','Fine tune grade','Water for dust control'] },
  { title: 'Excavation / Drainage', items: ['Excavation','Trenching','Install storm drain','Install pipe','Unload pipe and structures','Install culvert','Install drainage structure','Dewatering','Install riprap','Install erosion control','Maintain erosion control'] },
  { title: 'Soil Stabilization', items: ['Lime delivery','Spread lime','Mix lime into soil','Stabilize soil','Cement stabilization','Moisture conditioning','Prepare stabilized subgrade'] },
  { title: 'Material Delivery / Hauling', items: ['Rock delivery','Stone delivery','Haul dirt','Haul material','Place rock','Place fill','Place topsoil','Place aggregate','Manage stockpiles','Stage trucks','Unload delivered material'] },
  { title: 'Equipment Operations', items: ['Operate heavy equipment','Operate dozer','Operate excavator','Operate loader','Operate roller or compactor','Operate motor grader','Operate dump truck','Operate water truck','Back and maneuver equipment','Spot equipment','Move equipment','Load equipment','Unload equipment','Transport equipment','Fuel equipment','Service equipment'] },
  { title: 'Concrete / Stone', items: ['Place and compact stone','Place stone','Concrete placement','Install formwork','Handle rebar and materials','Install stabilized construction entrance','Install track-out device'] },
  { title: 'Rail / Right-of-Way', items: ['Railroad work','Access rail work area','Work near active rail','Work in siding/spur','Place ballast or stone','Railroad flagging'] },
];
const HAZARD_GROUPS = [
  { title: 'People / Line of Fire', items: ['Line of fire','Struck-by exposure','Caught-between exposure','Pinch points','Workers on foot near equipment','Equipment blind spots','Swing radius','Backing equipment','Falling objects','Suspended loads'] },
  { title: 'Equipment / Traffic', items: ['Moving equipment','Equipment traffic','Rollover/runover potential','Limited visibility','Equipment failure','Rotating equipment','Noise and vibration','Unsafe speeds','Unsecured loads'] },
  { title: 'Ground Conditions', items: ['Slips, trips, and falls','Uneven ground','Soft or unstable ground','Muddy or slippery ground','Steep slopes','Drop-offs','Open excavation','Unstable subgrade','Poor access/egress'] },
  { title: 'Excavation / Utilities', items: ['Trench/excavation exposure','Cave-in potential','Spoil pile instability','Water accumulation','Overhead power lines','Underground utilities','Utility strike potential','Electrical shock/electrocution'] },
  { title: 'Weather / Environmental', items: ['Heat stress','Cold stress','Lightning','High winds','Dust exposure','Reduced visibility','Wet conditions','Erosion/sediment runoff','Wildlife/insects','Poison ivy/oak'] },
  { title: 'Chemical / Dust', items: ['Lime exposure','Cement dust','Silica dust','Fuel/oil exposure','Chemical splash','Inhalation exposure','Eye/skin irritation','Flammable vapors'] },
  { title: 'Traffic / Public', items: ['Public traffic','Delivery truck traffic','Haul road traffic','Roadway traffic exposure','Unauthorized vehicle entry','Pedestrian/public access','Congested access points','Third-party traffic'] },
  { title: 'Rail / Industrial', items: ['Active rail movement','Rail clearance','Industrial vehicle traffic','Plant/site traffic','Restricted area exposure','Loss of communication'] },
];
const CONTROL_GROUPS = [
  { title: 'Communication / Spotters', items: ['Use a spotter','Maintain eye contact with operator','Use radios or hand signals','Confirm communication before movement','Review work plan before starting','Maintain communication with operators and supervision'] },
  { title: 'Equipment Controls', items: ['Maintain safe distance from equipment','Stay clear of swing radius and blind spots','Inspect tools and equipment','Verify horn, lights, and backup alarm','Operate at safe speed','Wear seat belt','Use mirrors and cameras','Park on level ground before servicing','Lower attachments before servicing'] },
  { title: 'PPE', items: ['Wear high-visibility clothing','Wear safety glasses','Wear gloves','Wear hard hat','Use hearing protection','Use respiratory protection when required','Wear proper work boots','Wear required PPE'] },
  { title: 'Excavation / Utilities', items: ['Locate and verify utilities','Maintain current one-call tickets','Mark utilities','Maintain power line clearance','Keep spoil piles back','Provide safe access/egress','Barricade open excavations','Use required protective system','Inspect excavation before entry'] },
  { title: 'Traffic / Access', items: ['Establish traffic control','Use cones, barricades, and signs','Keep access roads clear','Stage trucks in designated area','Control delivery traffic','Separate workers from public','Use designated haul routes','Coordinate deliveries with supervision'] },
  { title: 'Weather / Heat', items: ['Hydrate regularly','Take heat breaks as needed','Monitor for heat stress','Provide shade/rest area','Stop work for lightning per site policy','Adjust work for severe weather','Control dust','Apply water for dust control'] },
  { title: 'Housekeeping / Site', items: ['Keep walkways clear','Remove trip hazards','Maintain clean access/egress','Secure loose materials','Correct housekeeping issues','Keep tools/materials organized','Maintain stable work surfaces'] },
  { title: 'Rail / Industrial', items: ['Follow railroad safety requirements','Maintain rail clearance','Coordinate with flagger/railroad representative','Stay out of restricted areas unless authorized','Maintain communication with site operations','Follow site access controls'] },
  { title: 'Stop Work / LMRA', items: ['Complete LMRA before each task','Use stop work authority','Report hazards immediately','Review emergency procedures and muster point','Stop and reassess when conditions change'] },
];

const TASK_ROW_GROUPS = [
  { title: 'Site Prep', items: [
    { label: 'Marking boundaries / LODs', step: 'Marking boundaries / limits of disturbance', hazards: 'Slips, trips and falls; cold, heat and wet weather; bee/snake stings and bites; skin irritation (poison oak/ivy); struck-by / pinch points; overhead/underground utilities', controls: 'Proper clothing and PPE for task; stay hydrated; no work in heavy rain or lightning; take breaks during high/low temps; mark overhead power lines with flagging and signage; stay clear of moving equipment; maintain minimum 15 ft clearance from overhead power lines; use spotter when working near overhead power lines' },
    { label: 'Marking overhead/underground utilities', step: 'Marking overhead/underground utilities', hazards: 'Unintended contact with underground/overhead utilities; electrocution from overhead power lines; struck-by hazards; slips, trips and falls; burns; cuts; struck by equipment', controls: 'Maintain current one calls; mark underground utilities with flagging; take pictures of marked area; verify depth and location; wear required PPE; establish communication with operator; use spotter when working near overhead power lines; stay hydrated' },
    { label: 'Installing barricades and signs', step: 'Installing barricades and signs', hazards: 'Slips, trips and falls; cuts; heat, cold and wet hazards; hand injuries', controls: 'Housekeeping; watch your step in soft/slick ground; wear required PPE; use proper lifting; use proper tool for task' },
  ]},
  { title: 'Erosion Control', items: [
    { label: 'Installing erosion control', step: 'Installing erosion control measures', hazards: 'Slips, trips and falls; muscle skeletal injuries; cuts; crush, pinch point and puncture hazards; runover/rollover; electrical hazards (overhead/underground utilities)', controls: 'Maintain 3 points of contact; good housekeeping; use proper lifting technique; wear required PPE; stay clear of moving equipment (at least 100 ft); mark overhead power lines with flagging and signage; use spotter when working near overhead power lines; maintain current one calls' },
    { label: 'Maintaining erosion control', step: 'Maintaining erosion control measures', hazards: 'Slips, trips and falls; impalement hazards; cuts; muscle skeletal injuries; crush, pinch point, puncture hazards', controls: 'Good housekeeping; watch your step on soft/slick soil; wear required PPE; use proper lifting technique; install protection caps on all puncture hazards' },
    { label: 'Removing erosion control', step: 'Removing erosion control', hazards: 'Slips, trips and falls; muscle skeletal injuries; cuts; crush, pinch point and puncture hazards; runover by equipment; electrical hazards', controls: 'Maintain 3 points of contact; good housekeeping; use proper lifting technique; wear required PPE; stay clear of moving equipment; mark overhead power lines; use spotter when working near utilities' },
  ]},
  { title: 'Clearing and Grubbing', items: [
    { label: 'Clearing and grubbing', step: 'Clearing and grubbing', hazards: 'Slips, trips and falls; heat/cold and wet conditions; environmental hazards; cuts; burns; impalement hazards; electrocution from overhead power lines or underground utilities; rollover, runover and struck-by hazards', controls: 'Maintain 3 points of contact; good housekeeping; watch your step in soft/slick ground; stay hydrated; take breaks; wear required PPE; protect or remove impalement hazards; use spotter when working near utilities; flag all utilities in the work area; maintain current one calls; maintain minimum 10 ft clearance from overhead power lines; wear seatbelt; keep safe distance from moving equipment' },
    { label: 'Mulching', step: 'Mulching', hazards: 'Rollover, runover and amputation hazards; slips, trips and falls; heat/cold and wet conditions; environmental hazards; cuts; burns; impalement hazards; electrical hazards from overhead power lines or underground utilities; flying debris', controls: 'Be careful on slopes/unstable ground; wear seatbelt; keep safe distance from moving equipment; make sure horn, lights and back-up alarm work; make eye contact with operator before approaching; keep body parts out of point of operation; LOTO equipment to clear jammed material; barricade and keep unauthorized personnel out of the area; maintain 3 points of contact; good housekeeping; wear required PPE' },
  ]},
  { title: 'Grading and Compacting', items: [
    { label: 'Grading and compacting', step: 'Grading and compacting', hazards: 'Slips, trips and falls when mounting equipment; back and muscle injuries; cuts; sprains/strains; struck-by; pinch points; crush; rollover, runover injuries; fires/burns; heat/cold and wet conditions; electrical hazards (underground/overhead power lines); equipment failure', controls: 'Maintain 3 points of contact; good housekeeping; watch footing in soft or slick ground conditions; use proper lifting techniques; wear proper PPE; wear seatbelt; be careful on slopes or unstable ground; stay clear of moving equipment; make eye contact with operator before you approach; have fire extinguisher in equipment and work area; stay hydrated; take breaks; mark all underground utilities and overhead power lines; stay 15 ft away from overhead power lines; maintain current one calls; verify horn, lights, back-up alarm and emergency stop work properly' },
  ]},
  { title: 'Excavation / Drainage', items: [
    { label: 'Unloading pipe and structures', step: 'Unloading pipe and structures', hazards: 'Cuts; eye/face injuries; crush; pinch points; slips, trips and falls; falling objects; struck-by; runovers; rollover; electrical hazards; equipment failure', controls: 'Wear required PPE; stay clear from moving equipment; do not stand or work under suspended loads; inspect the lifting equipment; review JSA with the crew; stay a safe distance from equipment and suspended loads; establish eye contact with operator before approaching; use spotter when working near underground/overhead power lines' },
    { label: 'Installing pipe', step: 'Installing pipe', hazards: 'Slips, trips and falls; cuts; crush; struck-by; pinch points; eye/face injuries; muscle skeletal injuries; electrical and underground utilities; heat/cold and wet conditions; runover/rollover; caught between; atmospheric hazards; falling objects; equipment failures', controls: 'Watch your step in wet/slick ground; wear required PPE; stay clear of moving equipment; use proper lifting techniques; keep one calls current; barricade work area; stay 15 ft from power lines; verify depth and location; stay hydrated; take breaks; wear seatbelt; do not stand or walk under suspended loads; inspect all equipment at the beginning of the shift' },
  ]},
  { title: 'Soil Stabilization', items: [
    { label: 'Lime or cement stabilization of soil', step: 'Lime or cement stabilization of soil', hazards: 'Slips, trips and falls from equipment; pinch points; struck-by; rollover; runover; respiratory (silica) and electrical hazards (overhead power lines/underground utilities); high noise levels', controls: 'Maintain 3 points of contact; good housekeeping; watch footing in soft, slick or wet ground; stay clear of moving equipment; make sure horn, lights and back-up alarm are working; wear required PPE; wear seatbelt; be careful on slopes or unstable ground; wet down work area as needed; wear required silica PPE; stay 15 ft from overhead power lines; use spotter when working near overhead power lines/utilities; mark all utilities with flagging/paint; stay away from high noise areas; wear required hearing protection' },
  ]},
  { title: 'Place and Compact Stone', items: [
    { label: 'Place and compact stone', step: 'Place and compact stone', hazards: 'Slips, trips and falls; cuts; eye/face injuries; muscle skeletal and ergonomic injuries; sprains/strains; silica dust; flying objects; runover; rollover hazards; pinch points; struck-by hazards', controls: 'Watch footing in soft or slick ground conditions; good housekeeping; wear required PPE; use proper lifting technique; wet down when silica dust is present; mark overhead power lines/underground utilities; use spotter when working near overhead or underground utilities; keep safe distance from moving equipment; make sure horn, lights and back-up alarm are working; barricade work area; wear seatbelt; make eye contact with operator before approaching' },
  ]},
  { title: 'Equipment Operations', items: [
    { label: 'Servicing equipment', step: 'Servicing equipment', hazards: 'Slips, trips and falls mounting equipment; pinch points; cuts; burns; crush; fire and chemical hazards; struck-by; back and crush injuries; electrical shock; high levels of noise; heat and cold injuries', controls: 'Maintain 3 points of contact; watch footing and maintain good housekeeping; use proper LOTO procedures; verify guards/shields are properly re-installed; avoid pinch points; use proper lifting techniques; review SDS sheets for chemicals used; have tagged/charged fire extinguisher; perform work in area free of overhead power lines; watch hand placement; make eye contact with operator before approaching; wear seat belt; park all equipment on level ground; place in park, lower boom, forks and blades' },
    { label: 'Fueling equipment', step: 'Fueling equipment', hazards: 'Fire, explosion and chemical hazards; eye/face injuries; electrical hazards; slips, trips and falls; burns; cuts; crush and pinch point hazards; environmental contamination', controls: 'Maintain good housekeeping; wear required PPE; inspect all tools and equipment in use; watch footing; maintain 3 points of contact; avoid pinch points; turn off engine and do not overfill equipment; no smoking or use of cell phone during refueling' },
    { label: 'Material delivery / truck traffic', step: 'Material delivery / haul trucks entering and exiting work area', hazards: 'Struck-by hazards; line of fire; backing equipment; material delivery traffic; public/third-party traffic', controls: 'Use spotters where required; maintain communication with operators and foremen; maintain safe distance from equipment; keep access/egress clear; wear required PPE/high-visibility clothing' },
    { label: 'Mass grading / equipment operations', step: 'Mass grading and heavy equipment operations in assigned work area', hazards: 'Heavy equipment movement; line of fire; caught-between hazards; uneven ground; dust exposure; noise/vibration', controls: 'Stay clear of swing radius and blind spots; maintain safe distance from equipment; control dust as needed; verify stable ground before equipment/material placement; use stop work authority for unsafe acts/conditions' },
  ]},
  { title: 'Site Mobilization', items: [
    { label: 'Equipment loading and transport', step: 'Equipment loading, transport, and mobilization/demobilization', hazards: 'Traffic; struck-by; collision; crush; cuts/pinch point hazards; overhead power lines; flying objects; equipment rollovers; caught-between hazards; equipment blind spots; muscle skeletal injuries; falling objects; unsecured loads', controls: 'Use 3 points of contact; good housekeeping; watch your step while climbing on trailer and walking on rough terrain; wear required PPE; stay minimum 15 ft from overhead power lines; make eye contact with operator before approaching; keep a safe distance from moving equipment; inspect all equipment (horn, lights, back-up alarm and emergency stop); wear seat belts; avoid pinch points; keep body parts out of line of fire; be careful on slopes or unstable ground' },
    { label: 'Driving to/from field', step: 'Driving to and from the field', hazards: 'Motor vehicle accident; distracted driving; fatigue', controls: 'Wear seatbelt; obey speed limit; no cell phone while driving; obey all traffic laws; reduce speed for inclement weather; increase stopping distance with heavy trailer; stay alert and do not drive fatigued' },
  ]},
];


const TASK_SUGGESTIONS = {
  [normalizeEntry('Site inspection')]: {
    hazards: ['Slips, trips, and falls','Uneven ground','Workers on foot near equipment','Weather exposure'],
    controls: ['Wear required PPE','Maintain safe distance from equipment','Use designated access routes','Report and correct hazards'],
  },
  [normalizeEntry('Housekeeping')]: {
    hazards: ['Slips, trips, and falls','Poor access/egress','Sharp or protruding materials'],
    controls: ['Keep walkways clear','Remove trip hazards','Maintain clean access/egress','Secure or remove protruding materials'],
  },
  [normalizeEntry('Install/maintain barricades')]: {
    hazards: ['Workers on foot near equipment','Pinch points','Public/pedestrian access','Slips, trips, and falls'],
    controls: ['Use cones, barricades, and signs','Separate workers from public','Wear high-visibility clothing','Maintain communication with operators and supervision'],
  },
  [normalizeEntry('Mass grading')]: {
    hazards: ['Moving equipment','Line of fire','Equipment blind spots','Rollover/runover potential','Dust exposure','Noise and vibration'],
    controls: ['Maintain safe distance from equipment','Stay clear of swing radius and blind spots','Use a spotter','Wear seat belt','Control dust','Use hearing protection'],
  },
  [normalizeEntry('Rough grading')]: {
    hazards: ['Moving equipment','Uneven ground','Equipment blind spots','Rollover/runover potential','Dust exposure'],
    controls: ['Maintain safe distance from equipment','Wear seat belt','Use a spotter','Operate at safe speed','Control dust'],
  },
  [normalizeEntry('Fine grading')]: {
    hazards: ['Moving equipment','Workers on foot near equipment','Equipment blind spots','Dust exposure'],
    controls: ['Maintain safe distance from equipment','Confirm communication before movement','Use a spotter','Control dust'],
  },
  [normalizeEntry('Excavation')]: {
    hazards: ['Cave-in potential','Underground utilities','Open excavation','Workers on foot near equipment','Spoil pile instability','Water accumulation'],
    controls: ['Locate and verify utilities','Maintain current one-call tickets','Use required protective system','Barricade open excavations','Keep spoil piles back','Provide safe access/egress','Inspect excavation before entry'],
  },
  [normalizeEntry('Trenching')]: {
    hazards: ['Cave-in potential','Underground utilities','Open excavation','Poor access/egress','Water accumulation'],
    controls: ['Locate and verify utilities','Use required protective system','Provide safe access/egress','Barricade open excavations','Inspect excavation before entry'],
  },
  [normalizeEntry('Install pipe')]: {
    hazards: ['Caught-between exposure','Pinch points','Suspended loads','Falling objects','Open excavation','Workers on foot near equipment'],
    controls: ['Use approved lifting equipment','Stay clear of suspended loads','Use tag lines when needed','Maintain communication with operator','Use a spotter','Barricade open excavations'],
  },
  [normalizeEntry('Unload pipe and structures')]: {
    hazards: ['Suspended loads','Falling objects','Caught-between exposure','Pinch points','Delivery truck traffic'],
    controls: ['Inspect rigging before use','Stay clear of suspended loads','Use tag lines when needed','Use a spotter','Control delivery traffic','Maintain communication with operators and supervision'],
  },
  [normalizeEntry('Stabilize soil')]: {
    hazards: ['Lime exposure','Silica dust','Eye/skin irritation','Moving equipment','Noise and vibration','Overhead power lines'],
    controls: ['Wear required PPE','Use respiratory protection when required','Apply water for dust control','Maintain safe distance from equipment','Use hearing protection','Maintain power line clearance'],
  },
  [normalizeEntry('Lime delivery')]: {
    hazards: ['Delivery truck traffic','Lime exposure','Dust exposure','Workers on foot near equipment'],
    controls: ['Control delivery traffic','Stage trucks in designated area','Wear required PPE','Maintain safe distance from equipment','Apply water for dust control'],
  },
  [normalizeEntry('Rock delivery')]: {
    hazards: ['Delivery truck traffic','Backing equipment','Line of fire','Equipment blind spots','Dust exposure'],
    controls: ['Control delivery traffic','Stage trucks in designated area','Use a spotter','Wear high-visibility clothing','Maintain safe distance from equipment','Control dust'],
  },
  [normalizeEntry('Stone delivery')]: {
    hazards: ['Delivery truck traffic','Backing equipment','Line of fire','Equipment blind spots','Dust exposure'],
    controls: ['Control delivery traffic','Stage trucks in designated area','Use a spotter','Wear high-visibility clothing','Maintain safe distance from equipment','Control dust'],
  },
  [normalizeEntry('Haul material')]: {
    hazards: ['Haul road traffic','Moving equipment','Dust exposure','Roadway traffic exposure','Unsafe speeds'],
    controls: ['Use designated haul routes','Operate at safe speed','Control dust','Maintain communication with operators and supervision','Stage trucks in designated area'],
  },
  [normalizeEntry('Operate heavy equipment')]: {
    hazards: ['Moving equipment','Equipment blind spots','Rollover/runover potential','Line of fire','Noise and vibration'],
    controls: ['Inspect tools and equipment','Verify horn, lights, and backup alarm','Wear seat belt','Operate at safe speed','Use a spotter','Stay clear of swing radius and blind spots'],
  },
  [normalizeEntry('Back and maneuver equipment')]: {
    hazards: ['Backing equipment','Equipment blind spots','Struck-by exposure','Caught-between exposure'],
    controls: ['Use a spotter','Confirm communication before movement','Verify backup alarm','Stop when visual contact is lost'],
  },
  [normalizeEntry('Spot equipment')]: {
    hazards: ['Struck-by exposure','Line of fire','Equipment blind spots','Loss of communication'],
    controls: ['Use radios or hand signals','Maintain eye contact with operator','Stay visible and outside equipment path','Stop movement when communication is lost'],
  },
  [normalizeEntry('Fuel equipment')]: {
    hazards: ['Fuel/oil exposure','Flammable vapors','Chemical splash','Fire/explosion','Moving equipment'],
    controls: ['Shut down engine before fueling','Keep ignition sources away','Wear required PPE','Clean spills promptly','Keep fire extinguisher available'],
  },
  [normalizeEntry('Service equipment')]: {
    hazards: ['Stored energy','Pinch points','Crush exposure','Hot surfaces','Fuel/oil exposure','Unexpected movement'],
    controls: ['Apply lockout/tagout when required','Park on level ground before servicing','Lower attachments before servicing','Release stored energy','Wear required PPE'],
  },
  [normalizeEntry('Place and compact stone')]: {
    hazards: ['Moving equipment','Workers on foot near equipment','Dust exposure','Flying material','Rollover/runover potential'],
    controls: ['Maintain safe distance from equipment','Use a spotter','Control dust','Wear safety glasses','Wear seat belt'],
  },
  [normalizeEntry('Work near active rail')]: {
    hazards: ['Active rail movement','Rail clearance','Industrial vehicle traffic','Loss of communication'],
    controls: ['Follow railroad safety requirements','Maintain rail clearance','Coordinate with flagger/railroad representative','Stay out of restricted areas unless authorized'],
  },
};

function findTaskSuggestion(taskLabel) {
  const key = normalizeEntry(taskLabel);
  const exact = TASK_SUGGESTIONS[key];
  if (exact) return { task: taskLabel, hazards: dedupeList(exact.hazards), controls: dedupeList(exact.controls), source: 'curated' };

  const allTemplates = TASK_ROW_GROUPS.flatMap(group => group.items || []);
  const template = allTemplates.find(item => {
    const labelKey = normalizeEntry(item.label);
    const stepKey = normalizeEntry(item.step);
    return key === labelKey || key === stepKey || (key.length > 8 && (labelKey.includes(key) || key.includes(labelKey)));
  });
  if (!template) return null;
  return {
    task: taskLabel,
    hazards: dedupeList(splitLines(template.hazards)),
    controls: dedupeList(splitLines(template.controls)),
    source: 'task row template',
  };
}

/* ── Step definitions ── */
const STEPS = [
  { id: 'job', label: 'Job Info', helper: 'Project, site, and emergency details' },
  { id: 'meeting', label: 'Meeting Info', helper: 'Topic, previous day, overall task' },
  { id: 'work', label: 'Tasks / Hazards', helper: 'Daily tasks, hazards, and controls' },
  { id: 'signatures', label: 'Signatures', helper: 'Crew count and acknowledgement' },
  { id: 'review', label: 'Review / Export', helper: 'Save draft, templates, and export PDF' },
];

function hasMeaningfulJsaContent(jsa) {
  return [jsa.location, jsa.jobSite, jsa.superintendentForeman, jsa.tailgateTopic, jsa.overallWorkTask, jsa.dailyTasks, jsa.hazardsSummary, jsa.controlsSummary].some(hasText)
    || normalizeRows(jsa.taskRows).length > 0;
}
function stepStatus(jsa, id) {
  switch (id) {
    case 'job': return hasText(jsa.location) && hasText(jsa.jobSite) && hasText(jsa.superintendentForeman) ? 'complete' : 'needs-info';
    case 'meeting': return hasText(jsa.tailgateTopic) && hasText(jsa.overallWorkTask) ? 'complete' : 'needs-info';
    case 'work': return hasText(jsa.dailyTasks) && hasText(jsa.hazardsSummary) && hasText(jsa.controlsSummary) ? 'complete' : 'needs-info';
    case 'signatures': return Number(jsa.signatureLineCount) > 0 ? 'complete' : 'needs-info';
    case 'review': return jsa.status === 'ready' ? 'ready' : 'draft';
    default: return 'draft';
  }
}
function stepStatusLabel(s) {
  if (s === 'complete') return 'Complete';
  if (s === 'ready') return 'Ready';
  return 'Needs Info';
}
function getReviewChecks(jsa) {
  const plan = getPagePlan(jsa);
  const fit = calcFit(jsa);
  return [
    { label: 'Job site, location, and supervisor', ok: hasText(jsa.jobSite) && hasText(jsa.location) && hasText(jsa.superintendentForeman) },
    { label: 'Date and emergency information', ok: hasText(jsa.date) && hasText(jsa.emergencyPhone) && hasText(jsa.musterPoint) },
    { label: 'Tailgate topic and overall work activity', ok: hasText(jsa.tailgateTopic) && hasText(jsa.overallWorkTask) },
    { label: 'At least one task', ok: getContentRows(jsa).some(row => hasText(row.step)) },
    { label: 'Hazards identified', ok: getContentRows(jsa).some(row => hasText(row.hazards)) },
    { label: 'Controls identified', ok: getContentRows(jsa).some(row => hasText(row.controls)) },
    { label: `Signature setup (${Math.max(1, Number(jsa.signatureLineCount) || 1)} lines)`, ok: Number(jsa.signatureLineCount) >= 1 && Number(jsa.signatureLineCount) <= 100 },
    { label: `Page plan (${plan.totalPages} total page${plan.totalPages === 1 ? '' : 's'})`, ok: fit.status !== 'bad' },
  ];
}

function IconLock(props) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="5" y="10.5" width="14" height="9" rx="1.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>; }

/* ── Layout capability helpers ──
   Touch-primary detection uses (any-pointer: coarse), a real hardware-capability
   media feature, not a viewport-width guess — this stays correct even if Safari
   reports a desktop-class viewport width for an iPad. Container width is measured
   on the actual rendered element via ResizeObserver, not window.innerWidth. */
function useIsTouchPrimary() {
  const readMatch = () => (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(any-pointer: coarse)').matches
    : false;
  const [touch, setTouch] = useState(readMatch);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(any-pointer: coarse)');
    const handler = () => setTouch(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return touch;
}
function useElementWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const update = () => setWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
function useDebugLayoutFlag() {
  return useMemo(() => {
    if (typeof window === 'undefined') return false;
    try { return new URLSearchParams(window.location.search).get('debug') === 'layout'; }
    catch { return false; }
  }, []);
}

/* ── Compact stepper (touch devices): every segment always shows its own
   number, title, and a non-color status glyph. Layout is an explicit
   3+2 grid that switches to a single row of 5 via container query at
   wider actual widths — never an accidental auto-wrap. ── */
function CompactStepper({ steps, jsa, jsaStep, setJsaStep }) {
  const idx = Math.max(0, steps.findIndex(s => s.id === jsaStep));
  const current = steps[idx];
  return (
    <div className="compactStepper">
      <div className="compactStepperHead">
        <span className="compactStepperCount">Step {idx + 1} of {steps.length}</span>
        <span className="compactStepperTitle">{current.label}</span>
      </div>
      <div className="compactStepperTrack">
        {steps.map((s, i) => {
          const st = stepStatus(jsa, s.id);
          const glyph = stepStatusLabel(st) === 'Needs Info' ? '!' : '✓';
          return (
            <button
              key={s.id}
              className={`compactStepperSeg ${st}${s.id === jsaStep ? ' active' : ''}`}
              onClick={() => setJsaStep(s.id)}
              aria-current={s.id === jsaStep ? 'step' : undefined}
              aria-label={`${s.label}: ${stepStatusLabel(st)}`}
            >
              <span className="compactStepperSegTop">
                <span className="compactStepperSegNum">{i + 1}</span>
                <span className="compactStepperSegGlyph" aria-hidden="true">{glyph}</span>
              </span>
              <span className="compactStepperSegLabel">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Layout diagnostics overlay, only mounted behind ?debug=layout ── */
function LayoutDebugPanel({ containerRef, layoutMode, stepperMode, jobPairMode, quickPanelMode, previewMode }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const onChange = () => forceTick(t => t + 1);
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    window.visualViewport?.addEventListener('resize', onChange);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
      window.visualViewport?.removeEventListener('resize', onChange);
    };
  }, []);
  const vv = window.visualViewport;
  const coarse = window.matchMedia ? window.matchMedia('(any-pointer: coarse)').matches : false;
  const orientation = screen.orientation?.type || (window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait');
  const containerWidth = containerRef?.current?.clientWidth;
  return (
    <div className="layoutDebugPanel">
      <strong>Layout Debug (?debug=layout)</strong>
      <dl>
        <div><dt>touch-primary</dt><dd>{String(coarse)}</dd></div>
        <div><dt>any-pointer: coarse</dt><dd>{String(coarse)}</dd></div>
        <div><dt>maxTouchPoints</dt><dd>{navigator.maxTouchPoints}</dd></div>
        <div><dt>innerWidth × innerHeight</dt><dd>{window.innerWidth} × {window.innerHeight}</dd></div>
        <div><dt>visualViewport</dt><dd>{vv ? `${Math.round(vv.width)} × ${Math.round(vv.height)}` : 'n/a'}</dd></div>
        <div><dt>screen</dt><dd>{screen.width} × {screen.height}</dd></div>
        <div><dt>devicePixelRatio</dt><dd>{window.devicePixelRatio}</dd></div>
        <div><dt>orientation</dt><dd>{orientation}</dd></div>
        <div><dt>workspace width</dt><dd>{containerWidth != null ? `${containerWidth}px` : 'n/a'}</dd></div>
        <div><dt>live preview mode</dt><dd>{previewMode ?? layoutMode ?? 'n/a'}</dd></div>
        <div><dt>stepper mode</dt><dd>{stepperMode ?? 'n/a'}</dd></div>
        <div><dt>job info pair mode</dt><dd>{jobPairMode ?? 'n/a'}</dd></div>
        <div><dt>QuickPanel mode</dt><dd>{quickPanelMode ?? 'n/a'}</dd></div>
      </dl>
    </div>
  );
}

/* ── Accessible modal dialog primitive: focus trap, Escape to cancel,
   focus returns to whatever triggered it on close. No dependency. ── */
function useFocusTrapDialog(onCancel) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = dialog ? Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')) : [];
    focusable[0]?.focus();
    function onKeyDown(e) {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key !== 'Tab' || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [onCancel]);
  return dialogRef;
}

function ConfirmReplaceDialog({ templateName, onCancel, onContinue }) {
  const dialogRef = useFocusTrapDialog(onCancel);
  return (
    <div className="dialogOverlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dialogPanel" role="alertdialog" aria-modal="true" aria-labelledby="confirmReplaceTitle" aria-describedby="confirmReplaceBody" ref={dialogRef}>
        <h3 id="confirmReplaceTitle">Replace current draft?</h3>
        <p id="confirmReplaceBody">
          {templateName
            ? `Loading "${templateName}" will replace the JSA you're currently editing. This can't be undone.`
            : "Starting a new blank JSA will replace the one you're currently editing. This can't be undone."}
        </p>
        <div className="dialogActions">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={onContinue}>Continue</button>
        </div>
      </div>
    </div>
  );
}

/* ── App ── */
function App() {
  const [settings, setSettings] = useState(() => ({ theme: 'dark', customQuick: { task: [], hazard: [], control: [] }, ...safeJson(localStorage.getItem(KEYS.settings), {}) }));
  const [customTemplates, setCustomTemplates] = useState(() => safeJson(localStorage.getItem(KEYS.templates), []));
  const [savedDraft, setSavedDraft] = useState(() => safeJson(localStorage.getItem(KEYS.draft), null));
  const [jsa, setJsa] = useState(() => emptyJsa());
  const [tab, setTab] = useState('home');
  const [activeDoc, setActiveDoc] = useState(null); // null | 'jsa-start' | 'jsa'
  const [jsaStep, setJsaStep] = useState('job');
  const [templateId, setTemplateId] = useState('blank-jsa');
  const [saveName, setSaveName] = useState('');
  const [toast, setToast] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [confirmReplace, setConfirmReplace] = useState(null); // null | { action: 'blank' } | { action: 'template', templateId }
  const autoSaveTimer = useRef(null);
  const lastAutoSaveSnapshot = useRef('');

  const allTemplates = useMemo(() => [...BUILT_IN_TEMPLATES, ...customTemplates], [customTemplates]);
  const isTouchPrimary = useIsTouchPrimary();

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme || 'dark';
    localStorage.setItem(KEYS.settings, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    // Application-level layout signal every component can key off via CSS
    // (html[data-pointer='coarse']) without prop drilling. Based on the real
    // (any-pointer: coarse) capability, not viewport width or UA sniffing.
    document.documentElement.dataset.pointer = isTouchPrimary ? 'coarse' : 'fine';
  }, [isTouchPrimary]);

  useEffect(() => {
    localStorage.setItem(KEYS.templates, JSON.stringify(customTemplates));
  }, [customTemplates]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (!import.meta.env.PROD) {
      navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister()));
      if ('caches' in window) caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
      return;
    }
    const register = () => navigator.serviceWorker.register('./sw.js').catch(() => {});
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);


  useEffect(() => {
    if (activeDoc !== 'jsa') return undefined;
    if (!hasMeaningfulJsaContent(jsa)) return undefined;
    const snapshot = JSON.stringify({ ...jsa, lastSavedAt: '' });
    if (snapshot === lastAutoSaveSnapshot.current) return undefined;
    setSaveStatus('saving');
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const next = { ...jsa, status: jsa.status === 'ready' ? 'ready' : 'draft', lastSavedAt: new Date().toISOString() };
      try {
        localStorage.setItem(KEYS.draft, JSON.stringify(next));
        lastAutoSaveSnapshot.current = snapshot;
        setSavedDraft(next);
        setJsa(prev => ({ ...prev, lastSavedAt: next.lastSavedAt }));
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 900);
    return () => clearTimeout(autoSaveTimer.current);
  }, [jsa, activeDoc]);

  function upd(patch) { setJsa(prev => ({ ...prev, ...patch })); }
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  function goHome() { setTab('home'); setActiveDoc(null); }
  function goDocs() { setTab('documents'); setActiveDoc(null); }
  function goJsaStart() { setTab('documents'); setActiveDoc('jsa-start'); }
  function goJsa(step = 'job') { setTab('documents'); setActiveDoc('jsa'); setJsaStep(step); }

  function saveDraft(msg = true) {
    const next = { ...jsa, status: 'draft', lastSavedAt: new Date().toISOString() };
    try {
      localStorage.setItem(KEYS.draft, JSON.stringify(next));
      setJsa(next);
      setSavedDraft(next);
      setSaveStatus('saved');
      if (msg) showToast('Draft saved on this device.');
    } catch {
      setSaveStatus('error');
      if (msg) showToast('Save failed. Check available storage on this device.');
    }
  }
  function markReady() {
    const next = { ...jsa, status: 'ready', lastSavedAt: new Date().toISOString() };
    try {
      localStorage.setItem(KEYS.draft, JSON.stringify(next));
      setJsa(next);
      setSavedDraft(next);
      setSaveStatus('saved');
      showToast('Marked ready to export. Save the PDF outside the app.');
    } catch {
      setSaveStatus('error');
      showToast('Save failed. Check available storage on this device.');
    }
  }
  function clearDraft() {
    if (!confirm('Clear this JSA draft? Custom templates will not be affected.')) return;
    setJsa(emptyJsa());
    localStorage.removeItem(KEYS.draft);
    setSavedDraft(null);
    setTemplateId('blank-jsa');
    goJsaStart();
    showToast('JSA draft cleared.');
  }
  function loadTemplate(id = templateId) {
    const t = allTemplates.find(x => x.id === id);
    if (!t) return;
    const next = t.id === 'blank-jsa' ? emptyJsa() : makeTodayFromTemplate(t.data);
    setJsa(next);
    setTemplateId(id);
    goJsa('job');
    showToast(`Loaded: ${t.name}`);
  }
  function loadSavedDraft() {
    const raw = safeJson(localStorage.getItem(KEYS.draft), savedDraft);
    if (!raw) { showToast('No saved draft found on this device.'); return; }
    const normalized = { ...emptyJsa(), ...raw };
    setJsa(normalized);
    setSavedDraft(normalized);
    setTemplateId('blank-jsa');
    goJsa('job');
    showToast('Saved draft loaded.');
  }
  function startBlank() {
    setJsa(emptyJsa());
    setTemplateId('blank-jsa');
    goJsa('job');
  }
  function requestStartBlank() {
    if (hasMeaningfulJsaContent(jsa)) { setConfirmReplace({ action: 'blank' }); return; }
    startBlank();
  }
  function requestLoadTemplate(id) {
    if (hasMeaningfulJsaContent(jsa)) { setConfirmReplace({ action: 'template', templateId: id }); return; }
    loadTemplate(id);
  }
  function confirmReplaceContinue() {
    if (confirmReplace?.action === 'blank') startBlank();
    else if (confirmReplace?.action === 'template') loadTemplate(confirmReplace.templateId);
    setConfirmReplace(null);
  }
  function confirmReplaceCancel() { setConfirmReplace(null); }
  function saveTemplate() {
    const name = saveName.trim();
    if (!name) { showToast('Enter a name for the template first.'); return; }
    const t = templatePayload(jsa, name);
    setCustomTemplates(prev => [t, ...prev.filter(x => x.name.toLowerCase() !== name.toLowerCase())]);
    setSaveName('');
    showToast(`Saved template: ${name}`);
  }
  function updateTemplate() {
    const curr = customTemplates.find(t => t.name === jsa.templateName || t.id === templateId);
    if (!curr) { showToast('Load a custom template first, or use Save Custom Template.'); return; }
    const updated = templatePayload(jsa, curr.name);
    updated.id = curr.id;
    updated.createdAt = curr.createdAt;
    setCustomTemplates(prev => prev.map(t => t.id === curr.id ? updated : t));
    showToast(`Updated template: ${curr.name}`);
  }
  function deleteTemplate(id) {
    const t = customTemplates.find(x => x.id === id);
    if (!t) return;
    if (!confirm(`Delete template "${t.name}"?`)) return;
    setCustomTemplates(prev => prev.filter(x => x.id !== id));
    if (templateId === id) setTemplateId('blank-jsa');
    showToast('Template deleted.');
  }

  function addRow() { upd({ taskRows: [...(jsa.taskRows || []), { step: '', hazards: '', controls: '' }] }); }
  function updRow(i, patch) {
    const rows = [...(jsa.taskRows || [])];
    rows[i] = { ...rows[i], ...patch };
    upd({ taskRows: rows });
  }
  function removeRow(i) { upd({ taskRows: (jsa.taskRows || []).filter((_, x) => x !== i) }); }
  function insertLines(field, values, label = 'item') {
    const result = mergeUniqueEntries(jsa[field] || '', values);
    if (result.added.length) upd({ [field]: result.value });
    if (result.skipped.length && result.added.length) {
      showToast(`Added ${result.added.length} ${label}${result.added.length === 1 ? '' : 's'}; skipped ${result.skipped.length} duplicate${result.skipped.length === 1 ? '' : 's'}.`);
    } else if (result.skipped.length) {
      showToast(`Already included: ${result.skipped[0].match}`);
    }
    return result;
  }
  function insertLine(field, text, label = 'item') {
    return insertLines(field, [text], label);
  }
  function addSummaryAsRow() {
    upd({ taskRows: [{ step: jsa.dailyTasks || '', hazards: jsa.hazardsSummary || '', controls: jsa.controlsSummary || '' }] });
    showToast('Created task row from summary fields.');
  }
  function addRowTemplate(tmpl) {
    const rows = normalizeRows(jsa.taskRows);
    const duplicate = rows.find(row => isNearDuplicate(row.step, tmpl.step));
    if (duplicate) {
      showToast(`Task row already included: ${duplicate.step}`);
      return;
    }
    upd({ taskRows: [...rows, { step: tmpl.step, hazards: tmpl.hazards, controls: tmpl.controls }] });
    showToast(`Added task row: ${tmpl.label}`);
  }
  function upsertSuggestedTaskRow(task, hazards, controls) {
    const rows = normalizeRows(jsa.taskRows);
    const index = rows.findIndex(row => isNearDuplicate(row.step, task));
    const hazardText = dedupeList(hazards).join('\n');
    const controlText = dedupeList(controls).join('\n');
    if (index >= 0) {
      const row = rows[index];
      rows[index] = {
        ...row,
        step: row.step || task,
        hazards: mergeUniqueEntries(row.hazards || '', hazards).value,
        controls: mergeUniqueEntries(row.controls || '', controls).value,
      };
      upd({ taskRows: rows });
      showToast(`Updated paired hazards and controls for ${task}.`);
      return;
    }
    upd({ taskRows: [...rows, { step: task, hazards: hazardText, controls: controlText }] });
    showToast(`Added paired hazards and controls for ${task}.`);
  }
  function exportPdf() {
    const fit = calcFit(jsa);
    if (fit.status === 'bad') {
      showToast('One task row is too large to print cleanly. Divide or shorten it before exporting.');
      setJsaStep('review');
      return;
    }
    const missing = getReviewChecks(jsa).filter(check => !check.ok);
    if (missing.length) {
      const proceed = confirm(`The JSA still has ${missing.length} review item${missing.length === 1 ? '' : 's'}:\n\n${missing.map(item => `• ${item.label}`).join('\n')}\n\nPrint anyway?`);
      if (!proceed) {
        setJsaStep('review');
        return;
      }
    }
    saveDraft(false);
    const originalTitle = document.title;
    document.title = buildExportName(jsa);
    const restoreTitle = () => { document.title = originalTitle; };
    window.addEventListener('afterprint', restoreTitle, { once: true });
    setTimeout(() => {
      window.print();
      setTimeout(restoreTitle, 1500);
    }, 120);
  }

  const selectedTemplate = allTemplates.find(t => t.id === templateId);
  const draftLabel = savedDraft?.lastSavedAt ? `Draft saved ${nowNice(new Date(savedDraft.lastSavedAt))}` : 'No active saved draft';

  return (
    <>
      <div className="appShell">
        <header className="topbar">
          <div className="brandText">
            <h1>{APP_NAME}</h1>
            <p>{APP_SUB} · v{APP_VERSION}</p>
            {BUILD_TIME && <p className="buildStamp">{buildStamp(BUILD_TIME, BUILD_COMMIT)}</p>}
          </div>
          <div className="topActions">
            <span className="saveStatus">{jsa.lastSavedAt ? `Draft saved ${nowNice(new Date(jsa.lastSavedAt))}` : 'No active saved draft'}</span>
            <button className="topBtn" onClick={() => setSettings(prev => ({ ...prev, theme: settings.theme === 'dark' ? 'light' : 'dark' }))}>
              {settings.theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
        </header>

        <nav className="appNav">
          <button className={tab === 'home' ? 'active' : ''} onClick={goHome}>Home</button>
          <button className={tab === 'documents' ? 'active' : ''} onClick={goDocs}>Documents</button>
          <button className={tab === 'drafts' ? 'active' : ''} onClick={() => setTab('drafts')}>Drafts</button>
          <button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>Templates</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Settings</button>
        </nav>

        <main className="page">
          {tab === 'home' && <HomeView savedDraft={savedDraft} customTemplates={customTemplates} goJsaStart={goJsaStart} setTab={setTab} loadSavedDraft={loadSavedDraft} />}
          {tab === 'documents' && !activeDoc && <DocCenterView goJsaStart={goJsaStart} />}
          {tab === 'documents' && activeDoc === 'jsa-start' && (
            <JsaStartView allTemplates={allTemplates} selectedTemplate={selectedTemplate} templateId={templateId} setTemplateId={setTemplateId} loadTemplate={requestLoadTemplate} loadSavedDraft={loadSavedDraft} startBlank={requestStartBlank} savedDraft={savedDraft} />
          )}
          {tab === 'documents' && activeDoc === 'jsa' && (
            <JsaWorkflow
              jsa={jsa} upd={upd} jsaStep={jsaStep} setJsaStep={setJsaStep}
              goDocs={goDocs} goJsaStart={goJsaStart}
              allTemplates={allTemplates} templateId={templateId} setTemplateId={setTemplateId} selectedTemplate={selectedTemplate} loadTemplate={loadTemplate}
              saveName={saveName} setSaveName={setSaveName} saveTemplate={saveTemplate} updateTemplate={updateTemplate}
              addRow={addRow} updRow={updRow} removeRow={removeRow} insertLine={insertLine} insertLines={insertLines} upsertSuggestedTaskRow={upsertSuggestedTaskRow} addSummaryAsRow={addSummaryAsRow} addRowTemplate={addRowTemplate}
              clearDraft={clearDraft} saveDraft={saveDraft} markReady={markReady} exportPdf={exportPdf}
              savedDraft={savedDraft} settings={settings} saveStatus={saveStatus}
            />
          )}
          {tab === 'drafts' && <DraftsView savedDraft={savedDraft} loadSavedDraft={loadSavedDraft} clearDraft={() => { if (!savedDraft) return; if (!confirm('Delete this draft?')) return; setJsa(emptyJsa()); localStorage.removeItem(KEYS.draft); setSavedDraft(null); showToast('Draft deleted.'); }} />}
          {tab === 'templates' && <TemplatesView allTemplates={allTemplates} customTemplates={customTemplates} loadTemplate={requestLoadTemplate} deleteTemplate={deleteTemplate} startBlank={requestStartBlank} />}
          {tab === 'settings' && <SettingsView settings={settings} setSettings={setSettings} />}
        </main>
      </div>

      {confirmReplace && (
        <ConfirmReplaceDialog
          templateName={confirmReplace.action === 'template' ? allTemplates.find(t => t.id === confirmReplace.templateId)?.name : null}
          onCancel={confirmReplaceCancel}
          onContinue={confirmReplaceContinue}
        />
      )}

      <PrintableJsa jsa={jsa} />
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ── Home view ── */
function HomeView({ savedDraft, customTemplates, goJsaStart, setTab, loadSavedDraft }) {
  const hasDraft = Boolean(savedDraft);
  const draftLabel = savedDraft?.lastSavedAt ? `Last saved ${nowNice(new Date(savedDraft.lastSavedAt))}` : 'Saved on this device';
  const draftTitle = savedDraft?.jobSite || savedDraft?.templateName || 'Untitled JSA Draft';
  return (
    <div className="homeLayout">
      <section className={`homeWorkspace${hasDraft ? '' : ' single'}`}>
        {hasDraft && (
          <div className="workspacePanel workspacePanelMain">
            <span className="workspaceEyebrow">Continue Working</span>
            <h2>{draftTitle}</h2>
            <p>{draftLabel}</p>
            <button className="btn primary lg" onClick={loadSavedDraft}>Open Current Draft</button>
          </div>
        )}
        <div className={`workspacePanel${hasDraft ? '' : ' workspacePanelMain'}`}>
          <span className="workspaceEyebrow">{hasDraft ? 'New Document' : 'Get Started'}</span>
          <h2>Create New Document</h2>
          <p>Choose a document type and starting method.</p>
          <button className="btn primary lg" onClick={goJsaStart}>Start New Document</button>
        </div>
      </section>

      <div className="homeSecondaryActions">
        <button className="secondaryLink" onClick={() => setTab('drafts')}>
          <span>Open Drafts</span>
          <small>{hasDraft ? '1 saved draft' : 'No saved drafts'}</small>
        </button>
        <button className="secondaryLink" onClick={() => setTab('templates')}>
          <span>Manage Templates</span>
          <small>{customTemplates.length} custom template{customTemplates.length !== 1 ? 's' : ''}</small>
        </button>
      </div>

      <section className="homeModules">
        <h3 className="homeModulesTitle">Document Types</h3>
        <div className="moduleGrid">
          <button className="moduleTile active" onClick={goJsaStart}>
            <div className="moduleTileHead">
              <strong>Job Safety Analysis</strong>
              <span className="badge avail">Active</span>
            </div>
            <p>Build a JSA, load a template, set crew count, and export the final PDF.</p>
          </button>
          <div className="moduleTile locked">
            <div className="moduleTileHead">
              <IconLock className="moduleLockIcon" />
              <strong>Incident Report</strong>
              <span className="badge soon">Coming Later</span>
            </div>
            <p>Document incidents and near misses in a structured format.</p>
          </div>
          <div className="moduleTile locked">
            <div className="moduleTileHead">
              <IconLock className="moduleLockIcon" />
              <strong>Field Observation</strong>
              <span className="badge soon">Coming Later</span>
            </div>
            <p>Record corrective actions and safety observations.</p>
          </div>
          <div className="moduleTile locked">
            <div className="moduleTileHead">
              <IconLock className="moduleLockIcon" />
              <strong>Unplanned Event Report</strong>
              <span className="badge soon">Coming Later</span>
            </div>
            <p>Capture unplanned events before they escalate.</p>
          </div>
          <div className="moduleTile locked">
            <div className="moduleTileHead">
              <IconLock className="moduleLockIcon" />
              <strong>Sign-In Sheet</strong>
              <span className="badge soon">Coming Later</span>
            </div>
            <p>Standalone sign-in sheet for meetings and training.</p>
          </div>
          <div className="moduleTile locked">
            <div className="moduleTileHead">
              <IconLock className="moduleLockIcon" />
              <strong>Weekly Inspection</strong>
              <span className="badge soon">Coming Later</span>
            </div>
            <p>Site safety inspection checklists.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Document center ── */
function DocCenterView({ goJsaStart }) {
  return (
    <div className="sectionStack">
      <div className="sectionTitle">
        <div className="eyebrow">Documents</div>
        <h2>Start a Document</h2>
        <p>Select a document type. Only the JSA creator is active in this version; the rest will be added in later phases.</p>
      </div>
      <div className="card">
        <div className="cardBody">
          <div className="docGrid">
            <button className="docTile active" onClick={goJsaStart}>
              <strong>Job Safety Analysis</strong>
              <span className="badge avail">Available</span>
              <p>Start blank, load a saved template, or continue a draft.</p>
            </button>
            <div className="docTile disabled"><strong>Incident Report</strong><span className="badge soon">Coming Later</span><p>Structured incident and near miss documentation.</p></div>
            <div className="docTile disabled"><strong>Field Observation</strong><span className="badge soon">Coming Later</span><p>Safety observations and corrective actions.</p></div>
            <div className="docTile disabled"><strong>Unplanned Event Report</strong><span className="badge soon">Coming Later</span><p>Capture unplanned events before they escalate.</p></div>
            <div className="docTile disabled"><strong>Sign-In Sheet</strong><span className="badge soon">Coming Later</span><p>Standalone sign-in sheet for meetings.</p></div>
            <div className="docTile disabled"><strong>Weekly Inspection</strong><span className="badge soon">Coming Later</span><p>Site safety inspection checklists.</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── JSA start / launcher ── */
function JsaStartView({ allTemplates, selectedTemplate, templateId, setTemplateId, loadTemplate, loadSavedDraft, startBlank, savedDraft }) {
  return (
    <div className="sectionStack">
      <div className="sectionTitle">
        <div className="eyebrow">Job Safety Analysis</div>
        <h2>Start a JSA</h2>
        <p>Choose how you want to begin. Templates and drafts are selected here, before the builder opens.</p>
      </div>
      <div className="card">
        <div className="cardHeader"><h3>Start Options</h3></div>
        <div className="cardBody">
          <div className="launchGrid">
            <button className="launchChoice featured" onClick={startBlank}>
              <strong>Start Blank</strong>
              <p>Open a clean JSA form. Good for new jobs or when you want to build a fresh template from scratch.</p>
            </button>
            <button className="launchChoice" onClick={loadSavedDraft} style={{ opacity: savedDraft ? 1 : .65 }}>
              <strong>Continue Draft</strong>
              <p>{savedDraft?.lastSavedAt ? `Draft available — saved ${nowNice(new Date(savedDraft.lastSavedAt))}` : 'No draft found on this device.'}</p>
            </button>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="cardHeader">
          <h3>Load a Template</h3>
          <p>Templates save recurring job info, hazards, and controls. Daily fields reset automatically when loaded.</p>
        </div>
        <div className="cardBody">
          <div className="templateLauncher">
            <label className="field">
              <span>Choose Template</span>
              <select value={templateId} onChange={e => setTemplateId(e.target.value)}>
                {allTemplates.map(t => <option key={t.id} value={t.id}>{t.source === 'custom' ? 'Custom: ' : ''}{t.name}</option>)}
              </select>
            </label>
            <button className="btn secondary" onClick={() => loadTemplate(templateId)}>Load Template</button>
            {selectedTemplate?.description && <p className="helperText templateLauncher">{selectedTemplate.description}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sticky workflow action bar (touch devices): one Back/Next location,
   quiet save status, reachable above the keyboard and Safari's bottom UI. ── */
function StickyActionBar({ idx, steps, prev, next, exportPdf, showPreview, setShowPreview, saveStatus }) {
  const isFirst = idx === 0;
  const isLast = idx === steps.length - 1;
  const nextStep = steps[idx + 1];
  const statusText = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : '';
  return (
    <div className="stickyActionBar">
      <div className="stickyActionSide stickyActionLeft">
        {!isFirst && <button className="btn ghost sm" onClick={prev}>Back</button>}
      </div>
      <div className={`stickyActionStatus${saveStatus === 'error' ? ' error' : ''}`} aria-live="polite">{statusText}</div>
      <div className="stickyActionSide stickyActionRight">
        {!isLast && (
          <button className="btn outline sm" onClick={() => setShowPreview(v => !v)}>
            {showPreview ? 'Hide Preview' : 'Preview'}
          </button>
        )}
        {!isLast && nextStep && <button className="btn primary sm" onClick={next}>Next: {nextStep.label}</button>}
        {isLast && <button className="btn primary sm" onClick={exportPdf}>Print / Save PDF</button>}
      </div>
    </div>
  );
}

/* ── JSA Workflow ── */
function JsaWorkflow({ jsa, upd, jsaStep, setJsaStep, goDocs, goJsaStart, allTemplates, templateId, setTemplateId, selectedTemplate, loadTemplate, saveName, setSaveName, saveTemplate, updateTemplate, addRow, updRow, removeRow, insertLine, insertLines, upsertSuggestedTaskRow, addSummaryAsRow, addRowTemplate, clearDraft, saveDraft, markReady, exportPdf, savedDraft, settings, saveStatus }) {
  const fit = calcFit(jsa);
  const sigCount = Math.max(1, Math.min(100, Number(jsa.signatureLineCount) || 1));
  const idx = STEPS.findIndex(s => s.id === jsaStep);
  const shellRef = useRef(null);
  const shellWidth = useElementWidth(shellRef);
  const isTouchPrimary = useIsTouchPrimary();
  const canSideBySide = !isTouchPrimary && shellWidth >= 1000;
  const [showPreview, setShowPreview] = useState(false);
  const debugLayout = useDebugLayoutFlag();
  const layoutMode = canSideBySide ? 'desktop-side-by-side' : (isTouchPrimary ? 'touch-stacked' : 'desktop-stacked-narrow');
  const previewOpen = jsaStep === 'review' || showPreview;

  function prev() { if (idx > 0) setJsaStep(STEPS[idx - 1].id); }
  function next() { if (idx < STEPS.length - 1) setJsaStep(STEPS[idx + 1].id); }

  const previewPanel = (
    <div className="card previewPanel">
      <div className="previewPanelHeader">
        <div>
          <strong>Live Preview</strong>
          <span>Live page plan and layout check</span>
        </div>
        <button className="btn sm outline" onClick={exportPdf}>Print / Save PDF</button>
      </div>
      <JsaPreview jsa={jsa} />
    </div>
  );

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="docHeader">
          <div>
            <button className="backBtn" onClick={goJsaStart}>Back to Start Options</button>
            <div className="eyebrow">Job Safety Analysis</div>
            <h2>JSA Builder</h2>
            <p>Fill in each section. Use Preview to check the layout before exporting. Save the final PDF outside the app.</p>
          </div>
          <div className="docHeaderMeta">
            <span className={`fitBadge ${fit.status}`}>{fit.label}</span>
            <span className={`badge ${jsa.status}`}>{jsa.status === 'ready' ? 'Ready to Export' : 'Draft'}</span>
            {!canSideBySide && !isTouchPrimary && jsaStep !== 'review' && (
              <button className="btn sm outline" onClick={() => setShowPreview(v => !v)}>
                {showPreview ? 'Hide Preview' : 'Preview JSA'}
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: '0 16px 14px', overflowX: 'auto' }}>
          {isTouchPrimary ? (
            <CompactStepper steps={STEPS} jsa={jsa} jsaStep={jsaStep} setJsaStep={setJsaStep} />
          ) : (
            <div className="progressStrip">
              {STEPS.map((s, i) => {
                const st = stepStatus(jsa, s.id);
                return (
                  <button key={s.id} className={`progressStep${jsaStep === s.id ? ' active' : ''}`} onClick={() => setJsaStep(s.id)}>
                    <span className="stepNum">{i + 1}</span>
                    <span className="stepInfo">
                      <strong>{s.label}</strong>
                      <small>{s.helper}</small>
                    </span>
                    <span className={`stepChip ${st}`}>{stepStatusLabel(st)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className={`workflowShell${canSideBySide ? '' : ' stacked'}`} ref={shellRef}>
        <div className="workflowLeft">
          {jsaStep === 'job' && <StepJob jsa={jsa} upd={upd} prev={prev} next={next} />}
          {jsaStep === 'meeting' && <StepMeeting jsa={jsa} upd={upd} prev={prev} next={next} />}
          {jsaStep === 'work' && <StepWork jsa={jsa} upd={upd} insertLine={insertLine} insertLines={insertLines} upsertSuggestedTaskRow={upsertSuggestedTaskRow} addRow={addRow} updRow={updRow} removeRow={removeRow} addSummaryAsRow={addSummaryAsRow} addRowTemplate={addRowTemplate} customQuick={settings.customQuick || { task: [], hazard: [], control: [] }} prev={prev} next={next} />}
          {jsaStep === 'signatures' && <StepSignatures jsa={jsa} upd={upd} sigCount={sigCount} prev={prev} next={next} />}
          {jsaStep === 'review' && <StepReview jsa={jsa} upd={upd} fit={fit} saveName={saveName} setSaveName={setSaveName} saveTemplate={saveTemplate} updateTemplate={updateTemplate} saveDraft={saveDraft} markReady={markReady} exportPdf={exportPdf} clearDraft={clearDraft} prev={prev} next={next} />}

          {!canSideBySide && previewOpen && previewPanel}
        </div>

        {canSideBySide && (
          <div className="workflowRight">
            {previewPanel}
          </div>
        )}
      </div>

      {debugLayout && (
        <LayoutDebugPanel
          containerRef={shellRef}
          layoutMode={layoutMode}
          previewMode={layoutMode}
          stepperMode={isTouchPrimary ? 'compact (3+2 / 5 via container query)' : 'expanded cards'}
          jobPairMode={isTouchPrimary ? 'forced-stack (date/time); container-query (client/muster)' : 'container-query (all pairs)'}
          quickPanelMode={isTouchPrimary ? 'stacked full-width, collapsed by default' : 'side-by-side column'}
        />
      )}

      {isTouchPrimary && (
        <StickyActionBar
          idx={idx}
          steps={STEPS}
          prev={prev}
          next={next}
          exportPdf={exportPdf}
          showPreview={showPreview}
          setShowPreview={setShowPreview}
          saveStatus={saveStatus}
        />
      )}
    </>
  );
}

/* ── Step: Job Info ── */
function StepJob({ jsa, upd, prev, next }) {
  const isTouchPrimary = useIsTouchPrimary();
  // Date/Job # and Time Issued/Time Expired pair native date/time controls, whose
  // real intrinsic width in WebKit cannot be reliably measured from this codebase
  // (see reports/audits — Chromium-based testing cannot reproduce Safari's native
  // control rendering). On touch devices these always stack as independent
  // full-width fields rather than risk it. Client/Muster Point are plain text
  // inputs with predictable sizing, so they keep the container-query pairing.
  const datePairClass = `formPairRow${isTouchPrimary ? ' forcedStack' : ''}`;
  return (
    <div className="stepStack">
      <div className="card">
        <div className="cardHeader"><h3>Job Information</h3></div>
        <div className="cardBody">
          <div className="formGrid">
            <F label="Location / City" value={jsa.location} onChange={v => upd({ location: v })} />
            <F label="Job Site" value={jsa.jobSite} onChange={v => upd({ jobSite: v })} />
            <div className={datePairClass}>
              <F label="Date" type="date" value={jsa.date} onChange={v => upd({ date: v })} />
              <F label="Job #" value={jsa.jobNumber} onChange={v => upd({ jobNumber: v })} />
            </div>
            <div className="formPairRow">
              <F label="Client" value={jsa.client} onChange={v => upd({ client: v })} />
              <F label="Muster Point" value={jsa.musterPoint} onChange={v => upd({ musterPoint: v })} />
            </div>
            <div className={datePairClass}>
              <F label="Time Issued" type="time" value={jsa.timeIssued} onChange={v => upd({ timeIssued: v })} />
              <F label="Time Expired" type="time" value={jsa.timeExpired} onChange={v => upd({ timeExpired: v })} />
            </div>
            <F label="Superintendent / Foreman" value={jsa.superintendentForeman} onChange={v => upd({ superintendentForeman: v })} />
            <F label="Emergency / Rescue Phone #" value={jsa.emergencyPhone} onChange={v => upd({ emergencyPhone: v })} />
            <F label="Site Contact Phone #" value={jsa.siteContactPhone} onChange={v => upd({ siteContactPhone: v })} />
            <F label="Nearest Medical Facility" value={jsa.nearestMedicalFacility} onChange={v => upd({ nearestMedicalFacility: v })} />
            <F label="Assigned Mentor / SSE Number" value={jsa.assignedMentorSse} onChange={v => upd({ assignedMentorSse: v })} />
          </div>
        </div>
      </div>
      <StepFooter prev={prev} next={next} hasPrev={false} hasNext />
    </div>
  );
}

/* ── Shared contextual Suggestions system (touch devices) ──
   Reuses QuickPanel exactly as-is (same component, same recent/favorites/
   search/localStorage logic) — only changes where it renders. Desktop keeps
   the existing always-visible side-by-side QuickPanel unchanged. `quickPanelTitle`
   is passed straight through to QuickPanel unchanged so its derived localStorage
   keys never change; `sheetTitle` is only the overlay's own visible heading. */
function SuggestionsSheet({ title, onClose, children }) {
  const dialogRef = useFocusTrapDialog(onClose);
  return (
    <div className="suggestionsOverlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="suggestionsSheet" role="dialog" aria-modal="true" aria-label={title} ref={dialogRef}>
        <div className="suggestionsSheetHead">
          <strong>{title}</strong>
          <button className="btn sm ghost" onClick={onClose} aria-label="Close suggestions">Close</button>
        </div>
        <div className="suggestionsSheetBody">{children}</div>
      </div>
    </div>
  );
}
function FieldWithSuggestions({ label, value, onChange, onBlur, rows, placeholder, quickPanelTitle, sheetTitle, groups, onPick, itemType, fieldKey, activeSuggestion, setActiveSuggestion }) {
  const isTouchPrimary = useIsTouchPrimary();
  if (!isTouchPrimary) {
    return (
      <div className="fieldWithQuick">
        <TA label={label} value={value} onChange={onChange} onBlur={onBlur} rows={rows} placeholder={placeholder} />
        <QuickPanel title={quickPanelTitle} groups={groups} onPick={onPick} existingValue={value} itemType={itemType} />
      </div>
    );
  }
  const isOpen = activeSuggestion === fieldKey;
  return (
    <div className="fieldStack">
      <TA label={label} value={value} onChange={onChange} onBlur={onBlur} rows={rows} placeholder={placeholder} />
      <button type="button" className="suggestionsTrigger" onClick={() => setActiveSuggestion(fieldKey)}>
        Suggestions
      </button>
      {isOpen && (
        <SuggestionsSheet title={sheetTitle} onClose={() => setActiveSuggestion(null)}>
          <QuickPanel forceOpen title={quickPanelTitle} groups={groups} onPick={onPick} existingValue={value} itemType={itemType} />
        </SuggestionsSheet>
      )}
    </div>
  );
}

/* ── Step: Meeting Info ── */
function StepMeeting({ jsa, upd, prev, next }) {
  const [activeSuggestion, setActiveSuggestion] = useState(null);
  return (
    <div className="stepStack">
      <div className="card">
        <div className="cardHeader">
          <h3>Daily Safety Meeting</h3>
          <p>Use quick inserts as shortcuts, then adjust wording as needed.</p>
        </div>
        <div className="cardBody">
          <div className="formGrid">
            <FieldWithSuggestions
              label="Tailgate Safety Topic" value={jsa.tailgateTopic} onChange={v => upd({ tailgateTopic: v })} rows={4}
              placeholder="Topic discussed at today's tailgate meeting."
              quickPanelTitle="Quick Topics" sheetTitle="Topic Suggestions" groups={TAILGATE_GROUPS} onPick={item => upd({ tailgateTopic: item })}
              fieldKey="topic" activeSuggestion={activeSuggestion} setActiveSuggestion={setActiveSuggestion}
            />
            <FieldWithSuggestions
              label="Previous Day Injury / Near Miss" value={jsa.previousDaySafety} onChange={v => upd({ previousDaySafety: v })} rows={4}
              placeholder="Enter previous day safety status."
              quickPanelTitle="Quick Previous Day" sheetTitle="Previous Day Suggestions" groups={PREV_DAY_GROUPS} onPick={item => upd({ previousDaySafety: item })}
              fieldKey="previousDay" activeSuggestion={activeSuggestion} setActiveSuggestion={setActiveSuggestion}
            />
            <FieldWithSuggestions
              label="Overall Work Task or Activity" value={jsa.overallWorkTask} onChange={v => upd({ overallWorkTask: v })} rows={4}
              placeholder="Describe the overall scope of work today."
              quickPanelTitle="Quick Overall Tasks" sheetTitle="Overall Task Suggestions" groups={OVERALL_TASK_GROUPS} onPick={item => upd({ overallWorkTask: item })}
              fieldKey="overallTask" activeSuggestion={activeSuggestion} setActiveSuggestion={setActiveSuggestion}
            />
          </div>
        </div>
      </div>
      <StepFooter prev={prev} next={next} hasPrev hasNext />
    </div>
  );
}

/* ── Step: Tasks / Hazards ── */
function StepWork({ jsa, upd, insertLine, insertLines, upsertSuggestedTaskRow, addRow, updRow, removeRow, addSummaryAsRow, addRowTemplate, customQuick, prev, next }) {
  const [suggestionReview, setSuggestionReview] = useState(null);
  const [selectedHazards, setSelectedHazards] = useState([]);
  const [selectedControls, setSelectedControls] = useState([]);
  const [activeSuggestion, setActiveSuggestion] = useState(null);

  const taskGroups = useMemo(() => customQuick?.task?.length
    ? [{ title: 'My Custom Tasks', items: customQuick.task }, ...DAILY_TASK_GROUPS]
    : DAILY_TASK_GROUPS, [customQuick]);
  const hazardGroups = useMemo(() => customQuick?.hazard?.length
    ? [{ title: 'My Custom Hazards', items: customQuick.hazard }, ...HAZARD_GROUPS]
    : HAZARD_GROUPS, [customQuick]);
  const controlGroups = useMemo(() => customQuick?.control?.length
    ? [{ title: 'My Custom Controls', items: customQuick.control }, ...CONTROL_GROUPS]
    : CONTROL_GROUPS, [customQuick]);

  function chooseTask(item) {
    const task = typeof item === 'string' ? item : item.label;
    insertLine('dailyTasks', task, 'task');
    const suggestion = findTaskSuggestion(task);
    if (!suggestion || (!suggestion.hazards.length && !suggestion.controls.length)) return;
    setSuggestionReview(suggestion);
    setSelectedHazards(suggestion.hazards);
    setSelectedControls(suggestion.controls);
  }

  function toggleSelected(list, setter, item) {
    setter(list.includes(item) ? list.filter(value => value !== item) : [...list, item]);
  }

  function applySuggestions(mode = 'selected') {
    if (!suggestionReview) return;
    const hazards = mode === 'all' ? suggestionReview.hazards : selectedHazards;
    const controls = mode === 'all' ? suggestionReview.controls : selectedControls;
    upsertSuggestedTaskRow(suggestionReview.task, hazards, controls);
    setSuggestionReview(null);
  }

  return (
    <div className="stepStack">
      <div className="card">
        <div className="cardHeader">
          <h3>Tasks, Hazards, and Controls</h3>
          <p>Tasks describe the work. Hazards describe what could cause harm. Controls describe how the risk will be reduced.</p>
        </div>
        <div className="cardBody">
          <div className="formGrid">
            <FieldWithSuggestions
              label="Tasks for Today" value={jsa.dailyTasks} onChange={v => upd({ dailyTasks: v })}
              onBlur={() => upd({ dailyTasks: dedupeList(splitLines(jsa.dailyTasks)).join('\n') })} rows={6}
              placeholder="Enter each work activity on its own line."
              quickPanelTitle="Quick Daily Tasks" sheetTitle="Daily Task Suggestions" groups={taskGroups} onPick={chooseTask}
              fieldKey="dailyTasks" activeSuggestion={activeSuggestion} setActiveSuggestion={setActiveSuggestion}
            />

            {suggestionReview && (
              <div className="taskSuggestionCard">
                <div className="taskSuggestionHead">
                  <div>
                    <span className="suggestionEyebrow">Task-based suggestions</span>
                    <h4>{suggestionReview.task}</h4>
                    <p>Review these common items for today’s actual conditions. Approved items stay paired with this task in the printed table.</p>
                  </div>
                  <button className="miniDanger" onClick={() => setSuggestionReview(null)}>Close</button>
                </div>
                <div className="suggestionColumns">
                  <div className="suggestionColumn">
                    <strong>Suggested Hazards</strong>
                    {suggestionReview.hazards.map(item => (
                      <label className="suggestionCheck" key={item}>
                        <input type="checkbox" checked={selectedHazards.includes(item)} onChange={() => toggleSelected(selectedHazards, setSelectedHazards, item)} />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                  <div className="suggestionColumn">
                    <strong>Suggested Controls</strong>
                    {suggestionReview.controls.map(item => (
                      <label className="suggestionCheck" key={item}>
                        <input type="checkbox" checked={selectedControls.includes(item)} onChange={() => toggleSelected(selectedControls, setSelectedControls, item)} />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="suggestionActions">
                  <button className="btn ghost sm" onClick={() => setSuggestionReview(null)}>Task Only</button>
                  <button className="btn secondary sm" onClick={() => applySuggestions('selected')}>Add Selected</button>
                  <button className="btn primary sm" onClick={() => applySuggestions('all')}>Add All Suggestions</button>
                </div>
              </div>
            )}

            <FieldWithSuggestions
              label="Hazards in Work Area" value={jsa.hazardsSummary} onChange={v => upd({ hazardsSummary: v })}
              onBlur={() => upd({ hazardsSummary: dedupeList(splitLines(jsa.hazardsSummary)).join('\n') })} rows={6}
              placeholder="Enter each exposure or hazardous condition on its own line."
              quickPanelTitle="Quick Hazards" sheetTitle="Hazard Suggestions" groups={hazardGroups} onPick={item => insertLine('hazardsSummary', item, 'hazard')}
              fieldKey="hazards" activeSuggestion={activeSuggestion} setActiveSuggestion={setActiveSuggestion}
            />
            <FieldWithSuggestions
              label="Controls and Mitigations" value={jsa.controlsSummary} onChange={v => upd({ controlsSummary: v })}
              onBlur={() => upd({ controlsSummary: dedupeList(splitLines(jsa.controlsSummary)).join('\n') })} rows={6}
              placeholder="Enter each preventive action or requirement on its own line."
              quickPanelTitle="Quick Controls" sheetTitle="Control Suggestions" groups={controlGroups} onPick={item => insertLine('controlsSummary', item, 'control')}
              fieldKey="controls" activeSuggestion={activeSuggestion} setActiveSuggestion={setActiveSuggestion}
            />
          </div>
        </div>
      </div>

      <details className="detailedRowsDisclosure" open={(jsa.taskRows || []).length > 0}>
        <summary>
          <div className="detailedRowsSummaryText">
            <div className="detailedRowsSummaryTitle">
              <strong>Detailed Task Rows</strong>
              <span className="badge draft">Optional</span>
            </div>
            <p>Pair a task with its own hazards and controls. Most JSAs can use the summary fields above.</p>
          </div>
          <span className="detailedRowsSummaryAction">{(jsa.taskRows || []).length > 0 ? 'Show Details' : 'Add Details'}</span>
        </summary>
        <div className="detailedRowsBody">
          <div className="standardBehaviorBox">
            <div>
              <strong>Auto-fill from summary</strong>
              <p>Creates one row from the Tasks, Hazards, and Controls fields above.</p>
            </div>
            <button className="btn ghost sm" onClick={addSummaryAsRow}>Create Row From Summary</button>
          </div>

          <details className="quickPanel">
            <summary>Task Row Templates</summary>
            <div className="quickPickerInner">
              <QuickRowTemplateSelector groups={TASK_ROW_GROUPS} onPick={addRowTemplate} />
            </div>
          </details>

          {(jsa.taskRows || []).length > 0 && (
            <div className="taskRowList">
              {(jsa.taskRows || []).map((row, i) => (
                <div className="taskRow" key={i}>
                  <div className="taskRowHead">
                    <strong>Task Row #{i + 1}</strong>
                    <button className="miniDanger" onClick={() => removeRow(i)}>Remove</button>
                  </div>
                  <div className="taskRowBody">
                    <TA label="Task / Activity" value={row.step} onChange={v => updRow(i, { step: v })} rows={3} />
                    <TA label="Task-Specific Hazards" value={row.hazards} onChange={v => updRow(i, { hazards: v })} onBlur={() => updRow(i, { hazards: dedupeList(splitLines(row.hazards)).join('\n') })} rows={3} />
                    <TA label="Task-Specific Controls" value={row.controls} onChange={v => updRow(i, { controls: v })} onBlur={() => updRow(i, { controls: dedupeList(splitLines(row.controls)).join('\n') })} rows={3} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="btn ghost full" onClick={addRow}>Add Blank Task Row</button>
        </div>
      </details>
      <StepFooter prev={prev} next={next} hasPrev hasNext />
    </div>
  );
}

/* ── Step: Signatures ── */
function StepSignatures({ jsa, upd, sigCount, prev, next }) {
  return (
    <div className="stepStack">
      <div className="card">
        <div className="cardHeader"><h3>Signatures and Acknowledgement</h3></div>
        <div className="cardBody">
          <div className="formGrid">
            <TA label="Acknowledgement Text" value={jsa.acknowledgement} onChange={v => upd({ acknowledgement: v })} rows={6} />
            <div className="sigSetup">
              <label className="field">
                <span>Number of Signature Lines</span>
                <input type="number" min="1" max="100" value={sigCount} onChange={e => upd({ signatureLineCount: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} />
                <small>Signatures always print on a separate attached sign-in sheet, up to 40 lines per sheet.</small>
              </label>
              <div className="sigRuleBox">
                <strong>Attached sign-in sheet will be generated.</strong>
                <p>The main JSA will note an attached sign-in sheet. Requested lines: {sigCount}.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <StepFooter prev={prev} next={next} hasPrev hasNext />
    </div>
  );
}

/* ── Step: Review / Export ── */
function StepReview({ jsa, upd, fit, saveName, setSaveName, saveTemplate, updateTemplate, saveDraft, markReady, exportPdf, clearDraft, prev, next }) {
  const checks = getReviewChecks(jsa);
  const completeCount = checks.filter(check => check.ok).length;
  const plan = getPagePlan(jsa);
  return (
    <div className="stepStack">
      <div className="card">
        <div className="cardHeader">
          <h3>Review and Export</h3>
          <p>Use this final check before opening the browser print dialog. Keep Margins set to Default and Paper size set to Letter.</p>
        </div>
        <div className="cardBody">
          <div className="formGrid">
            <TA label="Internal Notes / Special Instructions" value={jsa.notes} onChange={v => upd({ notes: v })} rows={4} placeholder="Optional notes visible in the draft only, not on the printed JSA." />
            <div className={`pageFitBox ${fit.status}`}>
              <strong>{fit.label}</strong>
              <p>{fit.message}</p>
            </div>

            <div className="reviewSummaryCard">
              <div className="reviewSummaryHead">
                <div>
                  <span className="suggestionEyebrow">Export quality check</span>
                  <h4>{completeCount} of {checks.length} checks complete</h4>
                </div>
                <span className={`reviewScore${completeCount === checks.length ? ' complete' : ''}`}>{Math.round((completeCount / checks.length) * 100)}%</span>
              </div>
              <div className="reviewChecklist">
                {checks.map(check => (
                  <div className={`reviewCheck${check.ok ? ' ok' : ' missing'}`} key={check.label}>
                    <span>{check.ok ? '✓' : '!'}</span>
                    <p>{check.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="exportPlanGrid">
              <div><strong>Main JSA</strong><span>1 page</span></div>
              <div><strong>Continuation</strong><span>{plan.continuationPages.length}</span></div>
              <div><strong>Sign-In</strong><span>{plan.signInPages.length}</span></div>
              <div><strong>Total</strong><span>{plan.totalPages}</span></div>
            </div>
            <div className="exportNamePreview">
              <strong>Suggested PDF filename</strong>
              <code>{buildExportName(jsa)}.pdf</code>
            </div>

            <div className="reviewActions">
              <button className="btn ghost" onClick={clearDraft}>Clear Draft</button>
              <button className="btn secondary" onClick={() => saveDraft()}>Save Draft</button>
              <button className="btn ghost" onClick={markReady}>Mark Ready</button>
              <button className="btn primary" onClick={exportPdf}>Print / Save PDF</button>
            </div>
            <p className="helperText">Save the PDF to your device, iCloud, OneDrive, Google Drive, or project folder. The app does not store final PDFs.</p>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="cardHeader">
          <h3>Template Actions</h3>
          <p>Save recurring project information, common hazards, and common controls. Date, times, tailgate topic, previous-day status, daily tasks, detailed rows, and notes reset when the template is loaded.</p>
        </div>
        <div className="cardBody">
          <div className="formGrid">
            <div className="templateActions">
              <label className="field">
                <span>Save current setup as custom template</span>
                <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Example: Entergy JSA" />
              </label>
              <button className="btn primary" onClick={saveTemplate}>Save Template</button>
              <button className="btn ghost" onClick={updateTemplate}>Update Loaded</button>
            </div>
            <p className="helperText">Loading a template starts a fresh JSA for today and never carries over signatures or daily work details.</p>
          </div>
        </div>
      </div>
      <StepFooter prev={prev} next={next} hasPrev hasNext={false} />
    </div>
  );
}

/* ── Step footer ── */
function StepFooter({ prev, next, hasPrev, hasNext }) {
  // Touch devices get the sticky workflow action bar (JsaWorkflow) instead —
  // this avoids duplicate Back/Next controls on the same screen.
  const isTouchPrimary = useIsTouchPrimary();
  if (isTouchPrimary) return null;
  return (
    <div className="stepFooter">
      <div className="leftBtns">
        {hasPrev && <button className="btn ghost" onClick={prev}>Back</button>}
      </div>
      <div className="rightBtns">
        {hasNext && <button className="btn primary" onClick={next}>Next</button>}
      </div>
    </div>
  );
}

/* ── Drafts view ── */
function DraftsView({ savedDraft, loadSavedDraft, clearDraft }) {
  return (
    <div className="sectionStack">
      <div className="sectionTitle">
        <div className="eyebrow">Drafts</div>
        <h2>Saved Drafts</h2>
        <p>Drafts are editable JSAs saved on this device. Export final PDFs outside the app.</p>
      </div>
      <div className="card">
        <div className="cardHeader"><h3>JSA Drafts</h3></div>
        <div className="cardBody">
          {savedDraft ? (
            <div className="listItem">
              <div className="itemInfo">
                <strong>{savedDraft.jobSite || savedDraft.templateName || 'JSA Draft'}</strong>
                <p>{savedDraft.lastSavedAt ? `Last saved ${nowNice(new Date(savedDraft.lastSavedAt))}` : 'Saved on this device'}</p>
              </div>
              <div className="itemActions">
                <button className="btn secondary sm" onClick={loadSavedDraft}>Open Draft</button>
                <button className="btn ghost sm" onClick={clearDraft}>Delete</button>
              </div>
            </div>
          ) : (
            <div className="emptyState">No saved JSA draft on this device.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Templates view ── */
function TemplatesView({ allTemplates, customTemplates, loadTemplate, deleteTemplate, startBlank }) {
  return (
    <div className="sectionStack">
      <div className="sectionTitle">
        <div className="eyebrow">Templates</div>
        <h2>Reusable Templates</h2>
        <p>Templates save recurring job information, hazards, controls, and setup language. They are not final documents. Save a custom template from the JSA builder.</p>
      </div>
      <div className="card">
        <div className="cardHeader"><h3>JSA Templates</h3></div>
        <div className="cardBody">
          <div className="listStack">
            <div className="listItem">
              <div className="itemInfo">
                <strong>Blank JSA</strong>
                <p>Start from a clean form and build a new template if needed.</p>
              </div>
              <div className="itemActions">
                <button className="btn secondary sm" onClick={startBlank}>Use Blank</button>
              </div>
            </div>
            {customTemplates.length ? customTemplates.map(t => (
              <div className="listItem" key={t.id}>
                <div className="itemInfo">
                  <strong>{t.name}</strong>
                  <p>Updated {t.updatedAt ? nowNice(new Date(t.updatedAt)) : 'on this device'}</p>
                </div>
                <div className="itemActions">
                  <button className="btn secondary sm" onClick={() => loadTemplate(t.id)}>Load</button>
                  <button className="btn ghost sm" onClick={() => deleteTemplate(t.id)}>Delete</button>
                </div>
              </div>
            )) : (
              <div className="emptyState">No custom templates yet. Open the JSA builder, fill in the recurring information, then save it as a custom template on the Review step.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Settings view ── */
function SettingsView({ settings, setSettings }) {
  const [quickType, setQuickType] = useState('task');
  const [quickLabel, setQuickLabel] = useState('');
  const customQuick = settings.customQuick || { task: [], hazard: [], control: [] };

  function addCustomQuick() {
    const label = quickLabel.trim();
    if (!label) return;
    const existing = customQuick[quickType] || [];
    if (existing.some(item => isNearDuplicate(item, label))) {
      alert(`A similar ${quickType} already exists in your custom list.`);
      return;
    }
    setSettings(prev => ({
      ...prev,
      customQuick: {
        ...(prev.customQuick || { task: [], hazard: [], control: [] }),
        [quickType]: [...existing, label],
      },
    }));
    setQuickLabel('');
  }

  function removeCustomQuick(type, label) {
    setSettings(prev => ({
      ...prev,
      customQuick: {
        ...(prev.customQuick || { task: [], hazard: [], control: [] }),
        [type]: (prev.customQuick?.[type] || []).filter(item => normalizeEntry(item) !== normalizeEntry(label)),
      },
    }));
  }

  return (
    <div className="sectionStack">
      <div className="sectionTitle">
        <div className="eyebrow">Settings</div>
        <h2>App Settings</h2>
        <p>This build stores drafts, templates, favorites, recent items, and custom quick adds locally on this device.</p>
      </div>
      <div className="card">
        <div className="cardHeader"><h3>Display</h3></div>
        <div className="cardBody">
          <div className="settingsRow">
            <div className="rowInfo">
              <strong>Theme</strong>
              <p>Dark mode uses charcoal gray with red accents. Light mode uses a white layout.</p>
            </div>
            <button className="btn ghost" onClick={() => setSettings(prev => ({ ...prev, theme: settings.theme === 'dark' ? 'light' : 'dark' }))}>
              Switch to {settings.theme === 'dark' ? 'Light' : 'Dark'} Mode
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardHeader">
          <h3>Custom Quick Adds</h3>
          <p>Add company- or site-specific language. You must choose whether it is a task, hazard, or control so it stays in the correct lane.</p>
        </div>
        <div className="cardBody">
          <div className="customQuickBuilder">
            <label className="field">
              <span>Type</span>
              <select value={quickType} onChange={e => setQuickType(e.target.value)}>
                <option value="task">Task — work being performed</option>
                <option value="hazard">Hazard — exposure or harmful condition</option>
                <option value="control">Control — preventive action or requirement</option>
              </select>
            </label>
            <label className="field">
              <span>Custom wording</span>
              <input value={quickLabel} onChange={e => setQuickLabel(e.target.value)} placeholder={`Enter a custom ${quickType}`} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomQuick(); } }} />
            </label>
            <button className="btn primary" onClick={addCustomQuick}>Add Custom Item</button>
          </div>
          <div className="customQuickLists">
            {['task','hazard','control'].map(type => (
              <div className="customQuickList" key={type}>
                <strong>{type === 'task' ? 'Tasks' : type === 'hazard' ? 'Hazards' : 'Controls'}</strong>
                {(customQuick[type] || []).length ? (customQuick[type] || []).map(item => (
                  <div className="customQuickItem" key={item}>
                    <span>{item}</span>
                    <button className="miniDanger" onClick={() => removeCustomQuick(type, item)}>Remove</button>
                  </div>
                )) : <p>No custom {type}s saved.</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardHeader"><h3>Storage Workflow</h3></div>
        <div className="cardBody">
          <div className="workflowNotes">
            <p><strong>Inside the app:</strong> Editable drafts, reusable templates, favorites, recent quick adds, custom quick adds, and settings. One active JSA draft is supported in this pilot build.</p>
            <p><strong>Outside the app:</strong> Final PDFs should be saved to your desktop, iPad Files, OneDrive, iCloud, or project folder after export.</p>
            <p><strong>Important:</strong> All data is stored locally in your browser. Clearing browser data will remove saved drafts, templates, and custom items.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── JSA Preview ── */
function JsaPreview({ jsa }) {
  const plan = getPagePlan(jsa);
  const fit = calcFit(jsa);
  const viewportRef = useRef(null);
  const [scale, setScale] = useState(0.55);

  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    const update = () => {
      const width = Math.max(280, node.clientWidth - 28);
      setScale(Math.min(1, width / 816));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="previewPageManager">
        <span><strong>Main JSA</strong> 1</span>
        <span><strong>Continuation</strong> {plan.continuationPages.length}</span>
        <span><strong>Sign-In</strong> {plan.signInPages.length}</span>
        <span className="previewTotal"><strong>Total</strong> {plan.totalPages}</span>
      </div>
      <div className="previewTruthBar">
        <span className={`previewFit ${fit.status}`}>{fit.label}</span>
        <p>Exact Letter-page preview with standard default-margin space.</p>
      </div>
      <div className="previewSheetViewport" ref={viewportRef} style={{ height: `${1056 * scale + 28}px` }}>
        <div className="previewSheetCanvas" style={{ transform: `scale(${scale})` }}>
          <div className="previewDefaultMargin">
            <MainJsaDocumentPage jsa={jsa} plan={plan} className="previewDocumentPage" />
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Quick panel (details/summary) ── */
function QuickPanel({ title, groups, onPick, existingValue = '', itemType = 'item', forceOpen = false }) {
  const isTouchPrimary = useIsTouchPrimary();
  const keyBase = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const recentKey = `sdc.quick.recent.${keyBase}`;
  const favoriteKey = `sdc.quick.favorites.${keyBase}`;
  const [recent, setRecent] = useState(() => safeJson(localStorage.getItem(recentKey), []));
  const [favorites, setFavorites] = useState(() => safeJson(localStorage.getItem(favoriteKey), []));
  const baseGroups = Array.isArray(groups) ? groups : [];
  const availableGroups = [
    ...(favorites.length ? [{ title: 'Favorites', items: favorites }] : []),
    ...(recent.length ? [{ title: 'Recently Used', items: recent }] : []),
    ...baseGroups,
  ];
  const [active, setActive] = useState(availableGroups[0]?.title || '');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!availableGroups.some(group => group.title === active)) setActive(availableGroups[0]?.title || '');
  }, [favorites.length, recent.length, groups]);

  const group = availableGroups.find(g => g.title === active) || availableGroups[0] || { title: '', items: [] };
  const allItems = baseGroups.flatMap(g => g.items || []);
  const sourceItems = search.trim() ? allItems : group.items;
  const seen = new Set();
  const filtered = sourceItems.filter(item => {
    const label = typeof item === 'string' ? item : item.label;
    const key = normalizeEntry(label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return key.includes(normalizeEntry(search));
  });
  const existing = splitLines(existingValue);

  function pick(item) {
    const label = typeof item === 'string' ? item : item.label;
    const next = [label, ...recent.filter(value => normalizeEntry(value) !== normalizeEntry(label))].slice(0, 10);
    setRecent(next);
    localStorage.setItem(recentKey, JSON.stringify(next));
    onPick(item);
  }

  function toggleFavorite(event, item) {
    event.preventDefault();
    event.stopPropagation();
    const label = typeof item === 'string' ? item : item.label;
    const included = favorites.some(value => normalizeEntry(value) === normalizeEntry(label));
    const next = included
      ? favorites.filter(value => normalizeEntry(value) !== normalizeEntry(label))
      : [label, ...favorites].slice(0, 20);
    setFavorites(next);
    localStorage.setItem(favoriteKey, JSON.stringify(next));
  }

  return (
    <details className="quickPanel" open={forceOpen || !isTouchPrimary}>
      <summary>{title}</summary>
      <div className="quickPickerInner">
        <div className="quickControls">
          <div className="quickField">
            <span>Category</span>
            <select value={active} onChange={e => { setActive(e.target.value); setSearch(''); }}>
              {availableGroups.map(g => <option key={g.title} value={g.title}>{g.title}</option>)}
            </select>
          </div>
          <div className="quickField">
            <span>Search all {itemType}s</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${itemType}s`} />
          </div>
        </div>
        <div className="chipGroup">
          {filtered.length ? filtered.map(item => {
            const label = typeof item === 'string' ? item : item.label;
            const isFavorite = favorites.some(value => normalizeEntry(value) === normalizeEntry(label));
            const isIncluded = existing.some(value => isNearDuplicate(value, label));
            return (
              <div className={`quickChipWrap${isIncluded ? ' included' : ''}`} key={label}>
                <button className="chip" onClick={() => pick(item)} title={isIncluded ? 'Already included; click to review task suggestions' : `Add ${label}`}>
                  <span>{label}</span>
                  {isIncluded && <small>Included</small>}
                </button>
                <button className={`favoriteBtn${isFavorite ? ' active' : ''}`} onClick={event => toggleFavorite(event, item)} aria-label={isFavorite ? `Remove ${label} from favorites` : `Add ${label} to favorites`} title={isFavorite ? 'Remove favorite' : 'Favorite'}>★</button>
              </div>
            );
          }) : <p className="noResults">No items match that search.</p>}
        </div>
      </div>
    </details>
  );
}

/* ── Task row template selector (inline in details) ── */
function QuickRowTemplateSelector({ groups, onPick }) {
  const [active, setActive] = useState(groups[0]?.title || '');
  const group = groups.find(g => g.title === active) || groups[0] || { title: '', items: [] };
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="quickField">
        <span>Category</span>
        <select value={active} onChange={e => setActive(e.target.value)}>
          {groups.map(g => <option key={g.title} value={g.title}>{g.title}</option>)}
        </select>
      </div>
      <div className="chipGroup">
        {group.items.map(item => (
          <button key={item.label} className="chip" onClick={() => onPick(item)}>{item.label}</button>
        ))}
      </div>
    </div>
  );
}

/* ── Primitive form fields ── */
function F({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </label>
  );
}
function TA({ label, value, onChange, onBlur, rows = 4, placeholder = '' }) {
  // Content-aware height: grows with typed content up to a CSS max-height,
  // then scrolls internally. Resizing style.height doesn't touch the value
  // or selection, so it never causes a cursor jump.
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <textarea ref={ref} rows={rows} value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} onBlur={onBlur} className="autoGrow" />
    </label>
  );
}

/* ── PrintableJsa ── */
function PrintBrandHeader({ title, subtitle, pageNumber, totalPages }) {
  return (
    <header className="printBrandHeader">
      <div className="printBrandBar">
        <img src={SHACKELFORD_LOGO} alt="Shackelford Construction and Hauling" />
        <div className="printBrandTitles">
          <h1>{title}</h1>
          <h2>{subtitle}</h2>
        </div>
        <div className="printPageNumber">Page {pageNumber} of {totalPages}</div>
      </div>
      <div className="printRedRule" />
    </header>
  );
}

function PrintTaskTable({ rows, className = '' }) {
  return (
    <table className={`printTaskTable ${className}`.trim()}>
      <thead><tr><th>Individual Task Steps</th><th>Hazards</th><th>Controls &amp; Mitigations</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><td>{r.step}</td><td>{r.hazards}</td><td>{r.controls}</td></tr>)}</tbody>
    </table>
  );
}

function MainJsaDocumentPage({ jsa, plan, className = '' }) {
  const sigCount = Math.max(1, Math.min(100, Number(jsa.signatureLineCount) || 1));
  return (
    <div className={`documentPage mainJsaPage ${className}`.trim()}>
      <PrintBrandHeader title="Job Safety Analysis" subtitle="JSA & Tailgate Meeting Form" pageNumber={1} totalPages={plan.totalPages} />
      <table className="printInfoTable">
        <tbody>
          <tr><th>Location:</th><td>{jsa.location}</td><th>Time Issued:</th><td>{jsa.timeIssued}</td><th>Date:</th><td>{dateStr(jsa.date)}</td></tr>
          <tr><th>Job Site:</th><td>{jsa.jobSite}</td><th>Time Expired:</th><td>{jsa.timeExpired}</td><th>Job #:</th><td>{jsa.jobNumber}</td></tr>
          <tr><th>Superintendent/Foreman:</th><td>{jsa.superintendentForeman}</td><th>Emergency/Rescue Phone #:</th><td>{jsa.emergencyPhone}</td><th>Client:</th><td>{jsa.client}</td></tr>
          <tr><th>Nearest Medical Facility:</th><td>{jsa.nearestMedicalFacility}</td><th>Site Contact Phone #:</th><td>{jsa.siteContactPhone}</td><th>Muster Point:</th><td>{jsa.musterPoint}</td></tr>
        </tbody>
      </table>
      <div className="ackBlock"><strong>Subcontractors/Employee(s) Acknowledgement:</strong> {jsa.acknowledgement}</div>
      <div className="attachedSignInNotice"><strong>Sign-In:</strong> Attached sign-in sheet generated for {sigCount} signatures.</div>
      <table className="printSimpleTable">
        <tbody>
          <tr><th>Assigned Mentor &amp; SSE Number:</th><td>{jsa.assignedMentorSse}</td></tr>
          <tr><th>Tailgate Safety Topic:</th><td>{jsa.tailgateTopic}</td></tr>
          <tr><th>Near Miss, Incidents, Injuries Previous Day:</th><td>{jsa.previousDaySafety}</td></tr>
          <tr><th>List Overall Work Task or Activity:</th><td>{jsa.overallWorkTask}</td></tr>
        </tbody>
      </table>
      <section className="energyBox">
        <h3>Potential Sources of Energy / Hazards to Consider</h3>
        <div className="energyGrid">
          <p><strong>Gravity:</strong> Slips, trips, falls; housekeeping; falling objects; working at height; cave-in; suspended loads.</p>
          <p><strong>Motion:</strong> Caught in/on/between; rotating equipment; moving equipment; heavy equipment; body positioning; vehicle/equipment movement.</p>
          <p><strong>Mechanical:</strong> Rotating equipment; drive belts; conveyors; motors; compressed springs; tools.</p>
          <p><strong>Electrical:</strong> Shock; high voltage; overhead power lines; lightning; energized equipment; wiring; batteries.</p>
          <p><strong>Pressure:</strong> Pneumatic/hydraulic; stored energy; compressed cylinders; hoses; fluids and gases.</p>
          <p><strong>Temperature:</strong> Hot/cold surfaces; weather; open flame; heat/cold stress.</p>
          <p><strong>Chemical:</strong> Splash; inhalation; dust; fumes; corrosives; combustibles; toxic compounds.</p>
          <p><strong>Sound/Radiation/Biological:</strong> Noise; vibration; solar rays; insects; animals; contaminated water.</p>
        </div>
      </section>
      <div className="taskTableFill" style={{ '--task-row-count': Math.max(1, plan.mainRows.length) }}>
        <PrintTaskTable rows={plan.mainRows} />
      </div>
      {plan.continuationPages.length > 0 && <div className="continuationFlag">Additional task rows continue on the attached JSA continuation sheet.</div>}
      <footer className="printFooter">Shackelford Construction and Hauling, LLC · Safety First · Main JSA</footer>
    </div>
  );
}

function PrintableJsa({ jsa }) {
  const plan = getPagePlan(jsa);

  return (
    <div className="printOnly">
      <MainJsaDocumentPage jsa={jsa} plan={plan} className="printPage" />

      {plan.continuationPages.map((rows, idx) => (
        <TaskContinuationPage
          key={idx}
          jsa={jsa}
          rows={rows}
          pageNumber={2 + idx}
          totalPages={plan.totalPages}
          continuationNumber={idx + 1}
          continuationTotal={plan.continuationPages.length}
        />
      ))}

      <AttachedSignIn
        jsa={jsa}
        pages={plan.signInPages}
        pageOffset={1 + plan.continuationPages.length}
        totalPages={plan.totalPages}
      />
    </div>
  );
}

function TaskContinuationPage({ jsa, rows, pageNumber, totalPages, continuationNumber, continuationTotal }) {
  return (
    <div className="printPage continuationPage">
      <PrintBrandHeader title="JSA Continuation Sheet" subtitle={`Continuation ${continuationNumber} of ${continuationTotal}`} pageNumber={pageNumber} totalPages={totalPages} />
      <table className="printInfoTable continuationInfoTable">
        <tbody>
          <tr><th>Job Site:</th><td>{jsa.jobSite}</td><th>Date:</th><td>{dateStr(jsa.date)}</td><th>Job #:</th><td>{jsa.jobNumber}</td></tr>
          <tr><th>Location:</th><td>{jsa.location}</td><th>Superintendent/Foreman:</th><td>{jsa.superintendentForeman}</td><th>Overall Task:</th><td>{jsa.overallWorkTask}</td></tr>
        </tbody>
      </table>
      <div className="continuationNotice">Continuation of the task, hazard, and control table from the main JSA. Review with the crew as part of the same JSA.</div>
      <PrintTaskTable rows={rows} className="continuationTaskTable" />
      <footer className="printFooter">Shackelford Construction and Hauling, LLC · JSA Continuation</footer>
    </div>
  );
}

function AttachedSignIn({ jsa, pages, pageOffset, totalPages }) {
  return (
    <>
      {pages.map((lines, pageIdx) => {
        const rowCount = Math.ceil(lines.length / 2);
        return (
          <div className="printPage signInPage" key={pageIdx}>
            <PrintBrandHeader title="JSA Sign-In Sheet" subtitle={`Attached Sign-In ${pageIdx + 1} of ${pages.length}`} pageNumber={pageOffset + pageIdx + 1} totalPages={totalPages} />
            <table className="printInfoTable signInInfoTable">
              <tbody>
                <tr><th>Location:</th><td>{jsa.location}</td><th>Date:</th><td>{dateStr(jsa.date)}</td><th>Job #:</th><td>{jsa.jobNumber}</td></tr>
                <tr><th>Job Site:</th><td>{jsa.jobSite}</td><th>Superintendent/Foreman:</th><td>{jsa.superintendentForeman}</td><th>Overall Task:</th><td>{jsa.overallWorkTask}</td></tr>
              </tbody>
            </table>
            <div className="ackBlock signInAck"><strong>Acknowledgement:</strong> I have reviewed and understand the JSA and tailgate meeting information and will exercise stop work authority for unsafe acts, conditions, or hazards.</div>
            <div className="attachedSignatureGrid" style={{ '--signature-rows': rowCount }}>
              {lines.map(n => <div className="attachedSigLine" key={n}>{n}.</div>)}
            </div>
            <footer className="printFooter">Shackelford Construction and Hauling, LLC · Attached Sign-In Sheet</footer>
          </div>
        );
      })}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
