// Deterministic formatting only -- no AI interpretation of what the speaker
// "meant." Turns a final speech transcript into one JSA list item per line,
// for use in Tasks / Hazards / Controls only (narrative fields never call
// this). Item boundaries are periods, semicolons, question/exclamation
// marks, literal newlines, and the explicit spoken phrases "next item",
// "next task", "next hazard", "next control" -- all treated as the same
// generic boundary regardless of which field is active, since none of
// those phrases are plausible JSA content on their own.
//
// Deliberately NOT boundaries: commas and the word "and" -- "Inspect the
// truck, including tires, mirrors, and lights." must stay one item, not
// four fragments.
const NEXT_ITEM_RE = /\bnext\s+(?:item|task|hazard|control)\b/gi;
const BOUNDARY_RE = /[.!?;\n]+/;

export function normalizeSpokenList(transcript) {
  const raw = String(transcript || '');
  if (!raw.trim()) return [];
  const withExplicitBoundaries = raw.replace(NEXT_ITEM_RE, '\n');
  return withExplicitBoundaries
    .split(BOUNDARY_RE)
    .map(fragment => fragment.trim())
    .filter(Boolean);
}

// Appends new list items as additional lines below whatever is already in
// the field -- never overwrites manually-entered or previously-spoken
// content. Matches how the field's existing newline-separated parsing
// (splitLines in main.jsx: splits on \n or ;) already turns each line into
// its own JSA row, so no PDF/parsing change is needed elsewhere.
export function appendSpokenListItems(base, items) {
  if (!items.length) return base || '';
  const trimmedBase = String(base || '').replace(/\s+$/u, '');
  const joined = items.join('\n');
  return trimmedBase ? `${trimmedBase}\n${joined}` : joined;
}
