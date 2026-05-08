/**
 * VoiceInputButton — universal mic icon next to any text input.
 *
 * Composition: small inline `<Mic>` button + portalled `RecordingBar`. Press
 * once to start recording, press Stop on the bar to transcribe. The
 * transcribed text is forwarded to `onTranscription` so the host can insert
 * it (typically into the field next to the button).
 *
 * Per Rule 3 (Voice-first inputs everywhere), this drops in next to any
 * Textarea/Input. The host sets the `autoStart` prop in voice-first surfaces
 * (the command box launches recording on first tap).
 */

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";
import { RecordingBar } from "./RecordingBar";
import { toast } from "sonner";

interface VoiceInputButtonProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
  maxDurationSeconds?: number;
  size?: "sm" | "default";
  className?: string;
  ariaLabel?: string;
  /** When true, replaces the inline button with a noop trigger ref — host can
   *  start recording programmatically via the returned ref-style interface.
   *  Not used today; kept for the command box's "start recording on tap"
   *  flow that ships in week 4 polish. */
  hideTrigger?: boolean;
}

export function VoiceInputButton({
  onTranscription,
  disabled = false,
  maxDurationSeconds = 60,
  size = "default",
  className = "",
  ariaLabel = "Start voice input",
  hideTrigger = false,
}: VoiceInputButtonProps) {
  const [duration, setDuration] = useState(0);
  // Use a ref so the onError closure always calls the *latest* retry function.
  const retryRef = useRef<() => void>(() => {});

  const { isRecording, isTranscribing, audioLevel, startRecording, stopRecording, cancelRecording, retryTranscription } =
    useVoiceRecording({
      maxDurationSeconds,
      onTranscriptionComplete: (text) => {
        onTranscription(text);
        toast.success("Transcribed");
      },
      onError: (msg) => {
        toast.error(msg, {
          duration: 8000,
          action: { label: "Retry", onClick: () => retryRef.current() },
        });
      },
    });
  retryRef.current = retryTranscription;

  // Live timer.
  useEffect(() => {
    if (!isRecording) {
      setDuration(0);
      return;
    }
    const handle = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(handle);
  }, [isRecording]);

  const buttonSize = size === "sm" ? "h-9 w-9" : "h-11 w-11";

  return (
    <>
      {!hideTrigger && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`${buttonSize} flex-shrink-0 rounded-full transition-colors hover:bg-primary/10 ${className}`}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled || isTranscribing}
          aria-label={isRecording ? "Stop recording" : ariaLabel}
          aria-pressed={isRecording}
        >
          <Mic className={`${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} ${isRecording ? "text-red-600 dark:text-red-400" : "text-primary"}`} aria-hidden />
        </Button>
      )}
      <RecordingBar
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        durationSeconds={duration}
        audioLevel={audioLevel}
        onStop={stopRecording}
        onCancel={cancelRecording}
        stopLabel="Stop & insert"
      />
    </>
  );
}
