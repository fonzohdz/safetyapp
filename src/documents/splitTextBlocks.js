/* ── Long free-text field -> multiple pagination blocks ──
   useBlockPagination's paginateBlocks() never splits a single block across
   pages (see paginateBlocks.js) — safe for short/structured fields, but a
   genuinely long free-text field (a superintendent pasting a long
   timeline) can itself be taller than one whole page, which would then
   silently clip inside .docPdfPage's fixed-height overflow:hidden. Chunking
   a long field into multiple same-titled blocks up front means no single
   block is ever pathologically tall, so the existing whole-block
   pagination stays correct even for unbounded input length — the missing
   piece that made a combined two-field narrative block clip in testing. */

// Conservative: comfortably under one page's ~900px usable body height
// even after a title/help line and the block's own padding, using the
// same "measure the real DOM" system (see useBlockPagination) — this is
// only how much text becomes a `render()`, real height is still measured.
const DEFAULT_MAX_CHARS = 1400;

export function splitTextIntoChunks(text, maxChars = DEFAULT_MAX_CHARS) {
  const t = String(text || '');
  if (t.length <= maxChars) return [t];
  const chunks = [];
  let remaining = t;
  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf('\n\n', maxChars);
    if (cut < maxChars * 0.4) cut = -1;
    if (cut < 0) {
      const sentenceEnd = remaining.slice(0, maxChars).lastIndexOf('. ');
      cut = sentenceEnd >= maxChars * 0.4 ? sentenceEnd + 1 : -1;
    }
    if (cut < 0) cut = maxChars;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.filter(c => c.length > 0);
}

/* Builds one pagination block per chunk of `text`, sharing `idPrefix` and
   `title` (subsequent chunks get "(continued)" appended). `renderChunk`
   receives (chunkText, isFirst) and must return the block's JSX — callers
   decide their own TextBlock/title/help wrapping. Returns [] for empty
   text (no block at all, matching how a truly blank field renders — see
   `[""]` returning early from splitTextIntoChunks). */
export function buildTextBlocks(idPrefix, text, renderChunk, maxChars = DEFAULT_MAX_CHARS) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [{ id: idPrefix, render: () => renderChunk(trimmed, true) }];
  const chunks = splitTextIntoChunks(trimmed, maxChars);
  return chunks.map((chunk, i) => ({
    id: `${idPrefix}-${i}`,
    render: () => renderChunk(chunk, i === 0),
  }));
}
