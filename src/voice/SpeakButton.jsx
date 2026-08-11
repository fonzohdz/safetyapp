import { useRef } from 'react';
import { useSpeechToText } from './useSpeechToText';
import { normalizeSpokenList, appendSpokenListItems } from './spokenListFormatting';

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
//
// mode="narrative" (default) is that passthrough, unchanged. mode="list" is
// for JSA Tasks/Hazards/Controls only: while listening, interim results
// still preview as plain running text (no reformatting mid-speech -- avoids
// jumping/duplicate entries per the mission), but the FINAL result is run
// through normalizeSpokenList and appended as one line per item. Passing
// list mode is opt-in per call site; every other narrative field is
// unaffected by its existence.
export default function SpeakButton({ value, onChange, disabled = false, mode = 'narrative' }) {
  // Snapshot of the field's value at the moment listening started, so each
  // interim/final result replaces "base + transcript-so-far" as one string
  // instead of compounding on every partial result -- that's what prevents
  // both duplication across interim events and "existingtextnewtext"
  // collisions when the user types, speaks, types, speaks again.
  const baseValueRef = useRef('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const { isSupported, isListening, error, start, stop } = useSpeechToText({
    onResult: (text, isFinal) => {
      if (mode === 'list' && isFinal) {
        onChangeRef.current(appendSpokenListItems(baseValueRef.current, normalizeSpokenList(text)));
      } else {
        onChangeRef.current(joinText(baseValueRef.current, text));
      }
    },
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
      <span className="voiceControlRow">
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
      {mode === 'list' && !isListening && !error && (
        <span className="voiceListHint">Say each item as its own sentence, or say "next item."</span>
      )}
    </span>
  );
}
