import {
  SEPARATION_STEPS, separationStepStatus, SEPARATION_REASONS,
  getSeparationReadinessChecks, isSeparationReady, isSeparationPrintFinal,
} from './separationModel';
import {
  Field, TextAreaField, SegmentedToggle, StepPanel, StepFooter,
  BuilderHeader, ReviewExportPanel, SignaturePad,
} from '../FormPrimitives';
import { LockedContext } from '../lockedContext';

/* ── Step: Separation Details ──
   Single content step (plus Review) — this is a short, separation-only
   form (see separationModel.js's own comment on scope), not a multi-part
   wizard like the longer documents in this mission. */
function StepDetails({ model, upd, next }) {
  const isDischarge = model.separationReason === 'Discharge';
  return (
    <StepPanel title="Separation Details" intro="Employee information, the reason for separation, and a brief explanation.">
      <div className="formSection">
        <span className="formSectionHeading">Employee Information</span>
        <div className="formGrid">
          <Field label="Employee Name" value={model.employeeName} onChange={v => upd({ employeeName: v })} />
          <div className="formPairRow">
            <Field label="Supervisor" value={model.supervisor} onChange={v => upd({ supervisor: v })} />
            <Field label="Position" value={model.position} onChange={v => upd({ position: v })} />
          </div>
          <Field label="Separation Date" type="date" value={model.separationDate} onChange={v => upd({ separationDate: v })} />
        </div>
      </div>

      <div className="formSection">
        <span className="formSectionHeading">Reason for Separation</span>
        <SegmentedToggle
          label="Reason"
          value={model.separationReason}
          onChange={v => upd({ separationReason: v })}
          options={SEPARATION_REASONS.map(r => ({ value: r, label: r }))}
        />
        {model.separationReason === 'Other' && (
          <Field label="Other reason — specify" value={model.separationReasonOther} onChange={v => upd({ separationReasonOther: v })} />
        )}
        <TextAreaField label="Detailed Explanation" rows={5} value={model.detailedExplanation} onChange={v => upd({ detailedExplanation: v })} />
      </div>

      {isDischarge && (
        <div className="formSection">
          <span className="formSectionHeading">Discharge — Warning History</span>
          <SegmentedToggle
            label="Were warning notices given?"
            value={model.warningNoticesGiven}
            onChange={v => upd({ warningNoticesGiven: v })}
            options={[{ value: 'yes', label: 'Yes', tone: 'yes' }, { value: 'no', label: 'No', tone: 'no' }]}
          />
          {model.warningNoticesGiven === 'yes' && (
            <Field label="How many warning notices?" value={model.warningNoticesCount} onChange={v => upd({ warningNoticesCount: v })} />
          )}
        </div>
      )}

      <div className="formSection">
        <span className="formSectionHeading">Re-hire Eligibility</span>
        <SegmentedToggle
          label="Would you re-hire this employee?"
          value={model.wouldRehire}
          onChange={v => upd({ wouldRehire: v })}
          options={[{ value: 'yes', label: 'Yes', tone: 'yes' }, { value: 'no', label: 'No', tone: 'no' }]}
        />
      </div>

      <div className="formSection">
        <span className="formSectionHeading">Signatures</span>
        <div className="formPairRow">
          <SignaturePad label="Supervisor Signature" value={model.supervisorSignatureData} onChange={data => upd({ supervisorSignatureData: data, supervisorSignatureDate: data ? new Date().toISOString().slice(0, 10) : model.supervisorSignatureDate })} />
          <Field label="Supervisor Signature Date" type="date" value={model.supervisorSignatureDate} onChange={v => upd({ supervisorSignatureDate: v })} />
        </div>
        <div className="formPairRow">
          <SignaturePad label="Employee Signature" value={model.employeeSignatureData} onChange={data => upd({ employeeSignatureData: data, employeeSignatureDate: data ? new Date().toISOString().slice(0, 10) : model.employeeSignatureDate })} />
          <Field label="Employee Signature Date" type="date" value={model.employeeSignatureDate} onChange={v => upd({ employeeSignatureDate: v })} />
        </div>
      </div>

      <StepFooter hasNext onNext={next} nextLabel="Go to Review" />
    </StepPanel>
  );
}

/* ── Top-level workflow shell ── */
export default function SeparationWorkflow({
  model, upd, step, setStep, goDocs, saveStatus, saveStatusState, onSaveNow,
  pdfExportState, isPdfStale, onGeneratePdf, onDownload, onMarkReady, onStartNew,
}) {
  const idx = SEPARATION_STEPS.findIndex(s => s.id === step);
  function prev() { if (idx > 0) setStep(SEPARATION_STEPS[idx - 1].id); }
  function next() { if (idx < SEPARATION_STEPS.length - 1) setStep(SEPARATION_STEPS[idx + 1].id); }

  const checks = getSeparationReadinessChecks(model);
  const checklistComplete = isSeparationReady(model);
  const locked = isSeparationPrintFinal(model);

  return (
    <>
      <BuilderHeader
        kicker="Employee Separation"
        title={model.employeeName || 'Untitled Separation'}
        statusBadgeLabel={locked ? 'Finished' : 'Draft'}
        statusBadgeClass={model.status === 'draft' ? 'draft' : 'avail'}
        saveStatus={saveStatus}
        saveStatusState={saveStatusState}
        onSaveNow={onSaveNow}
        onBack={goDocs}
        backLabel="Documents"
        steps={SEPARATION_STEPS}
        activeStepId={step}
        getStepStatus={id => separationStepStatus(model, id)}
        onJumpStep={setStep}
      />

      <LockedContext.Provider value={locked}>
        <div className="workflowShell stacked">
          <div className="workflowLeft">
            {step === 'details' && <StepDetails model={model} upd={upd} next={next} />}
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
                startNewLabel="Start a new separation record"
                onBack={prev}
              />
            )}
          </div>
        </div>
      </LockedContext.Provider>
    </>
  );
}
