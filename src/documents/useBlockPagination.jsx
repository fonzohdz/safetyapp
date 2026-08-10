import { useLayoutEffect, useRef, useState } from 'react';
import { paginateBlocks } from './paginateBlocks';

/* ── Real-measurement block pagination ──
   Same "measure the real DOM, don't guess" philosophy as the JSA's
   PaginationMeasureRig (main.jsx) — rather than estimate each section's
   height from character counts, this renders every block once in a hidden
   probe at the real page body width, measures each one's actual rendered
   height, and only then packs them into pages (see paginateBlocks.js).
   Scoped to whole-block granularity (a block is never split mid-content —
   see paginateBlocks.js's own comment) because these four documents are
   short single/dual-page forms, not Incident's dense six-page report.

   `blocks` is [{ id, render() }]. `capacityPx` is the usable page body
   height. `deps` should include every value blocks[].render() depends on,
   same contract as useEffect/useMemo deps.

   Consumers must render the returned `renderProbe()` output somewhere
   off-screen (see DocPdfExportRoot components) — the measurement only
   works because the probe is real, laid-out DOM at the real page width. */
export function useBlockPagination(blocks, capacityPx, probeWidthPx, deps) {
  const elRefs = useRef({});
  const [heights, setHeights] = useState({});

  useLayoutEffect(() => {
    const next = {};
    let changed = false;
    blocks.forEach(b => {
      const el = elRefs.current[b.id];
      const h = el ? el.getBoundingClientRect().height : 0;
      next[b.id] = h;
      if (heights[b.id] !== h) changed = true;
    });
    if (changed) setHeights(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const allMeasured = blocks.length === 0 || blocks.every(b => (heights[b.id] || 0) > 0);
  const pages = allMeasured
    ? paginateBlocks(blocks.map(b => ({ ...b, units: heights[b.id] || 0 })), capacityPx)
    : [blocks];

  function renderProbe() {
    return (
      <div style={{ position: 'fixed', top: 0, left: -20000, width: probeWidthPx, pointerEvents: 'none' }} aria-hidden="true">
        {blocks.map(b => (
          <div key={b.id} ref={el => { elRefs.current[b.id] = el; }}>{b.render()}</div>
        ))}
      </div>
    );
  }

  return { pages, renderProbe, measured: allMeasured };
}
