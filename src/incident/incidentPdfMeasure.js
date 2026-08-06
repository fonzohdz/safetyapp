/* Real-DOM measurement of how much vertical space page 6 actually has left
   for its two notes boxes, once the fixed chrome above and below them
   (gray bars, help text, the investigation-team table) is accounted for.

   Same philosophy as textFit.js's fitTextToHeight: rather than compute this
   from font-metric arithmetic (fragile -- this app has already been burned
   by estimate-based pagination drifting out of sync with actual rendered
   fonts), build a plain-DOM skeleton using the exact same incident.css
   classes as the real page, mount it off-screen, and read real
   getBoundingClientRect() values. If a future change to incident.css alters
   header height, gray-bar padding, or the team-table row height, this
   measurement picks it up automatically instead of silently going stale. */

import { SUPERVISOR_NOTES_HELP } from './incidentPdfLayout';

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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildHeaderSkeleton() {
  const header = el('header', 'incidentHeader');
  const bar = el('div', 'incidentHeaderBar');
  bar.appendChild(el('div', 'incidentHeaderLogo'));
  const titles = el('div', 'incidentHeaderTitles');
  titles.appendChild(el('h1', null, 'INCIDENT REPORTING AND INVESTIGATION FORM'));
  bar.appendChild(titles);
  bar.appendChild(el('div', 'incidentHeaderPageNum', 'Page 6 of 6'));
  header.appendChild(bar);
  header.appendChild(el('div', 'incidentRedRule'));
  return header;
}

function buildTeamTableSkeleton(investigationTeam) {
  const table = el('table', 'incInfoTable incTeamTable');
  const thead = el('thead');
  const headRow = el('tr');
  ['Name', 'Title', 'Signature', 'Date'].forEach((h) => headRow.appendChild(el('th', null, h)));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  const team = investigationTeam || [];
  for (let i = 0; i < 4; i += 1) {
    const m = team[i];
    const tr = el('tr');
    tr.appendChild(el('td', null, m?.name || ''));
    tr.appendChild(el('td', null, m?.title || ''));
    // A signature is a fixed-height <img> (.incSignatureImage) -- for row
    // *height* purposes an empty cell vs. an image cell are equivalent once
    // the row's own min-height CSS rule is >= the image's height, which it
    // is (see incident.css .incTeamTable td), so no need to fabricate an
    // actual image here.
    tr.appendChild(el('td', null, ''));
    tr.appendChild(el('td', null, m?.date || ''));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

/* Mounts a real `.incidentPage` (fixed 8.5in x 11in, exactly like the
   printed page) with a header and a body populated by `buildChrome`, then
   measures:
     - the body's own real rendered height (flex:1 1 auto fills whatever is
       left of the fixed-height page after the header -- this is the TRUE
       available space, not a guess)
     - how much of that space the chrome (everything buildChrome appended)
       actually uses, once the "flexible" box(es) it returns are excluded at
       their natural (empty) height
   and returns the leftover budget those flexible boxes can share. */
function measurePageBudget(buildChrome) {
  const host = getMeasureHost();
  const page = el('div', 'incidentPage');
  page.appendChild(buildHeaderSkeleton());
  const body = el('div', 'incidentPageBody');
  page.appendChild(body);
  host.appendChild(page);

  let budget = 0;
  try {
    const boxes = buildChrome(body);
    const bodyRect = body.getBoundingClientRect();
    const lastChild = body.lastElementChild;
    const usedHeight = lastChild ? lastChild.getBoundingClientRect().bottom - bodyRect.top : 0;
    const boxesHeight = boxes.reduce((sum, node) => sum + node.getBoundingClientRect().height, 0);
    const chromeOnly = usedHeight - boxesHeight;
    budget = bodyRect.height - chromeOnly;
  } finally {
    host.removeChild(page);
  }
  return budget;
}

/* Returns the total px height page 6's two notes boxes can share, given the
   real (not placeholder) investigation-team data -- a long member name/title
   that wraps to two lines legitimately shrinks the notes budget, same as it
   would on the real printed page. */
export function measurePage6NotesBudget(investigationTeam) {
  return measurePageBudget((body) => {
    body.appendChild(el('div', 'incGrayBar', 'SUPERINTENDENT/SUPERVISOR NOTES & SUMMARY'));
    const wrap1 = el('div', 'incTextBlockWrap');
    wrap1.appendChild(el('div', 'incTextBlockHelp', SUPERVISOR_NOTES_HELP));
    const box1 = el('div', 'incTextBlock', '');
    wrap1.appendChild(box1);
    body.appendChild(wrap1);

    body.appendChild(el('div', 'incGrayBar', 'SAFETY CONSULTANT NOTES & SUMMARY'));
    const wrap2 = el('div', 'incTextBlockWrap');
    const box2 = el('div', 'incTextBlock', '');
    wrap2.appendChild(box2);
    body.appendChild(wrap2);

    body.appendChild(el('div', 'incGrayBar', 'INVESTIGATION TEAM'));
    body.appendChild(buildTeamTableSkeleton(investigationTeam));

    return [box1, box2];
  });
}
