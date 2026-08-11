import { useRef } from 'react';
import { useSpeechToText } from './useSpeechToText';

function joinText(base, chunk) {
  const trimmedBase = (base || '').replace(/\s+$/u, '');
  const trimmedChunk = (chunk || '').replace(/^\s+/u, '');
  if (!trimmedChunk) return base || '';
  if (!trimmedBase) return trimmedChunk;
  return `${trimmedBase} ${trimmedChunk}`;
}

// Sits inline next to a field's label (see .fieldLabelRow in voice.css).
// Never disables or replaces the textarea it sits beside -- typing always
// keeps working regardless of listening/error/unsupported state. Witness
// and employee-statement fields rely on this being a pure passthrough: the
// hook hands back exactly what SpeechRecognition returns, nothing here
// rewrites or cleans up wording.
export default function SpeakButton({ value, onChange, disabled = false }) {
  // Snapshot of the field's value at the moment listening started, so each
  // interim/final result replaces "base + transcript-so-far" as one string
  // instead of compounding on every partial result -- that's what prevents
  // both duplication across interim events and "existingtextnewtext"
  // collisions when the user types, speaks, types, speaks again.
  const baseValueRef = useRef('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const { isSupported, isListening, error, start, stop } = useSpeechToText({
    onResult: (text) => { onChangeRef.current(joinText(baseValueRef.current, text)); },
  });

  if (!isSupported) {
    return <span className="voiceHint">Tip: use your keyboard's dictation mic to fill this in by voice.</span>;
  }

  const handleClick = () => {
    if (isListening) {
      stop();
      return;
    }
    baseValueRef.current = value || '';
    start();
  };

  return (
    <span className="voiceControl">
      <button
        type="button"
        className={`voiceBtn${isListening ? ' listening' : ''}`}
        onClick={handleClick}
        disabled={disabled}
        aria-label={isListening ? 'Stop dictating this field' : 'Dictate this field'}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M9 22h6" />
        </svg>
        {isListening ? 'Stop' : 'Speak'}
      </button>
      {isListening && !error && <span className="voiceStatus" role="status" aria-live="polite">Listening… tap Stop when finished.</span>}
      {error && <span className="voiceStatus voiceError" role="status" aria-live="polite">{error.message}</span>}
    </span>
  );
}
