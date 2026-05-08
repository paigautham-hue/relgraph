/**
 * RecordingBar — fixed full-width bar that appears at the bottom of the
 * viewport while a voice clip is being captured or transcribed.
 *
 * Portalled to document.body at z-9999 so it floats above modals, sheets,
 * and the mobile keyboard. Adapted from the Meridian pattern.
 *
 * Apple-grade per Rule 3:
 *   - Animated waveform reflects live mic level (≥ 24 bars, gentle jitter so
 *     it never looks "dead" even in silence)
 *   - Designed empty / transcribing state with a clear progress indicator
 *   - Cancel + Stop are distinct (cancel discards, stop transcribes)
 *   - All buttons are 44pt+; aria-labels present
 *   - Light + dark designed
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, Square, X } from "lucide-react";

interface RecordingBarProps {
  isRecording: boolean;
  isTranscribing: boolean;
  durationSeconds: number;
  audioLevel: number; // 0-1
  onStop: () => void;
  onCancel: () => void;
  stopLabel?: string;
}

const BAR_COUNT = 28;

export function RecordingBar({
  isRecording,
  isTranscribing,
  durationSeconds,
  audioLevel,
  onStop,
  onCancel,
  stopLabel = "Stop",
}: RecordingBarProps) {
  const [waveform, setWaveform] = useState<number[]>(new Array(BAR_COUNT).fill(0.15));

  // Animate the waveform — sample the live audio level, sprinkle gentle jitter
  // so silence still looks alive (Apple's voice-memos pattern).
  useEffect(() => {
    if (!isRecording) {
      setWaveform(new Array(BAR_COUNT).fill(0.15));
      return;
    }
    const handle = setInterval(() => {
      setWaveform(() =>
        Array.from({ length: BAR_COUNT }, (_, i) => {
          const jitter = (Math.random() - 0.5) * 0.3;
          const wave = Math.sin(Date.now() / 200 + i * 0.5) * 0.15;
          return Math.max(0.08, Math.min(1, audioLevel + jitter + wave));
        }),
      );
    }, 80);
    return () => clearInterval(handle);
  }, [isRecording, audioLevel]);

  if (!isRecording && !isTranscribing) return null;
  if (typeof document === "undefined") return null;

  const minutes = Math.floor(durationSeconds / 60);
  const secs = durationSeconds % 60;
  const timer = `${minutes}:${secs.toString().padStart(2, "0")}`;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[9999] border-t bg-background/95 backdrop-blur-md shadow-lg"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        {isRecording ? (
          <>
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-500/15">
              <Mic className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden />
              <span className="sr-only">Recording in progress</span>
            </div>
            <div className="flex flex-1 items-center gap-3 min-w-0">
              <div className="flex h-10 flex-1 items-center justify-center gap-[2px]" aria-hidden>
                {waveform.map((v, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-red-500/70 transition-all duration-75 dark:bg-red-400/70"
                    style={{ height: `${Math.max(4, v * 32)}px`, opacity: 0.4 + v * 0.6 }}
                  />
                ))}
              </div>
              <span className="font-mono text-sm tabular-nums text-muted-foreground flex-shrink-0">
                {timer}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onCancel}
              className="h-11 w-11 flex-shrink-0 rounded-full"
              aria-label="Cancel recording"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onStop}
              className="h-11 flex-shrink-0 gap-1.5 px-4"
              aria-label={stopLabel}
            >
              <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
              {stopLabel}
            </Button>
          </>
        ) : (
          <>
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
            </div>
            <p className="flex-1 text-sm text-muted-foreground">Transcribing your voice…</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
