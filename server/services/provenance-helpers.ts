/**
 * Provenance helpers for legacy router back-fill.
 *
 * Every existing create-router (interactions, notes, reflections, intel,
 * tenures, relationships) calls `recordEntityProvenance()` after a successful
 * write so the resulting fact has a source trail. Best-effort: never throws,
 * so a provenance write failure doesn't roll back the parent create.
 *
 * Source-type mapping from the legacy `input_method` enum to the
 * provenance source-type enum:
 *   voice         → voice_capture
 *   text          → text_capture
 *   form          → manual_form
 *   card_scan     → manual_form  (rare; treat as manual entry)
 *   auto_scraper  → apify_scrape
 *   system        → system
 *
 * When `input_method` is null, we default to `manual_form` — the form-based
 * UI is the assumed-default path for legacy routes.
 */

import { recordProvenance } from "../routers/provenance.router";
import type { ProvenanceEntityType, ProvenanceSourceType, InputMethod } from "../../shared/enums";

const INPUT_TO_SOURCE_MAP: Record<InputMethod, ProvenanceSourceType> = {
  voice: "voice_capture",
  text: "text_capture",
  form: "manual_form",
  card_scan: "manual_form",
  auto_scraper: "apify_scrape",
  system: "system",
};

/**
 * Record provenance for an entity that was just created by a legacy router.
 * Never throws. Returns the provenance id (or null on best-effort failure).
 */
export async function recordEntityProvenance(params: {
  entityType: ProvenanceEntityType;
  entityId: string;
  capturedBy: string;
  inputMethod?: InputMethod | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  /** Per-write confidence override; defaults to 0.85 for user-form writes
   * (high — the user explicitly entered this), 0.7 for voice/text capture. */
  confidence?: number;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const sourceType = params.inputMethod ? INPUT_TO_SOURCE_MAP[params.inputMethod] : "manual_form";
  const defaultConfidence =
    sourceType === "voice_capture" || sourceType === "text_capture" ? 0.7 : 0.85;

  return recordProvenance({
    entityType: params.entityType,
    entityId: params.entityId,
    sourceType,
    sourceUrl: params.sourceUrl ?? undefined,
    sourceLabel: params.sourceLabel ?? undefined,
    capturedBy: params.capturedBy,
    confidence: params.confidence ?? defaultConfidence,
    metadata: params.metadata,
  });
}
