import { useCallback, useEffect, useRef, useState } from 'react';

// Feature-detected once at module load, not per-mount, so every call site
// agrees instantly on support (no flash of a mic button that then
// disappears). Safari (iOS/iPadOS/macOS) has never implemented this API --
// only Chrome/Edge (desktop + Android) do. SpeakButton is responsible for
// showing a browser-native-dictation hint instead of a button when this is
// false; this hook only ever reports the fact.
const SpeechRecognitionCtor = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;
export const SPEECH_RECOGNITION_SUPPORTED = Boolean(SpeechRecognitionCtor);

function mapError(code) {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return { type: 'permission-denied', message: 'Microphone access was blocked. You can still type this field normally.' };
  }
  if (code === 'no-speech') {
    return { type: 'no-speech', message: "Didn't catch that. Tap the microphone to try again, or type instead." };
  }
  if (code === 'network') {
    return { type: 'network', message: 'Voice input needs a network connection. You can still type this field normally.' };
  }
  return { type: 'other', message: 'Something went wrong with voice input. You can still type this field normally.' };
}

// Wraps SpeechRecognition as a plain "microphone in, text out" primitive --
// it never touches field state itself (no onChange call, no submit, no step
// change), so it's safe to reuse identically from main.jsx's TA, Incident's
// local TextAreaField, and FormPrimitives' TextAreaField without those three
// systems needing to share anything else. Continuous mode with manual
// start/stop: field narration on a job site has natural pauses (recalling
// details, background noise) that an auto-stop-on-silence mode would cut off
// mid-thought.
export function useSpeechToText({ onResult } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      recognitionRef.current = null;
      try { rec.stop(); } catch { /* already stopped */ }
    }
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    if (!SPEECH_RECOGNITION_SUPPORTED || recognitionRef.current) return;
    setError(null);
    setTranscript('');
    const rec = new SpeechRecognitionCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event) => {
      let combined = '';
      let isFinal = false;
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      setTranscript(combined);
      onResultRef.current?.(combined, isFinal);
    };
    rec.onerror = (event) => {
      setError(mapError(event.error));
      recognitionRef.current = null;
      setIsListening(false);
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognitionRef.current = rec;
    setIsListening(true);
    try {
      rec.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, []);

  // Tear down a live mic session if the field unmounts mid-dictation (e.g.
  // the user navigates away from the step while listening).
  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  return { isSupported: SPEECH_RECOGNITION_SUPPORTED, isListening, error, start, stop, transcript };
}
