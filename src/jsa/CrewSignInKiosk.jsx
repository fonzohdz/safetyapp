import { useEffect, useRef, useState } from 'react';

/* ── JSA Crew Sign-In Kiosk (design prototype, 2026-08-13) ──
   Locked, single-purpose full-screen signing flow for passing one shared
   iPad around a crew of up to ~100 people. The problem this solves: on a
   normal screen, a hundred different people tapping around gives everyone
   room to hit the wrong thing, back out, or land on and disturb someone
   else's already-captured signature. The fix is removing everything except
   the one action each person is allowed to take.

   Reuses the same proven canvas-drawing mechanics as SignaturePad
   (src/incident/SignaturePad.jsx) -- DPR-scaled canvas, pointer (mouse/pen)
   handled separately from native touch (finger) input so a touch gesture is
   never drawn twice, round strokes, a bare tap still leaves a dot -- but a
   completely different UI shell: no edit/view toggle, no Cancel/Replace,
   exactly one action ("Confirm & Next"). Once a signature is confirmed it
   is appended to jsa.crewSignatures and this screen has no way to touch it
   again -- only the CURRENT, not-yet-confirmed signature can be cleared and
   redrawn.

   Deliberately open-ended -- no fixed expected-signer count. Crew size
   varies day to day; this keeps going until whoever is running it holds the
   exit control (see EXIT_HOLD_MS) to leave the kiosk, rather than the app
   trying to pre-guess headcount.

   Does NOT wire captured signatures into the printed sign-in sheet
   (AttachedSignIn in main.jsx still prints blank numbered lines for pen
   signing) -- that's a separate, higher-risk print-pipeline change,
   deliberately out of scope for this pass. This component only captures
   and stores the data; nothing about the print pipeline changes. */

const PAD_HEIGHT = 320;
const EXIT_HOLD_MS = 1500;
const CONFIRM_PAUSE_MS = 1200;

export default function CrewSignInKiosk({ jsa, upd, onExit }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const lastPointRef = useRef(null);
  const activeTouchIdRef = useRef(null);
  const exitHoldTimerRef = useRef(null);

  const [padWidth, setPadWidth] = useState(320);
  const [hasStroke, setHasStroke] = useState(false);
  const [phase, setPhase] = useState('signing'); // 'signing' | 'confirmed'
  const [exitHoldProgress, setExitHoldProgress] = useState(0);

  const signedCount = jsa.crewSignatures?.length || 0;
  const currentNumber = signedCount + 1;

  useEffect(() => {
    function computeWidth() {
      const w = wrapRef.current ? wrapRef.current.clientWidth : 320;
      setPadWidth(Math.max(280, Math.min(900, w || 320)));
    }
    computeWidth();
    window.addEventListener('resize', computeWidth);
    return () => window.removeEventListener('resize', computeWidth);
  }, []);

  // Re-inits a blank canvas every time we advance to a new signer number
  // (currentNumber bumps once upd() flows crewSignatures back down as a
  // prop) -- this is what actually clears the pad between people, not a
  // manual clearRect after confirming.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = padWidth * dpr;
    canvas.height = PAD_HEIGHT * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0B1D2E';
    hasStrokeRef.current = false;
    setHasStroke(false);
  }, [padWidth, currentNumber]);

  function toCanvasPoint(clientX, clientY) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? padWidth / rect.width : 1;
    const scaleY = rect.height > 0 ? PAD_HEIGHT / rect.height : 1;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function beginStrokeAt(point) {
    drawingRef.current = true;
    lastPointRef.current = point;
    hasStrokeRef.current = true;
    setHasStroke(true);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.arc(point.x, point.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }
  function continueStrokeTo(point) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const last = lastPointRef.current || point;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  }
  function endStroke() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function pointerDown(e) {
    if (e.pointerType === 'touch' || phase !== 'signing') return;
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    beginStrokeAt(toCanvasPoint(e.clientX, e.clientY));
  }
  function pointerMove(e) {
    if (e.pointerType === 'touch' || phase !== 'signing') return;
    if (!drawingRef.current) return;
    e.preventDefault();
    continueStrokeTo(toCanvasPoint(e.clientX, e.clientY));
  }
  function pointerUp(e) {
    if (e.pointerType === 'touch') return;
    endStroke();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    function findActiveTouch(list) {
      if (activeTouchIdRef.current == null) return null;
      for (let i = 0; i < list.length; i += 1) if (list[i].identifier === activeTouchIdRef.current) return list[i];
      return null;
    }
    function onTouchStart(e) {
      if (phase !== 'signing') return;
      e.preventDefault();
      if (activeTouchIdRef.current != null) return;
      const t = e.changedTouches[0];
      activeTouchIdRef.current = t.identifier;
      beginStrokeAt(toCanvasPoint(t.clientX, t.clientY));
    }
    function onTouchMove(e) {
      const t = findActiveTouch(e.touches);
      if (!t) return;
      e.preventDefault();
      continueStrokeTo(toCanvasPoint(t.clientX, t.clientY));
    }
    function onTouchEnd(e) {
      const t = findActiveTouch(e.changedTouches);
      if (!t) return;
      endStroke();
      activeTouchIdRef.current = null;
    }
    function onTouchCancel() {
      endStroke();
      activeTouchIdRef.current = null;
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchCancel, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [phase, padWidth, currentNumber]);

  function clearCurrent() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokeRef.current = false;
    setHasStroke(false);
  }

  function confirmSignature() {
    if (!hasStrokeRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const next = [...(jsa.crewSignatures || []), { dataUrl, signedAt: new Date().toISOString() }];
    upd({ crewSignatures: next });
    setPhase('confirmed');
    window.setTimeout(() => setPhase('signing'), CONFIRM_PAUSE_MS);
  }

  // Exit is deliberately hard to trigger by accident -- a random person
  // waiting in line to sign should never be able to bump the app out of
  // kiosk mode. Requires holding for EXIT_HOLD_MS, with a visible fill so
  // whoever's running the sign-in (not a signer) can see it's working.
  function startExitHold() {
    setExitHoldProgress(0);
    const start = Date.now();
    exitHoldTimerRef.current = window.setInterval(() => {
      const pct = Math.min(1, (Date.now() - start) / EXIT_HOLD_MS);
      setExitHoldProgress(pct);
      if (pct >= 1) {
        clearExitHold();
        onExit();
      }
    }, 30);
  }
  function clearExitHold() {
    if (exitHoldTimerRef.current) window.clearInterval(exitHoldTimerRef.current);
    exitHoldTimerRef.current = null;
    setExitHoldProgress(0);
  }
  useEffect(() => clearExitHold, []);

  return (
    <div className="crewKiosk" role="dialog" aria-modal="true" aria-label="Crew sign-in">
      <button
        type="button"
        className="crewKioskExitHold"
        onPointerDown={startExitHold}
        onPointerUp={clearExitHold}
        onPointerLeave={clearExitHold}
        onPointerCancel={clearExitHold}
        aria-label="Hold to exit crew sign-in"
        title="Hold to exit"
      >
        <span className="crewKioskExitHoldFill" style={{ transform: `scaleX(${exitHoldProgress})` }} />
      </button>

      <div className="crewKioskBody">
        <div className="crewKioskHead">
          <span className="crewKioskEyebrow">Crew Sign-In</span>
          <h1 className="crewKioskNumber">Sign Here — #{currentNumber}</h1>
          <p className="crewKioskHint">Sign your name below, then tap Confirm &amp; Next.</p>
        </div>
        {/* The canvas stays mounted across both phases on purpose -- when it
            was conditionally rendered only during 'signing', switching to
            the 'confirmed' branch unmounted it, and remounting later left a
            brand-new canvas element whose width/height/context never got
            re-initialized by the reset effect (which only re-runs when
            padWidth/currentNumber change, not on remount) -- confirmed by
            Playwright testing: signer 2's Confirm button stayed enabled
            because hasStrokeRef never actually got cleared onto a real
            canvas. Keeping one persistent canvas node and overlaying the
            confirmation on top of it instead fixes that at the root. */}
        <div className="crewKioskPadWrap" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className="crewKioskCanvas"
            style={{ width: padWidth, height: PAD_HEIGHT, touchAction: 'none' }}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
          />
          {phase === 'confirmed' && (
            <div className="crewKioskConfirmedOverlay">
              <div className="crewKioskCheck" aria-hidden="true">&#10003;</div>
              <h1>Signed</h1>
              <p>Pass it to the next person.</p>
            </div>
          )}
        </div>
        <div className="crewKioskActions">
          <button type="button" className="btn ghost lg" disabled={phase !== 'signing'} onClick={clearCurrent}>Clear</button>
          <button type="button" className="btn primary lg crewKioskConfirm" disabled={phase !== 'signing' || !hasStroke} onClick={confirmSignature}>
            Confirm &amp; Next
          </button>
        </div>
      </div>

      <div className="crewKioskFooter">{signedCount} signed so far</div>
    </div>
  );
}
