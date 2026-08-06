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

// None of the base-page flexible boxes below (description, witness
// statements, notes) use a fixed height anymore -- see incidentPdfMeasure.js.
// A fixed box (this module's own now-removed v0.1.1 DESCRIPTION_FIRST_HEIGHT_PX
// / STATEMENT_FIRST_HEIGHT_PX / NOTES_FIRST_HEIGHT_PX) always left whatever
// gap existed between that guess and the page's true remaining space unused
// -- sometimes a lot of it (v0.1.2's "pages end halfway down the sheet"
// report), sometimes too little (forcing an unnecessary continuation page,
// v0.1.1's page-7 bug). Instead, buildIncidentPagePlan() measures each base
// page's REAL remaining space with the real (data-dependent) content above
// it already rendered (measurePage1Budget/measurePage3Budget/
// measurePage4Budget/measurePage6NotesBudget in incidentPdfMeasure.js) and
// allocates it to that page's flexible box(es) -- see
// allocateFlexibleSections / allocateAndFillFlexibleSections in
// incidentPdfGenerate.jsx. These constants are now only the FLOOR each
// flexible box is guaranteed even if a page's real content leaves very
// little room (e.g. an unusually long workplace-location value) -- large
// enough to stay usable, small enough to never be the reason a short field
// looks artificially padded.
export const MIN_DESCRIPTION_HEIGHT_PX = 300;
export const MIN_STATEMENT_HEIGHT_PX = 130;
export const MIN_NOTE_BOX_HEIGHT_PX = 40;

// Page 6's investigation-team rows: MIN matches the table's own long-standing
// CSS default (enough for a normal signature image), MAX caps how much of
// page 6's genuine leftover space (after notes get what they actually need)
// can go into taller rows -- generous enough to visibly use the space
// (v0.1.2's "ends halfway down the sheet" report) without rows growing
// "absurdly tall" for a 4-row name/title/signature/date table.
export const MIN_TEAM_ROW_HEIGHT_PX = 40;
export const MAX_TEAM_ROW_HEIGHT_PX = 90;

// Small buffer subtracted from every measured budget before it's handed to a
// flexible box. The measurement skeleton (incidentPdfMeasure.js) and the
// real rendered page use the same CSS classes/text, so they should measure
// identically, but this protects against a 1-2px browser rounding drift
// between the two passes turning into a clipped page (.incidentPage has
// `overflow: hidden`) instead of just an imperceptibly smaller box.
export const PAGE_BOTTOM_SAFETY_PX = 3;

// Continuation pages have a much larger, mostly-empty page to work with.
export const CONTINUATION_BODY_HEIGHT_PX = 760;

// Shared with Page6Content (IncidentPdf.jsx) and measurePage6NotesBudget
// (incidentPdfMeasure.js) so both always render/measure the exact same
// help text -- if this ever changes, both the printed page and the
// available-space measurement stay in sync automatically.
export const SUPERVISOR_NOTES_HELP = 'List immediate actions to be taken & what should be done to help prevent a recurrence of this type of incident.';
