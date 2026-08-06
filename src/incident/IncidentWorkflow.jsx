import { useRef, useLayoutEffect, useState } from 'react';
import {
  INCIDENT_STEPS, incidentStepStatus, INJURY_NATURE_OPTIONS, CAUSE_CATEGORIES, causeKey,
  emptyWitness, emptyTeamMember, getIncidentReadinessChecks, isIncidentReady, printedIncidentFingerprint,
} from './incidentModel';
import { incidentCopy as t } from './incidentCopy';
import SignaturePad from './SignaturePad';
import BodyDiagram from './BodyDiagram';

/* ── Small local presentational primitives ──
   Deliberately not imported from main.jsx (which exports nothing) -- kept
   self-contained here so the incident module has zero coupling to JSA
   internals. Visually they reuse the app's existing .field/.btn/.card
   design tokens from styles.css, they just don't share JS with StepJob's
   F/TA in main.jsx. */
function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

function TextAreaField({ label, help, value, onChange, rows = 4, placeholder = '' }) {
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
      {help && <small>{help}</small>}
      <textarea ref={ref} rows={rows} value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} className="autoGrow" />
    </label>
  );
}

function YesNoToggle({ label: lbl, value, onChange }) {
  return (
    <div className="field">
      <span>{lbl}</span>
      <div className="yesNoToggle">
        <button type="button" className={`btn${value === 'yes' ? ' active yes' : ''}`} onClick={() => onChange('yes')}>{t.yesNo.yes}</button>
        <button type="button" className={`btn${value === 'no' ? ' active no' : ''}`} onClick={() => onChange('no')}>{t.yesNo.no}</button>
      </div>
    </div>
  );
}

function StepPanel({ title, intro, children }) {
  return (
    <div className="stepPanel">
      <div className="stepPanelHeader">
        <h3>{title}</h3>
        {intro && <p>{intro}</p>}
      </div>
      <div className="incidentStepGrid">{children}</div>
    </div>
  );
}

function StepFooter({ onBack, onNext, hasBack, hasNext, nextLabel }) {
  return (
    <div className="stepFooter">
      <div className="leftBtns">
        {hasBack && <button className="btn ghost" onClick={onBack}>{t.nav.back}</button>}
      </div>
      <div className="rightBtns">
        {hasNext && <button className="btn primary" onClick={onNext}>{nextLabel || t.nav.next}</button>}
      </div>
    </div>
  );
}

function Stepper({ incident, step, onJump }) {
  const idx = Math.max(0, INCIDENT_STEPS.findIndex(s => s.id === step));
  return (
    <div className="stepperWrap">
      <div className="stepperHead">
        <span className="stepperCount">Step {idx + 1} of {INCIDENT_STEPS.length}</span>
      </div>
      <div className="stepperRail" role="tablist" aria-label="Incident report steps">
        {INCIDENT_STEPS.map((s, i) => {
          const status = incidentStepStatus(incident, s.id);
          const isActive = s.id === step;
          const isDone = status === 'complete';
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`${s.label}: ${isDone ? 'Complete' : 'Needs Info'}`}
              className={`stepperSeg${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}
              onClick={() => onJump(s.id)}
            >
              <span className="stepperSegDot" aria-hidden="true">{isDone ? '\u2713' : i + 1}</span>
              <span className="stepperSegLabel">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Step: Incident Details ── */
function StepDetails({ incident, upd, next }) {
  const c = t.details;
  return (
    <StepPanel title={c.title} intro={c.intro}>
      <Field label={c.workplaceLocation} value={incident.workplaceLocation} onChange={v => upd({ workplaceLocation: v })} />
      <div className="formPairRow">
        <Field label={c.incidentDate} type="date" value={incident.incidentDate} onChange={v => upd({ incidentDate: v })} />
        <Field label={c.incidentTime} type="time" value={incident.incidentTime} onChange={v => upd({ incidentTime: v })} />
      </div>
      <div className="formPairRow">
        <Field label={c.writtenReportDateTime} type="datetime-local" value={incident.writtenReportDateTime} onChange={v => upd({ writtenReportDateTime: v })} />
        <Field label={c.reportedToSupervisorDateTime} type="datetime-local" value={incident.reportedToSupervisorDateTime} onChange={v => upd({ reportedToSupervisorDateTime: v })} />
      </div>
      <div className="formSection">
        <span className="formSectionHeading">{c.investigatorSectionTitle}</span>
        <div className="formGrid">
          <Field label={c.investigatorName} value={incident.investigatorName} onChange={v => upd({ investigatorName: v })} />
          <Field label={c.investigatorTitle} value={incident.investigatorTitle} onChange={v => upd({ investigatorTitle: v })} />
          <div className="formPairRow">
            <Field label={c.investigatorPhone} type="tel" value={incident.investigatorPhone} onChange={v => upd({ investigatorPhone: v })} />
            <Field label={c.investigatorEmail} type="email" value={incident.investigatorEmail} onChange={v => upd({ investigatorEmail: v })} />
          </div>
        </div>
      </div>
      <Field label={c.incidentSpecificLocation} value={incident.incidentSpecificLocation} onChange={v => upd({ incidentSpecificLocation: v })} />
      <TextAreaField label={c.detailedIncidentDescription} rows={6} value={incident.detailedIncidentDescription} onChange={v => upd({ detailedIncidentDescription: v })} />
      <StepFooter hasNext onNext={next} />
    </StepPanel>
  );
}

/* ── Step: Injury ── */
function StepInjury({ incident, upd, prev, next }) {
  const c = t.injury;
  const injured = incident.injuryOccurred === 'yes';
  function toggleNature(opt) {
    const cur = incident.injuryNature || [];
    upd({ injuryNature: cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt] });
  }
  return (
    <StepPanel title={c.title} intro={c.intro}>
      <YesNoToggle label={c.injuryOccurred} value={incident.injuryOccurred} onChange={v => upd({ injuryOccurred: v })} />
      {injured && (
        <>
          <div className="formSection">
            <span className="formSectionHeading">{c.injuredPartySectionTitle}</span>
            <div className="formGrid">
              <Field label={c.injuredPartyName} value={incident.injuredPartyName} onChange={v => upd({ injuredPartyName: v })} />
              <div className="formPairRow">
                <Field label="Title" value={incident.injuredPartyTitle} onChange={v => upd({ injuredPartyTitle: v })} />
                <Field label="Years with company" value={incident.injuredPartyYearsWithCompany} onChange={v => upd({ injuredPartyYearsWithCompany: v })} />
              </div>
              <Field label="Current trade" value={incident.injuredPartyCurrentTrade} onChange={v => upd({ injuredPartyCurrentTrade: v })} />
              <div className="formPairRow">
                <Field label={c.injuredPartyPhone} type="tel" value={incident.injuredPartyPhone} onChange={v => upd({ injuredPartyPhone: v })} />
                <Field label={c.injuredPartyEmail} type="email" value={incident.injuredPartyEmail} onChange={v => upd({ injuredPartyEmail: v })} />
              </div>
            </div>
          </div>

          <div className="field">
            <span>{c.natureOfInjury}</span>
            <div className="chipGrid">
              {INJURY_NATURE_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  className={`chipToggle${(incident.injuryNature || []).includes(opt) ? ' active' : ''}`}
                  onClick={() => toggleNature(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          {(incident.injuryNature || []).includes('Other') && (
            <Field label={c.natureOfInjuryOther} value={incident.injuryNatureOther} onChange={v => upd({ injuryNatureOther: v })} />
          )}

          <Field label={c.bodyPartsAffectedText} value={incident.bodyPartsAffectedText} onChange={v => upd({ bodyPartsAffectedText: v })} />

          <div className="field">
            <span>{c.treatmentLevel}</span>
            <div className="yesNoToggle">
              <button type="button" className={`btn${incident.treatmentLevel === 'firstAid' ? ' active yes' : ''}`} onClick={() => upd({ treatmentLevel: 'firstAid' })}>{c.treatmentFirstAid}</button>
              <button type="button" className={`btn${incident.treatmentLevel === 'beyondFirstAid' ? ' active no' : ''}`} onClick={() => upd({ treatmentLevel: 'beyondFirstAid' })}>{c.treatmentBeyondFirstAid}</button>
            </div>
          </div>
          <Field label={c.treatingPhysicianOrClinic} value={incident.treatingPhysicianOrClinic} onChange={v => upd({ treatingPhysicianOrClinic: v })} />
          <TextAreaField label={c.injuryRemarks} rows={3} value={incident.injuryRemarks} onChange={v => upd({ injuryRemarks: v })} />

          <div className="field">
            <span>{c.bodyDiagramTitle}</span>
            <small>{c.bodyDiagramHelp}</small>
            <BodyDiagram marks={incident.bodyDiagramMarks || []} onChange={marks => upd({ bodyDiagramMarks: marks })} />
          </div>
        </>
      )}
      <StepFooter hasBack hasNext onBack={prev} onNext={next} />
    </StepPanel>
  );
}

/* ── Step: Witnesses ── */
function StepWitnesses({ incident, upd, prev, next }) {
  const c = t.witnesses;
  const witnesses = incident.witnesses || [];
  function addWitness() {
    if (witnesses.length >= 3) return;
    upd({ witnesses: [...witnesses, emptyWitness()] });
  }
  function updWitness(id, patch) {
    upd({ witnesses: witnesses.map(w => (w.id === id ? { ...w, ...patch } : w)) });
  }
  function removeWitness(id) {
    if (!window.confirm(t.confirmRemoveWitness)) return;
    upd({ witnesses: witnesses.filter(w => w.id !== id) });
  }
  return (
    <StepPanel title={c.title} intro={c.intro}>
      {witnesses.length === 0 && <p className="helperText">{c.empty}</p>}
      {witnesses.map((w, i) => (
        <div className="witnessCard" key={w.id}>
          <div className="cardRowHeader">
            <strong>Witness {i + 1}</strong>
            <button type="button" className="btn ghost sm" onClick={() => removeWitness(w.id)}>{c.removeWitness}</button>
          </div>
          <div className="formGrid">
            <div className="formPairRow">
              <Field label={c.name} value={w.name} onChange={v => updWitness(w.id, { name: v })} />
              <Field label={c.company} value={w.company} onChange={v => updWitness(w.id, { company: v })} />
            </div>
            <Field label={c.supervisor} value={w.supervisor} onChange={v => updWitness(w.id, { supervisor: v })} />
            <div className="formPairRow">
              <Field label={c.phone} type="tel" value={w.phone} onChange={v => updWitness(w.id, { phone: v })} />
              <Field label={c.email} type="email" value={w.email} onChange={v => updWitness(w.id, { email: v })} />
            </div>
          </div>
          <TextAreaField label={c.statement} rows={3} value={w.statement} onChange={v => updWitness(w.id, { statement: v })} />
          <div className="formPairRow">
            <SignaturePad label={c.signature} value={w.signatureData} onChange={data => updWitness(w.id, { signatureData: data, signatureDate: data ? new Date().toISOString().slice(0, 10) : w.signatureDate })} />
            <Field label={c.signatureDate} type="date" value={w.signatureDate} onChange={v => updWitness(w.id, { signatureDate: v })} />
          </div>
        </div>
      ))}
      {witnesses.length < 3
        ? <button type="button" className="btn secondary" onClick={addWitness}>{c.addWitness}</button>
        : <p className="helperText">{c.maxReached}</p>}
      <StepFooter hasBack hasNext onBack={prev} onNext={next} />
    </StepPanel>
  );
}

/* ── Step: Property Damage ── */
function StepProperty({ incident, upd, prev, next }) {
  const c = t.property;
  const damaged = incident.propertyDamageOccurred === 'yes';
  return (
    <StepPanel title={c.title} intro={c.intro}>
      <YesNoToggle label={c.propertyDamageOccurred} value={incident.propertyDamageOccurred} onChange={v => upd({ propertyDamageOccurred: v })} />
      {damaged && (
        <div className="formGrid">
          <Field label={c.propertyOrMaterialDamaged} value={incident.propertyOrMaterialDamaged} onChange={v => upd({ propertyOrMaterialDamaged: v })} />
          <Field label={c.natureOfDamage} value={incident.natureOfDamage} onChange={v => upd({ natureOfDamage: v })} />
          <Field label={c.objectMachineToolOrSubstance} value={incident.objectMachineToolOrSubstance} onChange={v => upd({ objectMachineToolOrSubstance: v })} />
          <Field label={c.approximateDamageCost} value={incident.approximateDamageCost} onChange={v => upd({ approximateDamageCost: v })} />
        </div>
      )}
      <StepFooter hasBack hasNext onBack={prev} onNext={next} />
    </StepPanel>
  );
}

/* ── Step: Cause Analysis ── */
function StepCause({ incident, upd, prev, next }) {
  const c = t.cause;
  const selected = incident.selectedCauses || [];
  function toggle(key) {
    if (selected.includes(key)) {
      const nextSelected = selected.filter(k => k !== key);
      upd({ selectedCauses: nextSelected, primaryCause: incident.primaryCause === key ? null : incident.primaryCause });
    } else {
      upd({ selectedCauses: [...selected, key] });
    }
  }
  function setPrimary(key) {
    upd({ primaryCause: incident.primaryCause === key ? null : key });
  }
  return (
    <StepPanel title={c.title} intro={c.intro}>
      {CAUSE_CATEGORIES.map(cat => (
        <div className="causeCategoryBlock" key={cat.id}>
          <div className="causeCategoryTitle">{cat.label}</div>
          {cat.items.map(item => {
            const key = causeKey(cat.id, item);
            const checked = selected.includes(key);
            return (
              <div className="causeItemRow" key={key}>
                <label>
                  <input type="checkbox" checked={checked} onChange={() => toggle(key)} />
                  <span>{item}</span>
                </label>
                {checked && (
                  <button type="button" className={`causePrimaryBtn${incident.primaryCause === key ? ' active' : ''}`} onClick={() => setPrimary(key)}>
                    {incident.primaryCause === key ? c.primaryBadge : c.setPrimary}
                  </button>
                )}
              </div>
            );
          })}
          {selected.includes(causeKey(cat.id, 'Other')) && (
            <Field label={c.otherLabel} value={incident[cat.otherField]} onChange={v => upd({ [cat.otherField]: v })} />
          )}
        </div>
      ))}
      {selected.length === 0 && <p className="helperText">{c.noneSelected}</p>}
      <StepFooter hasBack hasNext onBack={prev} onNext={next} />
    </StepPanel>
  );
}

/* ── Step: Notes & Investigation Team ── */
function StepNotes({ incident, upd, prev, next }) {
  const c = t.notes;
  const team = incident.investigationTeam || [];
  function addMember() {
    if (team.length >= 4) return;
    upd({ investigationTeam: [...team, emptyTeamMember()] });
  }
  function updMember(id, patch) {
    upd({ investigationTeam: team.map(m => (m.id === id ? { ...m, ...patch } : m)) });
  }
  function removeMember(id) {
    if (!window.confirm(t.confirmRemoveTeamMember)) return;
    upd({ investigationTeam: team.filter(m => m.id !== id) });
  }
  return (
    <StepPanel title={c.title}>
      <TextAreaField label={c.supervisorNotes} rows={4} value={incident.supervisorNotes} onChange={v => upd({ supervisorNotes: v })} />
      <TextAreaField label={c.safetyConsultantNotes} rows={4} value={incident.safetyConsultantNotes} onChange={v => upd({ safetyConsultantNotes: v })} />

      <div className="formSection">
        <span className="formSectionHeading">{c.teamSectionTitle}</span>
        {team.length === 0 && <p className="helperText">{c.empty}</p>}
        {team.map((m, i) => (
          <div className="teamMemberCard" key={m.id}>
            <div className="cardRowHeader">
              <strong>Member {i + 1}</strong>
              <button type="button" className="btn ghost sm" onClick={() => removeMember(m.id)}>{c.removeMember}</button>
            </div>
            <div className="formPairRow">
              <Field label={c.memberName} value={m.name} onChange={v => updMember(m.id, { name: v })} />
              <Field label={c.memberTitle} value={m.title} onChange={v => updMember(m.id, { title: v })} />
            </div>
            <div className="formPairRow">
              <SignaturePad label={c.memberSignature} value={m.signatureData} onChange={data => updMember(m.id, { signatureData: data, date: data ? new Date().toISOString().slice(0, 10) : m.date })} />
              <Field label={c.memberDate} type="date" value={m.date} onChange={v => updMember(m.id, { date: v })} />
            </div>
          </div>
        ))}
        {team.length < 4
          ? <button type="button" className="btn secondary" onClick={addMember}>{c.addMember}</button>
          : <p className="helperText">{c.maxReached}</p>}
      </div>
      <StepFooter hasBack hasNext onBack={prev} onNext={next} nextLabel={t.nav.finish} />
    </StepPanel>
  );
}

/* ── Step: Review & Export ── */
function StepReview({ incident, prev, pdfExportState, isPdfStale, onGeneratePdf, onShare, onDownload, onMarkReady, onStartNew }) {
  const c = t.review;
  const checks = getIncidentReadinessChecks(incident);
  const checklistComplete = isIncidentReady(incident);
  const isGenerating = pdfExportState?.phase === 'generating';
  const isReady = pdfExportState?.phase === 'ready';
  const status = incident.status;
  const headline = status === 'completed' ? c.completedHeadline : status === 'ready' ? c.readyHeadline : c.draftHeadline;
  return (
    <StepPanel title={c.title}>
      <div className="card">
        <div className="cardHeader">
          <strong>{c.readinessTitle}</strong>
          <p>{headline}</p>
        </div>
        {status === 'draft' && <p className="helperText">{checklistComplete ? c.markReadyHint : c.draftExplain}</p>}
        <div className="incidentReadinessList">
          {checks.map(chk => (
            <div key={chk.key} className={`incidentReadinessItem ${chk.ok ? 'ok' : 'pending'}`}>
              <span className="checkIcon">{chk.ok ? '\u2713' : '\u2022'}</span>
              <span>{chk.label}</span>
            </div>
          ))}
        </div>
        {status === 'draft' && (
          <div className="reviewPrimaryAction">
            <button className="btn secondary" onClick={onMarkReady} disabled={!checklistComplete}>{c.markReady}</button>
          </div>
        )}
      </div>

      <div className="card">
        {!isReady && (
          <div className="reviewPrimaryAction">
            <button className="btn primary lg" onClick={onGeneratePdf} disabled={isGenerating} aria-busy={isGenerating}>
              {isGenerating ? c.generating : c.generatePdf}
            </button>
          </div>
        )}

        {isReady && isPdfStale && (
          <div className="pdfStaleWarning">
            <strong>Document changed &mdash; regenerate PDF before sharing.</strong>
            <p>{c.stale}</p>
            <button className="btn primary sm" onClick={onGeneratePdf} disabled={isGenerating} aria-busy={isGenerating}>{c.regeneratePdf}</button>
          </div>
        )}

        {isReady && !isPdfStale && (
          <div className="pdfReadyPanel">
            <span className="pdfReadyEyebrow">PDF Ready</span>
            <strong className="pdfReadyHeadline">{pdfExportState.pageCount} page{pdfExportState.pageCount === 1 ? '' : 's'}</strong>
            <p className="pdfReadyFilename">{pdfExportState.filename}</p>
            <div className="pdfReadyActions">
              <button className="btn primary lg" onClick={onShare}>{c.share}</button>
              <button className="btn secondary" onClick={onDownload}>{c.download}</button>
            </div>
            <button className="btn ghost sm pdfReadyRegenerate" onClick={onGeneratePdf} disabled={isGenerating} aria-busy={isGenerating}>{c.regeneratePdf}</button>
            {pdfExportState.shareMessage && <p className="pdfShareMessage">{pdfExportState.shareMessage}</p>}
          </div>
        )}
      </div>

      <button type="button" className="btn ghost" onClick={onStartNew}>{c.startNew}</button>
      <StepFooter hasBack onBack={prev} />
    </StepPanel>
  );
}

/* ── Top-level workflow shell ── */
export default function IncidentWorkflow({
  incident, setIncident, step, setStep, goDocs, saveStatus, saveStatusState, onSaveNow,
  pdfExportState, isPdfStale, onGeneratePdf, onShare, onDownload, onMarkReady, onStartNew,
}) {
  const idx = INCIDENT_STEPS.findIndex(s => s.id === step);
  function upd(patch) {
    setIncident(prev => {
      const next = { ...prev, ...patch };
      // Editing any printed field after the report was marked ready/completed
      // returns it to draft (and clears completedAt) -- a "final" PDF must
      // never silently go stale without the user having to notice and
      // re-confirm readiness. Bookkeeping-only changes (e.g. lastSavedAt)
      // never reach upd(), so this only fires on genuine content edits.
      if (prev.status !== 'draft' && printedIncidentFingerprint(next) !== printedIncidentFingerprint(prev)) {
        next.status = 'draft';
        next.completedAt = '';
      }
      return next;
    });
  }
  function prev() { if (idx > 0) setStep(INCIDENT_STEPS[idx - 1].id); }
  function next() { if (idx < INCIDENT_STEPS.length - 1) setStep(INCIDENT_STEPS[idx + 1].id); }

  return (
    <>
      <div className="builderHeader">
        <div className="builderHeaderTitleRow">
          <div className="builderHeaderTitleBlock">
            <span className="builderHeaderKicker">{t.workflowTitle}</span>
            <h1 className="builderHeaderTitle">{incident.workplaceLocation || 'Untitled Incident Report'}</h1>
          </div>
          <button className="backBtn" onClick={goDocs}>&larr; Documents</button>
        </div>
        <div className="builderHeaderTop">
          <div className="builderHeaderBadges">
            <span className={`badge ${incident.status === 'draft' ? 'draft' : 'avail'}`}>
              {incident.status === 'completed' ? t.completedBadge : incident.status === 'ready' ? t.readyBadge : t.draftBadge}
            </span>
            <span className={`builderHeaderSaved${saveStatusState === 'error' ? ' error' : ''}`}>{saveStatus}</span>
            <button type="button" className="btn ghost sm" onClick={onSaveNow} disabled={saveStatusState === 'saving'}>{t.saveNow}</button>
          </div>
        </div>
        <Stepper incident={incident} step={step} onJump={setStep} />
      </div>

      <div className="workflowShell stacked">
        <div className="workflowLeft">
          {step === 'details' && <StepDetails incident={incident} upd={upd} next={next} />}
          {step === 'injury' && <StepInjury incident={incident} upd={upd} prev={prev} next={next} />}
          {step === 'witnesses' && <StepWitnesses incident={incident} upd={upd} prev={prev} next={next} />}
          {step === 'property' && <StepProperty incident={incident} upd={upd} prev={prev} next={next} />}
          {step === 'cause' && <StepCause incident={incident} upd={upd} prev={prev} next={next} />}
          {step === 'notes' && <StepNotes incident={incident} upd={upd} prev={prev} next={next} />}
          {step === 'review' && (
            <StepReview
              incident={incident}
              prev={prev}
              pdfExportState={pdfExportState}
              isPdfStale={isPdfStale}
              onGeneratePdf={onGeneratePdf}
              onShare={onShare}
              onDownload={onDownload}
              onMarkReady={onMarkReady}
              onStartNew={onStartNew}
            />
          )}
        </div>
      </div>
    </>
  );
}
