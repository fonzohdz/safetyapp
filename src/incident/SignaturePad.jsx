import { useEffect, useRef, useState } from 'react';

/* Reusable signature capture. Draws on a canvas at a fixed internal
   resolution (scaled by devicePixelRatio for crisp strokes), stores the
   result as a compact transparent-background PNG data URL.

   Deliberately modal-ish (view mode vs. edit mode) rather than "always
   live" -- on a touch device a stray drag across a saved signature would
   otherwise silently destroy it, which is unacceptable for a safety
   document. Nothing is ever auto-saved; the user must press Save. */
// Minimum usable drawing height for a normal handwritten first-and-last
// name: roomy enough on a desktop/tablet form container (160-180px target),
// a touch shorter on a phone-width viewport (135-150px target) where
// vertical space is scarcer -- see the v0.1.4 polish pass. Width is always
// measured live from the actual form container instead of a fixed 320px, so
// the pad genuinely uses the available width up to a sane cap rather than
// leaving unused space next to it on wide layouts.
const PAD_HEIGHT_DESKTOP = 170;
const PAD_HEIGHT_PHONE = 145;
const PAD_WIDTH_MIN = 260;
const PAD_WIDTH_MAX = 640;
const PHONE_BREAKPOINT_PX = 480;

export default function SignaturePad({ value, onChange, label, disabled }) {
  const [editing, setEditing] = useState(false);
  const [padSize, setPadSize] = useState({ width: 320, height: PAD_HEIGHT_DESKTOP });
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const lastPointRef = useRef(null);

  /* Measures the real available width from the wrapper (a block-level div
     that stretches to the form container, see .signaturePad in
     incident.css) rather than assuming a fixed 320px -- so the pad genuinely
     fills the form on desktop/tablet/phone alike. Recomputed on window
     resize (e.g. iPad rotation) too, but only when nothing has been drawn
     yet (hasStrokeRef) -- resizing the canvas element always clears its
     bitmap, and silently wiping an in-progress signature on an orientation
     change would be a real data-loss bug for a safety document. */
  useEffect(() => {
    if (!editing) return;
    function computeSize() {
      if (hasStrokeRef.current) return;
      const containerWidth = wrapRef.current ? wrapRef.current.clientWidth : 320;
      const width = Math.max(PAD_WIDTH_MIN, Math.min(PAD_WIDTH_MAX, containerWidth || PAD_WIDTH_MIN));
      const height = window.innerWidth <= PHONE_BREAKPOINT_PX ? PAD_HEIGHT_PHONE : PAD_HEIGHT_DESKTOP;
      setPadSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
    }
    computeSize();
    window.addEventListener('resize', computeSize);
    return () => window.removeEventListener('resize', computeSize);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = padSize.width * dpr;
    canvas.height = padSize.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    hasStrokeRef.current = false;
  }, [editing, padSize.width, padSize.height]);

  /* The canvas's internal drawing coordinate space is always padSize.width x
     padSize.height (ctx.scale(dpr, dpr) already normalizes for
     devicePixelRatio -- see the editing effect above), but the canvas's
     actual rendered box can differ slightly from that due to sub-pixel
     layout rounding. Without rescaling, a stroke drawn across the full
     *displayed* width could drift from the internal coordinate space. Scaling
     by the ratio of internal-to-rendered size keeps pointer coordinates
     correct at any responsive width. */
  function getPoint(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? padSize.width / rect.width : 1;
    const scaleY = rect.height > 0 ? padSize.height / rect.height : 1;
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
      <div className="signatureCanvasWrap" ref={wrapRef}>
        {/* No onPointerLeave: with setPointerCapture in place, pointerup
            already reaches this element no matter where the pointer is
            released. iOS Safari has fired spurious pointerleave mid-touch-
            drag on captured elements, which silently ends the stroke after
            the very first move -- the touch-drawing-draws-nothing bug.
            pointercancel (e.g. an interrupting system gesture) is handled
            explicitly instead of leaving drawingRef stuck true. */}
        <canvas
          ref={canvasRef}
          className="signatureCanvas"
          style={{ width: padSize.width, height: padSize.height, touchAction: 'none' }}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
        />
      </div>
      <div className="signaturePadActions">
        <button type="button" className="btn ghost sm" onClick={clearCanvas}>Clear</button>
        <button type="button" className="btn ghost sm" onClick={cancelEdit}>Cancel</button>
        <button type="button" className="btn primary sm" onClick={saveSignature}>Save</button>
      </div>
    </div>
  );
}
