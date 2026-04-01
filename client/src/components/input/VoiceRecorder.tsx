import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type RecorderState = "idle" | "recording" | "processing" | "done";

interface VoiceRecorderProps {
  onTranscription?: (text: string, audioBlob: Blob) => void;
  onError?: (error: string) => void;
  className?: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceRecorder({
  onTranscription,
  onError,
  className,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const [transcription, setTranscription] = useState("");
  const [analyserData, setAnalyserData] = useState<number[]>(
    new Array(32).fill(0),
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const updateWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    // Downsample to 32 bars
    const barCount = 32;
    const step = Math.floor(dataArray.length / barCount);
    const bars: number[] = [];
    for (let i = 0; i < barCount; i++) {
      bars.push(dataArray[i * step] / 255);
    }
    setAnalyserData(bars);
    animFrameRef.current = requestAnimationFrame(updateWaveform);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up analyser for waveform
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        handleRecordingComplete(blob);
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setState("recording");
      setDuration(0);
      setTranscription("");

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      updateWaveform();
    } catch (err) {
      onError?.("Microphone access denied or unavailable");
    }
  }, [onError, updateWaveform]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    cleanup();
    setState("processing");
  }, [cleanup]);

  const handleRecordingComplete = useCallback(
    (blob: Blob) => {
      // In a real implementation, this would upload the blob and call the
      // voice.transcribe endpoint. For now, we simulate with the blob.
      setState("processing");

      // Simulate processing delay then call back
      // In production: upload blob to S3, get URL, call trpc.voice.transcribe
      setTimeout(() => {
        const placeholderText =
          "[Voice recording captured - upload to AssemblyAI for transcription]";
        setTranscription(placeholderText);
        setState("done");
        onTranscription?.(placeholderText, blob);
      }, 1500);
    },
    [onTranscription],
  );

  const reset = useCallback(() => {
    setState("idle");
    setDuration(0);
    setTranscription("");
    setAnalyserData(new Array(32).fill(0));
  }, []);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main control area */}
      <div className="flex flex-col items-center gap-4 py-4">
        {/* Waveform visualization */}
        {state === "recording" && (
          <div className="flex items-end justify-center gap-[2px] h-12 w-full max-w-[280px]">
            {analyserData.map((value, i) => (
              <div
                key={i}
                className="w-1.5 rounded-full bg-[var(--input-voice)] transition-all duration-75"
                style={{
                  height: `${Math.max(4, value * 48)}px`,
                  opacity: 0.5 + value * 0.5,
                }}
              />
            ))}
          </div>
        )}

        {/* Timer */}
        {(state === "recording" || state === "processing") && (
          <p className="text-sm font-mono text-muted-foreground tabular-nums">
            {formatTime(duration)}
          </p>
        )}

        {/* Action button */}
        {state === "idle" && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-16 w-16 rounded-full border-2 border-[var(--input-voice)] text-[var(--input-voice)] hover:bg-[var(--input-voice)]/10"
            onClick={startRecording}
          >
            <Mic className="h-6 w-6" />
          </Button>
        )}

        {state === "recording" && (
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="h-16 w-16 rounded-full animate-pulse"
            onClick={stopRecording}
          >
            <Square className="h-5 w-5" />
          </Button>
        )}

        {state === "processing" && (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--input-voice)]" />
            <p className="text-sm text-muted-foreground">Processing audio...</p>
          </div>
        )}

        {/* State label */}
        {state === "idle" && (
          <p className="text-sm text-muted-foreground">Tap to start recording</p>
        )}
        {state === "recording" && (
          <p className="text-sm text-[var(--input-voice)] font-medium">
            Recording... tap to stop
          </p>
        )}
      </div>

      {/* Transcription result */}
      {state === "done" && transcription && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Transcription
          </p>
          <p className="text-sm leading-relaxed">{transcription}</p>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Record Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
