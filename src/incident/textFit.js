/* Real-DOM text pagination for the incident PDF's long free-text fields
   (incident description, witness statements, supervisor/safety-consultant
   notes). Rather than estimating how much text "should" fit from character
   counts (fragile, and this app has already been burned by estimate-based
   pagination drifting out of sync with actual rendered fonts -- see the JSA
   pagination notes), this measures the REAL rendered height of candidate
   text in a detached DOM node using the exact font metrics/width the page
   will use, and binary-searches for the largest chunk that fits. Because
   it's real layout, it can never under- or over-estimate: if it says a
   chunk fits, it fits.

   Used only at PDF-generation time (not on every keystroke), so the small
   synchronous reflow cost of a handful of binary searches is a non-issue. */

let measureHost = null;

function getMeasureHost() {
  if (measureHost && document.body.contains(measureHost)) return measureHost;
  measureHost = document.createElement('div');
  measureHost.setAttribute('aria-hidden', 'true');
  measureHost.style.position = 'fixed';
  measureHost.style.top = '0';
  measureHost.style.left = '-99999px';
  measureHost.style.visibility = 'hidden';
  measureHost.style.pointerEvents = 'none';
  document.body.appendChild(measureHost);
  return measureHost;
}

function findWordBoundary(text, idx) {
  if (idx >= text.length) return text.length;
  let cut = text.lastIndexOf(' ', idx);
  const nl = text.lastIndexOf('\n', idx);
  if (nl > cut) cut = nl;
  if (cut <= 0) return idx; // no good boundary (single long word) -- hard cut
  return cut;
}

/* Returns the largest prefix of `text` (snapped to a word/line boundary)
   that renders at or under maxHeightPx, plus the remainder. If the whole
   text already fits, remainder is ''. `style` must reproduce the exact
   width/font/line-height/padding/white-space the real box uses. */
export function fitTextToHeight(text, maxHeightPx, style) {
  const host = getMeasureHost();
  const el = document.createElement('div');
  Object.assign(el.style, {
    boxSizing: 'border-box',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    height: 'auto',
    ...style,
  });
  host.appendChild(el);

  try {
    el.textContent = text;
    if (el.scrollHeight <= maxHeightPx) {
      return { fit: text, remainder: '' };
    }
    if (!text.trim()) return { fit: '', remainder: '' };

    let lo = 0;
    let hi = text.length;
    // Binary search the largest length whose rendered height fits.
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      el.textContent = text.slice(0, mid);
      if (el.scrollHeight <= maxHeightPx) lo = mid;
      else hi = mid - 1;
    }
    if (lo <= 0) return { fit: '', remainder: text }; // nothing fits at all in this box
    const boundary = findWordBoundary(text, lo);
    const cut = boundary > 0 ? boundary : lo;
    return { fit: text.slice(0, cut).trimEnd(), remainder: text.slice(cut).trimStart() };
  } finally {
    host.removeChild(el);
  }
}

/* The natural (unconstrained) rendered height of `text` in a box using
   `style` -- i.e. how tall the box would be if nothing capped it. Used to
   decide how to split a shared height budget between two competing fields
   (see incidentPdfGenerate.js's allocateSharedNotesHeight) before actually
   pagin­ating either one. */
export function measureNaturalHeight(text, style) {
  const host = getMeasureHost();
  const el = document.createElement('div');
  Object.assign(el.style, {
    boxSizing: 'border-box',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    height: 'auto',
    ...style,
  });
  host.appendChild(el);
  try {
    el.textContent = String(text || '');
    return el.scrollHeight;
  } finally {
    host.removeChild(el);
  }
}

/* Splits `text` into an array of chunks: chunks[0] fits `firstStyle`/
   `firstMaxHeightPx` (the base page's box), every subsequent chunk fits
   `continuationStyle`/`continuationMaxHeightPx` (a full continuation-page
   box). Always returns at least one chunk (possibly '' for empty input).
   Hard safety valve at 40 chunks -- would only trigger on pathological
   input (tens of thousands of words) and prevents any possibility of an
   infinite loop becoming a frozen tab.

   Returns { chunks, overflow }. `overflow` is true when some text could not
   be confirmed to fit anywhere (either a single line too wide even for a
   fresh continuation page, or the 40-chunk safety valve was hit) -- that
   leftover text is still appended as one final chunk so nothing ever
   vanishes from the rendered DOM, but the caller (buildIncidentPagePlan)
   surfaces `overflow` so the actual PDF export can be blocked with a clear
   error rather than silently shipping a document that clips content.
   Deliberately does NOT throw here: this function also runs on every
   keystroke via IncidentPdfExportRoot's always-mounted, off-screen preview,
   and this app has no error boundaries anywhere -- an exception thrown from
   a live render path would blank the whole app, not just block an export. */
export function paginateText(text, opts) {
  const { firstMaxHeightPx, firstStyle, continuationMaxHeightPx, continuationStyle } = opts;
  const value = String(text || '');
  const chunks = [];
  let { fit, remainder } = fitTextToHeight(value, firstMaxHeightPx, firstStyle);
  chunks.push(fit);
  let overflow = false;
  let guard = 0;
  while (remainder && guard < 40) {
    guard += 1;
    const step = fitTextToHeight(remainder, continuationMaxHeightPx, continuationStyle);
    if (!step.fit && step.remainder === remainder) {
      // Nothing fits even on a fresh continuation page (box too small for
      // even one line).
      chunks.push(remainder);
      overflow = true;
      remainder = '';
      break;
    }
    chunks.push(step.fit);
    remainder = step.remainder;
  }
  if (remainder) {
    // Hit the 40-chunk safety valve with text still left over.
    chunks.push(remainder);
    overflow = true;
  }
  return { chunks, overflow };
}
