import {
  UNCONTROLLED_EVENT_STEPS, uncontrolledEventStepStatus,
  EVENT_CLASSIFICATIONS, EVENT_OUTCOMES, NOTIFICATION_OPTIONS, ATTACHMENT_OPTIONS,
  getUncontrolledEventReadinessChecks, isUncontrolledEventReady, isUncontrolledEventPrintFinal,
} from './uncontrolledEventModel';
import {
  Field, TextAreaField, ChipGroup, StepPanel, StepFooter,
  BuilderHeader, ReviewExportPanel, SignaturePad,
} from '../FormPrimitives';
import { LockedContext } from '../lockedContext';

function toggleInList(list, item) {
  return (list || []).includes(item) ? list.filter(x => x !== item) : [...(list || []), item];
}

/* ── Step: Event Info & Classification ── */
function StepEvent({ model, upd, next }) {
  return (
    <StepPanel title="Event Info & Classification" intro="Where and when this happened, and what kind of event it was. Check every classification and outcome that applies.">
      <div className="formSection">
        <span className="formSectionHeading">Event Information</span>
        <div className="formGrid">
          <Field label="Workplace Location / Project" value={model.workplaceLocation} onChange={v => upd({ workplaceLocation: v })} />
          <div className="formPairRow">
            <Field label="Date of Event" type="date" value={model.eventDate} onChange={v => upd({ eventDate: v })} />
            <Field label="Weather / Conditions" value={model.weatherConditions} onChange={v => upd({ weatherConditions: v })} />
          </div>
          <div className="formPairRow">
            <Field label="Date/Time Report Written" type="datetime-local" value={model.reportWrittenDateTime} onChange={v => upd({ reportWrittenDateTime: v })} />
            <Field label="Date/Time Reported to Supervisor" type="datetime-local" value={model.reportedToSupervisorDateTime} onChange={v => upd({ reportedToSupervisorDateTime: v })} />
          </div>
        </div>
      </div>

      <ChipGroup label="Event Classification (check all that apply)" options={EVENT_CLASSIFICATIONS} selected={model.eventClassifications} onToggle={opt => upd({ eventClassifications: toggleInList(model.eventClassifications, opt) })} />
      {(model.eventClassifications || []).includes('Other') && (
        <Field label="Other classification — specify" value={model.eventClassificationOther} onChange={v => upd({ eventClassificationOther: v })} />
      )}

      <ChipGroup label="Outcome / Impact (check all that apply)" options={EVENT_OUTCOMES} selected={model.eventOutcomes} onToggle={opt => upd({ eventOutcomes: toggleInList(model.eventOutcomes, opt) })} />
      {(model.eventOutcomes || []).includes('Other') && (
        <Field label="Other outcome — specify" value={model.eventOutcomeOther} onChange={v => upd({ eventOutcomeOther: v })} />
      )}
      {(model.eventOutcomes || []).includes('Injury / Illness') && (
        <div className="pdfStaleWarning">
          <strong>Injury/Illness selected.</strong>
          <p>An Incident Report may also be required for an injury/illness — this form does not replace it. Complete the Incident Reporting and Investigation Form separately if applicable.</p>
        </div>
      )}
      <Field label="Estimated Cost (if known)" value={model.estimatedCost} onChange={v => upd({ estimatedCost: v })} />

      <StepFooter hasNext onNext={next} />
    </StepPanel>
  );
}

/* ── Step: Narrative & Notifications ── */
function StepNarrative({ model, upd, prev, next }) {
  return (
    <StepPanel title="Narrative & Notifications" intro="What happened, what was done right away, and who was told.">
      <TextAreaField label="What Happened / Brief Summary / Timeline" rows={6} value={model.whatHappened} onChange={v => upd({ whatHappened: v })} />
      <TextAreaField label="Immediate Actions Taken" rows={4} value={model.immediateActionsTaken} onChange={v => upd({ immediateActionsTaken: v })} />

      <ChipGroup label="Notifications (check all that apply)" options={NOTIFICATION_OPTIONS} selected={model.notifications} onToggle={opt => upd({ notifications: toggleInList(model.notifications, opt) })} />
      <ChipGroup label="Attachments (check all that apply)" options={ATTACHMENT_OPTIONS} selected={model.attachments} onToggle={opt => upd({ attachments: toggleInList(model.attachments, opt) })} />
      {(model.attachments || []).includes('Other') && (
        <Field label="Other attachment — specify" value={model.attachmentOther} onChange={v => upd({ attachmentOther: v })} />
      )}
      <TextAreaField label="Witnesses" help="Names of any witnesses, one per line. Leave blank if none." rows={2} value={model.witnesses} onChange={v => upd({ witnesses: v })} />

      <div className="formSection">
        <span className="formSectionHeading">Reported By</span>
        <div className="formPairRow">
          <Field label="Reported By — Name" value={model.reportedByName} onChange={v => upd({ reportedByName: v })} />
          <Field label="Reported By — Title" value={model.reportedByTitle} onChange={v => upd({ reportedByTitle: v })} />
        </div>
        <div className="formPairRow">
          <SignaturePad label="Reported By Signature" value={model.reportedBySignatureData} onChange={data => upd({ reportedBySignatureData: data, reportedBySignatureDate: data ? new Date().toISOString().slice(0, 10) : model.reportedBySignatureDate })} />
          <Field label="Reported By Signature Date" type="date" value={model.reportedBySignatureDate} onChange={v => upd({ reportedBySignatureDate: v })} />
        </div>
      </div>

      <div className="formSection">
        <span className="formSectionHeading">Supervisor Review</span>
        <Field label="Supervisor Name" value={model.supervisorReviewName} onChange={v => upd({ supervisorReviewName: v })} />
        <div className="formPairRow">
          <SignaturePad label="Supervisor Signature" value={model.supervisorSignatureData} onChange={data => upd({ supervisorSignatureData: data, supervisorSignatureDate: data ? new Date().toISOString().slice(0, 10) : model.supervisorSignatureDate })} />
          <Field label="Supervisor Signature Date" type="date" value={model.supervisorSignatureDate} onChange={v => upd({ supervisorSignatureDate: v })} />
        </div>
      </div>

      <StepFooter hasBack hasNext onBack={prev} onNext={next} nextLabel="Go to Review" />
    </StepPanel>
  );
}

/* ── Top-level workflow shell ── */
export default function UncontrolledEventWorkflow({
  model, upd, step, setStep, goDocs, saveStatus, saveStatusState, onSaveNow,
  pdfExportState, isPdfStale, onGeneratePdf, onDownload, onMarkReady, onStartNew,
}) {
  const idx = UNCONTROLLED_EVENT_STEPS.findIndex(s => s.id === step);
  function prev() { if (idx > 0) setStep(UNCONTROLLED_EVENT_STEPS[idx - 1].id); }
  function next() { if (idx < UNCONTROLLED_EVENT_STEPS.length - 1) setStep(UNCONTROLLED_EVENT_STEPS[idx + 1].id); }

  const checks = getUncontrolledEventReadinessChecks(model);
  const checklistComplete = isUncontrolledEventReady(model);
  const locked = isUncontrolledEventPrintFinal(model);

  return (
    <>
      <BuilderHeader
        kicker="Uncontrolled Event Report"
        title={model.workplaceLocation || 'Untitled Uncontrolled Event'}
        statusBadgeLabel={locked ? 'Finished' : 'Draft'}
        statusBadgeClass={model.status === 'draft' ? 'draft' : 'avail'}
        saveStatus={saveStatus}
        saveStatusState={saveStatusState}
        onSaveNow={onSaveNow}
        onBack={goDocs}
        backLabel="Documents"
        steps={UNCONTROLLED_EVENT_STEPS}
        activeStepId={step}
        getStepStatus={id => uncontrolledEventStepStatus(model, id)}
        onJumpStep={setStep}
      />

      <LockedContext.Provider value={locked}>
        <div className="workflowShell stacked">
          <div className="workflowLeft">
            {step === 'event' && <StepEvent model={model} upd={upd} next={next} />}
            {step === 'narrative' && <StepNarrative model={model} upd={upd} prev={prev} next={next} />}
            {step === 'review' && (
              <ReviewExportPanel
                title="Review & Export"
                checks={checks}
                checklistComplete={checklistComplete}
                status={model.status}
                draftExplainText="Complete the checklist below, then finish this document."
                markReadyHintText="Everything required is filled in. Finishing will lock the document from further editing."
                onMarkReady={onMarkReady}
                pdfExportState={pdfExportState}
                isPdfStale={isPdfStale}
                onGeneratePdf={onGeneratePdf}
                onDownload={onDownload}
                onStartNew={onStartNew}
                startNewLabel="Start a new uncontrolled event report"
                onBack={prev}
              />
            )}
          </div>
        </div>
      </LockedContext.Provider>
    </>
  );
}
