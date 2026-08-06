/* Shared pixel/point metrics for the incident PDF page components and their
   text-fit measurement (textFit.js). Kept in one JS module (rather than
   only in CSS) because generateIncidentPdf() needs the exact same
   width/font metrics JS-side to measure real text before deciding what
   goes on a base page vs. a continuation page. The matching CSS rules in
   incident.css use the literal px/pt values below -- if you change a
   number here, update the matching rule in incident.css (search for the
   same class name) so measurement and rendering never drift apart.

   96 CSS px per inch, 1pt = 1.3333px (browser standard), used throughout
   since generation renders at normal DOM scale -- html2canvas's `scale`
   option magnifies the final raster only, it never changes CSS layout. */

export const PAGE_WIDTH_IN = 8.5;
export const PAGE_HEIGHT_IN = 11;
export const PAGE_MARGIN_IN = 0.3;
export const PX_PER_IN = 96;

export const PAGE_WIDTH_PX = PAGE_WIDTH_IN * PX_PER_IN;
export const PAGE_HEIGHT_PX = PAGE_HEIGHT_IN * PX_PER_IN;
export const PAGE_MARGIN_PX = PAGE_MARGIN_IN * PX_PER_IN;
export const CONTENT_WIDTH_PX = PAGE_WIDTH_PX - PAGE_MARGIN_PX * 2;

export const FONT_FAMILY = 'Arial, Helvetica, sans-serif';
export const FONT_10PT_PX = 10 * (96 / 72); // 13.33px
export const FONT_9PT_PX = 9 * (96 / 72); // 12px

// Long free-text block metrics (description, witness statements, notes).
// Width matches a full-width bordered box inset slightly from the page's
// content width for its own 1px border + padding.
export const TEXT_BLOCK_WIDTH_PX = CONTENT_WIDTH_PX - 8;
export const TEXT_BLOCK_FONT_PX = FONT_10PT_PX;
export const TEXT_BLOCK_LINE_HEIGHT_PX = 15.5;
export const TEXT_BLOCK_PADDING_PX = 5;

export function textBlockMeasureStyle() {
  return {
    width: `${TEXT_BLOCK_WIDTH_PX}px`,
    fontSize: `${TEXT_BLOCK_FONT_PX}px`,
    lineHeight: `${TEXT_BLOCK_LINE_HEIGHT_PX}px`,
    fontFamily: FONT_FAMILY,
    padding: `${TEXT_BLOCK_PADDING_PX}px`,
  };
}

// Base-page box heights (in px) for the description and witness-statement
// fields -- generous enough for normal use (deliberately larger than the
// v0.1.1 originals of 210/95 so page 1/3/4 use more of their real available
// space -- see the v0.1.1 polish pass), but any excess reliably flows to a
// continuation page instead of being clipped.
export const DESCRIPTION_FIRST_HEIGHT_PX = 300;
export const STATEMENT_FIRST_HEIGHT_PX = 130;

// Page 6's two notes boxes do NOT use a fixed height like the fields above.
// A fixed box (v0.1.1's now-removed NOTES_FIRST_HEIGHT_PX = 110) starved
// both boxes even when the investigation-team table left hundreds of px of
// genuinely free space below it, forcing a nearly-empty continuation page 7
// for just a few leftover lines. Instead, buildIncidentPagePlan() measures
// page 6's REAL remaining space (measurePage6NotesBudget in
// incidentPdfMeasure.js) and splits it between the two notes fields based on
// how much each actually needs (see allocateSharedNotesHeight). This is the
// floor per box in that split -- small enough to never waste space forcing
// a short note artificially tall, large enough that a note box never
// collapses to an unreadable sliver when the other note needs most of the
// shared budget.
export const MIN_NOTE_BOX_HEIGHT_PX = 40;

// Continuation pages have a much larger, mostly-empty page to work with.
export const CONTINUATION_BODY_HEIGHT_PX = 760;

// Shared with Page6Content (IncidentPdf.jsx) and measurePage6NotesBudget
// (incidentPdfMeasure.js) so both always render/measure the exact same
// help text -- if this ever changes, both the printed page and the
// available-space measurement stay in sync automatically.
export const SUPERVISOR_NOTES_HELP = 'List immediate actions to be taken & what should be done to help prevent a recurrence of this type of incident.';
