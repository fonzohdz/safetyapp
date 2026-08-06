import { useRef } from 'react';

/* Neutral front/side/rear body outline for marking injury locations.
   Asset extracted directly from the reference document (word/media/image1)
   -- a stock, non-identifying line-art figure, not a photo of any real
   person. Marks are stored as simple normalized percentages of the image
   so they survive any responsive resizing and render identically when
   captured for the PDF. */

const BODY_DIAGRAM_SRC = `${import.meta.env.BASE_URL}icons/body-diagram.jpg`;
const MARK_HIT_RADIUS_PCT = 3;

export default function BodyDiagram({ marks, onChange, readOnly }) {
  const imgRef = useRef(null);

  function handleClick(e) {
    if (readOnly) return;
    const img = imgRef.current;
    const rect = img.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return;

    const existingIdx = marks.findIndex(m => {
      const dx = m.xPct - xPct;
      const dy = m.yPct - yPct;
      return Math.sqrt(dx * dx + dy * dy) <= MARK_HIT_RADIUS_PCT;
    });
    if (existingIdx >= 0) {
      onChange(marks.filter((_, i) => i !== existingIdx));
    } else {
      onChange([...marks, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, xPct, yPct }]);
    }
  }

  function undoLast() {
    if (marks.length === 0) return;
    onChange(marks.slice(0, -1));
  }

  function clearAll() {
    if (marks.length === 0) return;
    if (window.confirm('Clear all body marks?')) onChange([]);
  }

  return (
    <div className="bodyDiagramWrap">
      <div
        className={`bodyDiagramImageWrap${readOnly ? ' bodyDiagramReadOnly' : ''}`}
        onClick={handleClick}
      >
        <img ref={imgRef} src={BODY_DIAGRAM_SRC} alt="Body diagram" className="bodyDiagramImage" draggable={false} />
        {marks.map(m => (
          <span
            key={m.id}
            className="bodyDiagramMark"
            style={{ left: `${m.xPct}%`, top: `${m.yPct}%` }}
          />
        ))}
      </div>
      {!readOnly && (
        <div className="bodyDiagramActions">
          <button type="button" className="btn ghost sm" onClick={undoLast} disabled={marks.length === 0}>Undo last mark</button>
          <button type="button" className="btn ghost sm" onClick={clearAll} disabled={marks.length === 0}>Clear all marks</button>
        </div>
      )}
    </div>
  );
}

export { BODY_DIAGRAM_SRC };
