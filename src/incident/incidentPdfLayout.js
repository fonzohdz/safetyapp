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

// Base-page box heights (in px) for each of the four overflow-prone
// fields -- generous enough for normal use, but any excess reliably
// flows to a continuation page instead of being clipped.
export const DESCRIPTION_FIRST_HEIGHT_PX = 210;
export const STATEMENT_FIRST_HEIGHT_PX = 95;
export const NOTES_FIRST_HEIGHT_PX = 110;

// Continuation pages have a much larger, mostly-empty page to work with.
export const CONTINUATION_BODY_HEIGHT_PX = 760;
