/**
 * useVoiceRecording — lightweight quick-capture hook for the universal mic.
 *
 * Adapted from Meridian's pattern. Records via MediaRecorder, encodes to base64,
 * sends through `voice.quickTranscribe`, and surfaces the result via callback.
 *
 * The hook owns:
 *   - permissions + getUserMedia
 *   - the MediaRecorder + audio chunks
 *   - audio level monitoring (for the recording bar's waveform)
 *   - a max-duration timer (auto-stops at maxDurationSeconds)
 *   - retry on transcription failure (re-uses the cached blob)
 *
 * Errors surface via onError; all are human-readable and end-user-actionable.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";

interface UseVoiceRecordingOptions {
  onTranscriptionComplete: (text: string) => void;
  onError: (error: string) => void;
  maxDurationSeconds?: number;
}

interface VoiceRecordingState {
  isRecording: boolean;
  isTranscribing: boolean;
  audioLevel: number;
  canRetry: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  retryTranscription: () => void;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read recording"));
        return;
      }
      // strip the "data:audio/webm;base64," prefix
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read recording"));
    reader.readAsDataURL(blob);
  });
}

export function useVoiceRecording({
  onTranscriptionComplete,
  onError,
  maxDurationSeconds = 60,
}: UseVoiceRecordingOptions): VoiceRecordingState {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [canRetry, setCanRetry] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBlobRef = useRef<Blob | null>(null);
  const wasCancelledRef = useRef(false);

  const transcribeMutation = trpc.voice.quickTranscribe.useMutation();

  const cleanup = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (maxDurationTimerRef.current !== null) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const monitorLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    setAudioLevel(avg / 255);
    animationFrameRef.current = requestAnimationFrame(monitorLevel);
  }, []);

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      lastBlobRef.current = blob;
      setIsTranscribing(true);
      setCanRetry(false);
      try {
        const base64 = await blobToBase64(blob);
        const result = await transcribeMutation.mutateAsync({
          audioBase64: base64,
          mimeType: blob.type || "audio/webm",
        });
        setIsTranscribing(false);
        if (result.text && result.text.trim()) {
          onTranscriptionComplete(result.text.trim());
        } else {
          setCanRetry(true);
          onError("No speech detected. Try speaking a bit louder or longer.");
        }
      } catch (err) {
        setIsTranscribing(false);
        setCanRetry(true);
        const message =
          err instanceof Error
            ? err.message
            : "Couldn't reach the transcription service. Check your connection and tap Retry.";
        onError(message);
      }
    },
    [transcribeMutation, onTranscriptionComplete, onError],
  );

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing) return;
    wasCancelledRef.current = false;
    setCanRetry(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Audio level monitoring for the waveform UI.
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        cleanup();
        setIsRecording(false);
        if (wasCancelledRef.current) {
          audioChunksRef.current = [];
          return;
        }
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        if (blob.size === 0) {
          onError("That recording was empty. Try again.");
          return;
        }
        void transcribeBlob(blob);
      };

      recorder.start(250);
      setIsRecording(true);
      monitorLevel();

      maxDurationTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, maxDurationSeconds * 1000);
    } catch (err) {
      cleanup();
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access was denied. Allow microphone access in your browser settings to use voice."
          : err instanceof Error
          ? err.message
          : "Couldn't start the microphone. Try again.";
      onError(message);
    }
  }, [cleanup, isRecording, isTranscribing, maxDurationSeconds, monitorLevel, onError, transcribeBlob]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    wasCancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    } else {
      cleanup();
      setIsRecording(false);
    }
  }, [cleanup]);

  const retryTranscription = useCallback(() => {
    if (lastBlobRef.current) {
      void transcribeBlob(lastBlobRef.current);
    } else {
      onError("Nothing to retry — record a new clip.");
    }
  }, [onError, transcribeBlob]);

  return {
    isRecording,
    isTranscribing,
    audioLevel,
    canRetry,
    startRecording,
    stopRecording,
    cancelRecording,
    retryTranscription,
  };
}
