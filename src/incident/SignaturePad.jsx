import { useEffect, useRef, useState } from 'react';

/* Reusable signature capture. Draws on a canvas at a fixed internal
   resolution (scaled by devicePixelRatio for crisp strokes), stores the
   result as a compact transparent-background PNG data URL.

   Deliberately modal-ish (view mode vs. edit mode) rather than "always
   live" -- on a touch device a stray drag across a saved signature would
   otherwise silently destroy it, which is unacceptable for a safety
   document. Nothing is ever auto-saved; the user must press Save. */
export default function SignaturePad({ value, onChange, label, disabled }) {
  const [editing, setEditing] = useState(false);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const lastPointRef = useRef(null);

  const CSS_WIDTH = 320;
  const CSS_HEIGHT = 110;

  useEffect(() => {
    if (!editing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CSS_WIDTH * dpr;
    canvas.height = CSS_HEIGHT * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    hasStrokeRef.current = false;
  }, [editing]);

  /* The canvas's internal drawing coordinate space is always CSS_WIDTH x
     CSS_HEIGHT (ctx.scale(dpr, dpr) already normalizes for devicePixelRatio
     -- see the editing effect above), but the canvas's actual rendered box
     can be narrower than that on small screens (incident.css caps
     .signatureCanvas at `max-width: 100%`). Without rescaling, a stroke
     drawn across the full *displayed* width would only reach partway across
     the internal coordinate space, compressing the saved signature toward
     the left. Scaling by the ratio of internal-to-rendered size keeps
     pointer coordinates correct at any responsive width. */
  function getPoint(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? CSS_WIDTH / rect.width : 1;
    const scaleY = rect.height > 0 ? CSS_HEIGHT / rect.height : 1;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function pointerDown(e) {
    e.preventDefault();
    const canvas = canvasRef.current;
    canvas.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
  }

  function pointerMove(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = getPoint(e);
    const last = lastPointRef.current || p;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
    hasStrokeRef.current = true;
  }

  function pointerUp(e) {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokeRef.current = false;
  }

  function startEdit() {
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function saveSignature() {
    if (!hasStrokeRef.current) {
      setEditing(false);
      return;
    }
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onChange(dataUrl);
    setEditing(false);
  }

  function removeSignature() {
    onChange(null);
  }

  if (disabled) {
    return (
      <div className="signaturePad">
        {label ? <div className="fieldLabel">{label}</div> : null}
        <div className="signaturePreview signaturePreviewEmpty">Not applicable</div>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="signaturePad">
        {label ? <div className="fieldLabel">{label}</div> : null}
        {value ? (
          <div className="signaturePreviewWrap">
            <img src={value} alt="Signature" className="signaturePreview" />
            <div className="signaturePadActions">
              <button type="button" className="btn secondary sm" onClick={startEdit}>Replace</button>
              <button type="button" className="btn ghost sm" onClick={removeSignature}>Remove</button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn secondary sm" onClick={startEdit}>Add signature</button>
        )}
      </div>
    );
  }

  return (
    <div className="signaturePad">
      {label ? <div className="fieldLabel">{label}</div> : null}
      <canvas
        ref={canvasRef}
        className="signatureCanvas"
        style={{ width: CSS_WIDTH, height: CSS_HEIGHT, touchAction: 'none' }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerLeave={pointerUp}
      />
      <div className="signaturePadActions">
        <button type="button" className="btn ghost sm" onClick={clearCanvas}>Clear</button>
        <button type="button" className="btn ghost sm" onClick={cancelEdit}>Cancel</button>
        <button type="button" className="btn primary sm" onClick={saveSignature}>Save</button>
      </div>
    </div>
  );
}
