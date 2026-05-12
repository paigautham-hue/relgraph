/**
 * DropZone — the universal data inlet.
 *
 * Mounted once on Today. Watches the whole window for drag events and shows
 * a soft overlay on dragover. Drop a file (or paste text via Cmd+V into the
 * command box when no input is focused) → opens the preview modal with the
 * parsed entities.
 *
 * Apple-grade per Rule 3:
 *   - Overlay only appears while dragging (no permanent UI weight)
 *   - 44pt drop target visually; the whole viewport is functionally the target
 *   - Single one-line "Drop to import" copy, friendly tone
 *   - Light + dark designed
 *   - Cmd+V on empty page intercepts paste and opens preview (with helpful copy)
 *   - aria-live announces the drag state to screen readers
 *
 * The preview modal lives in DropImportPreview; this component owns:
 *   - global event listeners (dragover, drop, paste)
 *   - file → base64 (for xlsx) or text reading
 *   - the analyze call (with loading state)
 *   - handoff to DropImportPreview
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { DropImportPreview } from "./DropImportPreview";
import { FileDown, Sparkles } from "lucide-react";

type DropZoneState = "idle" | "dragging" | "loading" | "preview";

const ACCEPTED_EXTENSIONS = [".csv", ".tsv", ".xlsx", ".xls", ".xlsm", ".vcf", ".vcard", ".json", ".txt"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function DropZone() {
  const [state, setState] = useState<DropZoneState>("idle");
  const dragCounter = useRef(0);
  const [proposal, setProposal] = useState<any | null>(null);
  const analyzeMutation = trpc.dropImport.analyze.useMutation();

  const closePreview = useCallback(() => {
    setState("idle");
    setProposal(null);
  }, []);

  const submitContent = useCallback(
    async (params: { content: string; encoding: "utf8" | "base64"; fileName?: string }) => {
      setState("loading");
      try {
        const result = await analyzeMutation.mutateAsync(params);
        setProposal(result);
        setState("preview");
        if (result.rows.length === 0) {
          // The modal will render the warnings; just toast a hint.
          toast.info("No entities found — check the preview for hints.");
        }
      } catch (err) {
        setState("idle");
        const message = err instanceof Error ? err.message : "Could not analyze the drop.";
        toast.error(message);
      }
    },
    [analyzeMutation],
  );

  // ── File drop ────────────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`"${file.name}" is too large (cap is 10 MB). Split the file or paste a section.`);
        return;
      }
      const isBinary = /\.(xlsx|xls|xlsm)$/i.test(file.name);
      if (isBinary) {
        const buffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        await submitContent({ content: base64, encoding: "base64", fileName: file.name });
      } else {
        const text = await file.text();
        await submitContent({ content: text, encoding: "utf8", fileName: file.name });
      }
    },
    [submitContent],
  );

  // ── Global drag listeners ────────────────────────────────────────────────
  useEffect(() => {
    function onDragEnter(e: DragEvent) {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      dragCounter.current += 1;
      if (dragCounter.current === 1) setState("dragging");
    }
    function onDragLeave(e: DragEvent) {
      e.preventDefault();
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setState((prev) => (prev === "dragging" ? "idle" : prev));
      }
    }
    function onDragOver(e: DragEvent) {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
    async function onDrop(e: DragEvent) {
      e.preventDefault();
      dragCounter.current = 0;
      setState("idle");
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      if (files.length > 1) {
        toast.info("Drop one file at a time. Splitting up your drops makes the preview more useful.");
        await handleFile(files[0]);
        return;
      }
      await handleFile(files[0]);
    }

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFile]);

  // ── Paste intercept ──────────────────────────────────────────────────────
  // If the user pastes plain text while no input is focused, intercept and
  // route to drop-import preview. We skip when an input/textarea has focus
  // (the user is typing in the command box) — the CommandBox handles its
  // own paste flow.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || (active as HTMLElement).isContentEditable) {
          return;
        }
      }
      if (!e.clipboardData) return;

      // File paste (screenshot, business card image) — handle separately
      // when we ship vision. For v1, only handle text.
      const text = e.clipboardData.getData("text/plain");
      if (!text || text.trim().length < 20) {
        // Too short to be meaningful import — let it through to the
        // command box if they refocus.
        return;
      }
      e.preventDefault();
      void submitContent({ content: text, encoding: "utf8", fileName: undefined });
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [submitContent]);

  return (
    <>
      {/* Dragging overlay */}
      {state === "dragging" && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none"
        >
          <Card className="pointer-events-auto border-2 border-dashed border-primary bg-background px-8 py-10 shadow-xl">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <FileDown className="h-7 w-7 text-primary" aria-hidden />
              </div>
              <div>
                <p className="text-lg font-semibold">Drop to import</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  CSV, Excel, vCard, JSON, or plain text — RelGraph extracts the people and orgs.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Accepted: {ACCEPTED_EXTENSIONS.join(" · ")}
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Loading state — small toast-style banner while analyze runs */}
      {state === "loading" && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <Card className="flex items-center gap-3 px-4 py-3 shadow-xl">
            <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden />
            <span className="text-sm">Analyzing your drop…</span>
          </Card>
        </div>
      )}

      {/* Preview modal */}
      {state === "preview" && proposal && (
        <DropImportPreview proposal={proposal} onClose={closePreview} />
      )}
    </>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // Build in chunks to avoid call-stack overflow on large files.
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    // Convert via Array.from to avoid the iterator-target downlevel error.
    binary += String.fromCharCode.apply(null, Array.from(chunk) as number[]);
  }
  return btoa(binary);
}
