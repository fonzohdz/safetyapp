import { CAUSE_CATEGORIES, causeKey } from './incidentModel';
import { BODY_DIAGRAM_SRC, BODY_DIAGRAM_ASPECT } from './BodyDiagram';

/* Print/PDF rendering for the Incident Report. Mirrors the reference
   document ("SCH Blank incident report (1).docx") section-for-section:
   same six pages, same section order, same field wording. Continuation
   pages are appended for any of the four long free-text fields whose
   content doesn't fit its base-page box (see textFit.js /
   incidentPdfGenerate.js for how chunks are computed) -- nothing here ever
   truncates text itself, it only renders whatever chunk it's given. */

const SHACKELFORD_LOGO = `${import.meta.env.BASE_URL}icons/shackelford-logo.webp`;
const FORM_TITLE = 'INCIDENT REPORTING AND INVESTIGATION FORM';

function fmtDate(v) {
  if (!v) return '';
  // Accepts YYYY-MM-DD (native date input) -- render as MM/DD/YYYY to match
  // the reference document's own "(MM/DD/YY)" convention.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return v;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function fmtDateTime(v) {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return v;
  const [, y, mo, d, h, mi] = m;
  const hour = Number(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = ((hour + 11) % 12) + 1;
  return `${mo}/${d}/${y} ${h12}:${mi} ${ampm}`;
}

function fmtTime(v) {
  if (!v) return '';
  const m = /^(\d{2}):(\d{2})/.exec(v);
  if (!m) return v;
  const hour = Number(m[1]);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = ((hour + 11) % 12) + 1;
  return `${h12}:${m[2]} ${ampm}`;
}

export function IncidentPageShell({ pageRef, pageNumber, totalPages, draft, children, className = '' }) {
  return (
    <div ref={pageRef} className={`incidentPage ${className}`}>
      <IncidentHeader pageNumber={pageNumber} totalPages={totalPages} />
      <div className="incidentPageBody">{children}</div>
      {draft && <div className="incidentWatermark">DRAFT</div>}
    </div>
  );
}

function IncidentHeader({ pageNumber, totalPages, continuationLabel }) {
  return (
    <header className="incidentHeader">
      <div className="incidentHeaderBar">
        <img src={SHACKELFORD_LOGO} alt="Shackelford Construction and Hauling" className="incidentHeaderLogo" />
        <div className="incidentHeaderTitles">
          <h1>{FORM_TITLE}</h1>
          {continuationLabel && <h2>CONTINUATION &mdash; {continuationLabel}</h2>}
        </div>
        <div className="incidentHeaderPageNum">Page {pageNumber} of {totalPages}</div>
      </div>
      <div className="incidentRedRule" />
    </header>
  );
}

export function GrayBar({ children }) {
  return <div className="incGrayBar">{children}</div>;
}

export function InfoTable({ rows }) {
  return (
    <table className="incInfoTable">
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              cell.isLabel
                ? <th key={j} style={cell.width ? { width: cell.width } : undefined}>{cell.text}</th>
                : <td key={j}>{cell.text}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function label(text, width) { return { isLabel: true, text, width }; }
export function value(text) { return { isLabel: false, text: text || '' }; }

export function TextBlock({ title, help, text, minHeightPx }) {
  return (
    <div className="incTextBlockWrap">
      {title && <div className="incTextBlockTitle">{title}</div>}
      {help && <div className="incTextBlockHelp">{help}</div>}
      <div className="incTextBlock" style={minHeightPx ? { minHeight: `${minHeightPx}px` } : undefined}>
        {text || ''}
      </div>
    </div>
  );
}

function YesNoLine({ label: lbl, val, note }) {
  return (
    <div className="incYesNoLine">
      <span className="incYesNoLabel">{lbl}:</span>
      <span className="incYesNoValue">{val === 'yes' ? 'YES' : val === 'no' ? 'NO' : '\u2014'}</span>
      {note && val === 'yes' && <span className="incYesNoNote">{note}</span>}
    </div>
  );
}

/* ── PAGE 1 ── */
export function Page1Content({ incident, descriptionText }) {
  return (
    <>
      <InfoTable rows={[
        [label('Workplace Location', '32%'), value(incident.workplaceLocation)],
        [label('Date of Incident', '20%'), value(fmtDate(incident.incidentDate)), label('Time of Incident', '20%'), value(fmtTime(incident.incidentTime))],
        [label('Date/Time of Written Report', '32%'), value(fmtDateTime(incident.writtenReportDateTime))],
        [label('Date/Time Reported to Supervisor', '32%'), value(fmtDateTime(incident.reportedToSupervisorDateTime))],
      ]} />
      <GrayBar>SUPERINTENDENT/SUPERVISOR CONTACT INFORMATION</GrayBar>
      <InfoTable rows={[
        [label('Reporting Supervisor/Investigator Name', '32%'), value(incident.investigatorName)],
        [label('Title/Position', '32%'), value(incident.investigatorTitle)],
        [label('Contact Number', '32%'), value(incident.investigatorPhone)],
        [label('Email Address', '32%'), value(incident.investigatorEmail)],
      ]} />
      <InfoTable rows={[
        [label('Where the Incident Occurred (specify)', '32%'), value(incident.incidentSpecificLocation)],
      ]} />
      <TextBlock title="DETAILED DESCRIPTION OF THE INCIDENT" text={descriptionText} minHeightPx={140} />
    </>
  );
}

/* ── PAGE 2 ──
   Always renders the full reference-form structure (injured-party fields,
   remarks, body diagram) regardless of the Yes/No answer -- when Injury is
   No, every detail field prints "N/A" and the diagram prints clean (no
   marks) instead of collapsing the whole section to one generic sentence,
   so the printed page always matches the reference form's layout. */
export function Page2Content({ incident }) {
  const injured = incident.injuryOccurred === 'yes';
  const na = v => (injured ? (v || 'N/A') : 'N/A');
  return (
    <>
      <YesNoLine label="INJURY" val={incident.injuryOccurred} note="(see details below)" />
      <GrayBar>INJURED PARTY</GrayBar>
      <InfoTable rows={[
        [label('Name, Title, Years in Company & Current Trade', '38%'), value(na([incident.injuredPartyName, incident.injuredPartyTitle, incident.injuredPartyYearsWithCompany, incident.injuredPartyCurrentTrade].filter(Boolean).join(' \u2022 ')))],
        [label('Contact Info (phone)', '38%'), value(na(incident.injuredPartyPhone))],
        [label('Contact Info (email)', '38%'), value(na(incident.injuredPartyEmail))],
        [label('Nature of Injury', '38%'), value(na((incident.injuryNature || []).join(', ') + (incident.injuryNature?.includes('Other') && incident.injuryNatureOther ? ` (${incident.injuryNatureOther})` : '')))],
        [label('Body Part(s) Affected', '38%'), value(na(incident.bodyPartsAffectedText))],
        [label('Treatment', '38%'), value(na(incident.treatmentLevel === 'firstAid' ? 'First aid' : incident.treatmentLevel === 'beyondFirstAid' ? 'Services beyond first aid' : ''))],
        [label('Physician/Clinic for First Aid Treatment', '38%'), value(na(incident.treatingPhysicianOrClinic))],
      ]} />
      <TextBlock title="Remarks/Comments" text={injured ? (incident.injuryRemarks || '') : 'N/A'} minHeightPx={40} />
      <div className="incBodyDiagramSection">
        <div className="incTextBlockTitle">PART OF BODY AFFECTED (shade all areas that apply)</div>
        <div className="incidentBodyDiagramPrint">
          <div className="incidentBodyDiagramImageWrap" style={{ aspectRatio: BODY_DIAGRAM_ASPECT }}>
            <img src={BODY_DIAGRAM_SRC} alt="Body diagram" className="incidentBodyDiagramImage" />
            {injured && (incident.bodyDiagramMarks || []).map(m => (
              <span key={m.id} className="incidentBodyDiagramMark" style={{ left: `${m.xPct}%`, top: `${m.yPct}%` }} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Witness subsection (shared by pages 3 & 4) ──
   Always renders the full name/contact/statement/signature structure --
   for an unused witness slot (witness == null), every field prints "N/A"
   instead of collapsing the block to a single N/A box, so pages 3-4 always
   match the reference form's three-witness layout. */
export function WitnessBlock({ index, witness, statementText }) {
  const w = witness || {};
  const na = v => (witness ? (v || 'N/A') : 'N/A');
  return (
    <>
      <GrayBar>WITNESS {index}</GrayBar>
      <InfoTable rows={[
        [label('Name', '22%'), value(na(w.name)), label('Company', '22%'), value(na(w.company))],
        [label('Supervisor', '22%'), value(na(w.supervisor)), label('Phone', '22%'), value(na(w.phone))],
        [label('Email', '22%'), value(na(w.email)), label('Date', '22%'), value(witness && w.signatureDate ? fmtDate(w.signatureDate) : 'N/A')],
      ]} />
      <TextBlock title="Statement" text={witness ? (statementText || '') : 'N/A'} minHeightPx={55} />
      <div className="incSignatureRow">
        <span className="incSignatureRowLabel">Signature:</span>
        {w.signatureData
          ? <img src={w.signatureData} alt="Witness signature" className="incSignatureImage" />
          : <span className="incNotApplicableInline">{witness ? 'Not signed' : 'N/A'}</span>}
      </div>
    </>
  );
}

/* ── PAGE 3 ── */
export function Page3Content({ incident, statementChunks }) {
  return (
    <>
      <GrayBar>WITNESS AND/OR WITNESS STATEMENT</GrayBar>
      <WitnessBlock index={1} witness={incident.witnesses[0]} statementText={statementChunks[0]?.[0]} />
      <WitnessBlock index={2} witness={incident.witnesses[1]} statementText={statementChunks[1]?.[0]} />
    </>
  );
}

/* ── PAGE 4 ──
   The four-row property-damage table always renders; when Property Damage
   is No, every detail field prints "N/A" instead of the table disappearing. */
export function Page4Content({ incident, statementChunks }) {
  const damaged = incident.propertyDamageOccurred === 'yes';
  const na = v => (damaged ? (v || 'N/A') : 'N/A');
  return (
    <>
      <WitnessBlock index={3} witness={incident.witnesses[2]} statementText={statementChunks[2]?.[0]} />
      <YesNoLine label="PROPERTY DAMAGE" val={incident.propertyDamageOccurred} note="(see details below)" />
      <InfoTable rows={[
        [label('List Property/Material Damaged', '38%'), value(na(incident.propertyOrMaterialDamaged))],
        [label('Nature of Damage', '38%'), value(na(incident.natureOfDamage))],
        [label('Object(s)/Machine(s)/Tool(s)/Substance(s) Inflicting Damage', '38%'), value(na(incident.objectMachineToolOrSubstance))],
        [label('Approximate Cost of Damage', '38%'), value(na(incident.approximateDamageCost))],
      ]} />
    </>
  );
}

/* ── PAGE 5 -- Cause Analysis ──
   Every category's "Other" option is the final item in its items[] array
   (see incidentModel.js), so it always lands in the table's last row. That
   row renders the entered free-text directly inline (selection indicator +
   "Other (specify):" + text + primary asterisk) instead of a plain
   checklist row, matching the reference document -- there is deliberately
   no separate "Other" section below the table (that would duplicate the
   same three fields a second time). */
export function Page5Content({ incident }) {
  const maxRows = Math.max(...CAUSE_CATEGORIES.map(c => c.items.length));
  return (
    <>
      <div className="incCauseIntro">
        WHY DID THE INCIDENT OCCUR? SELECT ALL THAT APPLY &amp; PUT AN ASTERISK (*) BY THE ONE THAT BEST APPLIES AS THE PRIMARY, ROOT CAUSE, IF POSSIBLE.
      </div>
      <table className="incCauseTable">
        <thead>
          <tr>{CAUSE_CATEGORIES.map(c => <th key={c.id}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }).map((_, rowIdx) => (
            <tr key={rowIdx}>
              {CAUSE_CATEGORIES.map(cat => {
                const item = cat.items[rowIdx];
                if (item == null) return <td key={cat.id} />;
                const key = causeKey(cat.id, item);
                const checked = (incident.selectedCauses || []).includes(key);
                const isPrimary = incident.primaryCause === key;
                const isOtherRow = item === 'Other';
                return (
                  <td key={cat.id} className={checked ? 'incCauseChecked' : ''}>
                    <span className={`incCheckbox${checked ? ' checked' : ''}`}>{checked ? '\u2713' : ''}</span>
                    <span className="incCauseItemText">
                      {isOtherRow ? `Other (specify): ${incident[cat.otherField] || ''}` : item}
                      {isPrimary ? ' *' : ''}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ── PAGE 6 ──
   The investigation-team table always renders all 4 reference-form rows.
   Existing members populate rows in order; unused rows print blank (not an
   N/A box) -- an incomplete team just hasn't been filled in yet, which is
   different from a deliberate "not applicable" answer. */
export function Page6Content({ incident, supervisorNotesChunk, safetyConsultantNotesChunk }) {
  const team = incident.investigationTeam || [];
  const rows = Array.from({ length: 4 }).map((_, i) => team[i] || null);
  return (
    <>
      <GrayBar>SUPERINTENDENT/SUPERVISOR NOTES &amp; SUMMARY</GrayBar>
      <TextBlock help="List immediate actions to be taken & what should be done to help prevent a recurrence of this type of incident." text={supervisorNotesChunk} minHeightPx={95} />
      <GrayBar>SAFETY CONSULTANT NOTES &amp; SUMMARY</GrayBar>
      <TextBlock text={safetyConsultantNotesChunk} minHeightPx={95} />
      <GrayBar>INVESTIGATION TEAM</GrayBar>
      <table className="incInfoTable incTeamTable">
        <thead>
          <tr><th>Name</th><th>Title</th><th>Signature</th><th>Date</th></tr>
        </thead>
        <tbody>
          {rows.map((m, i) => (
            <tr key={m?.id || `empty-${i}`}>
              <td>{m?.name || ''}</td>
              <td>{m?.title || ''}</td>
              <td>{m?.signatureData ? <img src={m.signatureData} alt="Signature" className="incSignatureImage" /> : ''}</td>
              <td>{m?.date ? fmtDate(m.date) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ── Generic continuation page for overflowing long-text fields ── */
export function ContinuationPage({ sectionLabel, text, pageNumber, totalPages, draft, incident, pageRef }) {
  return (
    <div ref={pageRef} className="incidentPage incidentContinuationPage">
      <header className="incidentHeader">
        <div className="incidentHeaderBar">
          <img src={SHACKELFORD_LOGO} alt="Shackelford Construction and Hauling" className="incidentHeaderLogo" />
          <div className="incidentHeaderTitles">
            <h1>{FORM_TITLE}</h1>
            <h2>CONTINUATION &mdash; {sectionLabel}</h2>
          </div>
          <div className="incidentHeaderPageNum">Page {pageNumber} of {totalPages}</div>
        </div>
        <div className="incidentRedRule" />
      </header>
      <div className="incidentPageBody">
        <div className="incContinuationMeta">
          <span>{incident.workplaceLocation || '\u2014'}</span>
          <span>{fmtDate(incident.incidentDate) || '\u2014'}</span>
        </div>
        <div className="incTextBlock incTextBlockContinuation">{text}</div>
      </div>
      {draft && <div className="incidentWatermark">DRAFT</div>}
    </div>
  );
}
