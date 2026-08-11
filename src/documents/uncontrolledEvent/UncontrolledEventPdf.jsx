import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  DocPdfPageShell, GrayBar, InfoTable, TextBlock, CheckboxGrid, SignatureRow,
  label, value, fmtDate, fmtDateTime,
} from '../DocPdfShell';
import { useBlockPagination } from '../useBlockPagination';
import { buildTextBlocks } from '../splitTextBlocks';
import {
  EVENT_CLASSIFICATIONS, EVENT_OUTCOMES, NOTIFICATION_OPTIONS, ATTACHMENT_OPTIONS,
  isUncontrolledEventPrintFinal,
} from './uncontrolledEventModel';

const FORM_TITLE = 'UNCONTROLLED EVENT REPORT';
const PAGE_BODY_CAPACITY_PX = 900;
const PAGE_BODY_WIDTH_PX = 758;

function InfoBlock({ model }) {
  return (
    <InfoTable rows={[
      [label('Workplace Location / Project', '34%'), value(model.workplaceLocation)],
      [label('Date of Event'), value(fmtDate(model.eventDate))],
      [label('Weather / Conditions'), value(model.weatherConditions)],
      [label('Report Written'), value(fmtDateTime(model.reportWrittenDateTime))],
      [label('Reported to Supervisor'), value(fmtDateTime(model.reportedToSupervisorDateTime))],
    ]}
    />
  );
}

/* Event Classification and Outcome/Impact side by side — genuinely
   independent field groups that don't need each other's full page width,
   and reading them as a pair (what kind of event / what it caused) matches
   how a superintendent scans the source paper form. */
function ClassificationOutcomeRow({ model }) {
  return (
    <div className="docPdfTwoCol">
      <div>
        <GrayBar>Event Classification</GrayBar>
        <CheckboxGrid options={EVENT_CLASSIFICATIONS} checked={model.eventClassifications} oneColumn />
        {(model.eventClassifications || []).includes('Other') && model.eventClassificationOther && (
          <TextBlock title="Other Classification" text={model.eventClassificationOther} minHeightPx={20} />
        )}
      </div>
      <div>
        <GrayBar>Outcome / Impact</GrayBar>
        <CheckboxGrid options={EVENT_OUTCOMES} checked={model.eventOutcomes} oneColumn />
        {(model.eventOutcomes || []).includes('Other') && model.eventOutcomeOther && (
          <TextBlock title="Other Outcome" text={model.eventOutcomeOther} minHeightPx={20} />
        )}
        {model.estimatedCost && <TextBlock title="Estimated Cost" text={model.estimatedCost} minHeightPx={20} />}
      </div>
    </div>
  );
}

/* Immediate Actions Taken and Notifications/Attachments side by side.
   immediateActionsTaken is still chunked via buildTextBlocks (see the
   blocks list below) but with a smaller maxChars than a full-width field
   would use — at half page width the same text wraps to roughly double
   the line count, so the chunk threshold that keeps a full-width block
   safely under one page's capacity would let a half-width block overflow
   and silently clip. Only the first (paired) chunk renders in this
   two-column row; any further chunks fall back to a full-width
   "(continued)" block below it. */
function ActionsNotificationsRow({ model }) {
  return (
    <div className="docPdfTwoCol">
      <div>
        <TextBlock title="Immediate Actions Taken" text={model.immediateActionsTaken} minHeightPx={50} />
        <TextBlock title="Witnesses" text={model.witnesses} minHeightPx={30} />
      </div>
      <div>
        <GrayBar>Notifications / Attachments</GrayBar>
        {/* Default 2-column grid (not oneColumn) even at half page width --
            these option labels are short enough not to wrap at that column
            width, and stacking one-per-row here was the single biggest
            contributor to this row overflowing onto a near-empty
            continuation page for otherwise normal-length reports. */}
        <CheckboxGrid options={NOTIFICATION_OPTIONS} checked={model.notifications} />
        <CheckboxGrid options={ATTACHMENT_OPTIONS} checked={model.attachments} />
        {(model.attachments || []).includes('Other') && model.attachmentOther && (
          <TextBlock title="Other Attachment" text={model.attachmentOther} minHeightPx={18} />
        )}
      </div>
    </div>
  );
}

function SignaturesBlock({ model }) {
  return (
    <div style={{ marginTop: 6 }}>
      <GrayBar>Reported By / Supervisor Review</GrayBar>
      <div style={{ padding: '8px 2px 0' }}>
        <InfoTable rows={[
          [label('Reported By — Name', '34%'), value(model.reportedByName)],
          [label('Reported By — Title'), value(model.reportedByTitle)],
          [label('Supervisor Reviewing'), value(model.supervisorReviewName)],
        ]}
        />
      </div>
      <div style={{ padding: '8px 2px' }}>
        <SignatureRow label="Reported By Signature" signatureData={model.reportedBySignatureData} dateValue={model.reportedBySignatureDate} />
      </div>
      <div style={{ padding: '8px 2px' }}>
        <SignatureRow label="Supervisor Signature" signatureData={model.supervisorSignatureData} dateValue={model.supervisorSignatureDate} />
      </div>
    </div>
  );
}

export function UncontrolledEventPdfExportRoot({ model, pageRefsRef }) {
  const pageRefs = useRef({});
  const draft = !isUncontrolledEventPrintFinal(model);

  const blocks = useMemo(() => ([
    { id: 'info', render: () => <InfoBlock model={model} /> },
    { id: 'classificationOutcome', render: () => <ClassificationOutcomeRow model={model} /> },
    // Split so a genuinely long timeline can never itself be taller than
    // one page — see splitTextBlocks.js. Full width (not paired) since it's
    // the primary narrative and can run long.
    ...buildTextBlocks('whatHappened', model.whatHappened, (chunk, isFirst) => (
      <TextBlock title={isFirst ? 'What Happened / Brief Summary / Timeline' : 'What Happened (continued)'} text={chunk} minHeightPx={isFirst ? 70 : 30} />
    )),
    // Paired with Notifications/Attachments at half page width — a smaller
    // maxChars than whatHappened's since the same text takes roughly twice
    // the vertical space at half width (see ActionsNotificationsRow).
    ...buildTextBlocks('immediateActions', model.immediateActionsTaken, (chunk, isFirst) => (
      isFirst
        ? <ActionsNotificationsRow model={{ ...model, immediateActionsTaken: chunk }} />
        : <TextBlock title="Immediate Actions Taken (continued)" text={chunk} minHeightPx={24} />
    ), 700),
    { id: 'signatures', render: () => <SignaturesBlock model={model} /> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [
    model.workplaceLocation, model.eventDate, model.weatherConditions, model.reportWrittenDateTime, model.reportedToSupervisorDateTime,
    model.eventClassifications, model.eventClassificationOther, model.eventOutcomes, model.eventOutcomeOther, model.estimatedCost,
    model.whatHappened, model.immediateActionsTaken,
    model.notifications, model.attachments, model.attachmentOther, model.witnesses,
    model.reportedByName, model.reportedByTitle, model.reportedBySignatureData, model.reportedBySignatureDate,
    model.supervisorReviewName, model.supervisorSignatureData, model.supervisorSignatureDate,
  ]);

  const { pages, renderProbe } = useBlockPagination(blocks, PAGE_BODY_CAPACITY_PX, PAGE_BODY_WIDTH_PX, [blocks]);
  const totalPages = pages.length;

  useLayoutEffect(() => {
    pageRefsRef.current = pages.map((_, i) => ({ type: i === 0 ? 'main' : 'continuation', el: pageRefs.current[i] }));
  });

  return (
    <div className="docPdfExportRoot" data-doc-id="uncontrolledEvent" aria-hidden="true">
      {renderProbe()}
      {pages.map((pageBlocks, i) => (
        <DocPdfPageShell
          key={i}
          pageRef={el => { pageRefs.current[i] = el; }}
          pageNumber={i + 1}
          totalPages={totalPages}
          draft={draft}
          formTitle={FORM_TITLE}
          headerLabel={i === 0 ? undefined : 'CONTINUATION'}
        >
          {pageBlocks.map(b => <div key={b.id}>{b.render()}</div>)}
        </DocPdfPageShell>
      ))}
    </div>
  );
}
