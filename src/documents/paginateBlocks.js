/* ── Generic block-based pagination for the four new (shorter) documents ──
   Same character-count estimation spirit as the JSA's estimateTextLines/
   estimateRowUnits (main.jsx) — not real per-field chunk-splitting like
   Incident's textFit.js, which exists to handle Incident's much longer,
   denser six-page report. These new documents are meant to be lighter/
   faster than Incident, so a whole-section-per-block model (never splits
   a single block's text across pages) is the appropriately-scoped choice:
   a block that is itself too tall for one page is a genuinely pathological
   input (see calcFit()-style "needs review" precedent), not the normal
   case these forms are designed around. */

export function estimateTextLines(value, charsPerLine) {
  const text = String(value || '');
  if (!text.trim()) return 1;
  return text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
}

/* Packs `blocks` ({ id, units }) into pages of at most `capacityUnits` each.
   Never splits a single block across pages. A block whose own `units`
   exceed capacityUnits is placed alone on its own page (it will still
   render everything — just not clipped by pagination logic itself; actual
   page-height overflow is a separate, per-document rendering concern). */
export function paginateBlocks(blocks, capacityUnits) {
  const pages = [[]];
  let used = 0;
  blocks.forEach(block => {
    if (used > 0 && used + block.units > capacityUnits) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(block);
    used += block.units;
  });
  return pages;
}
