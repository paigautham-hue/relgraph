/**
 * Command dispatcher — executes the 8 RelGraph intents from the universal
 * command box (or voice bot, week 4).
 *
 * Each tool returns a uniform `CommandResult` shape:
 *   - `kind` discriminates how the UI renders the result
 *     ('paths' | 'briefing' | 'logged' | 'intel' | 'opportunity_updated' |
 *      'watch_added' | 'owner' | 'gap' | 'pending' | 'error')
 *   - `summary` is a one-line human-readable explanation, ALWAYS present
 *   - `payload` is tool-specific structured data the UI uses to render
 *
 * Tools that depend on routers shipped in later weeks return
 * { kind: 'pending', summary: 'This action will be available in week N' }.
 * Per Rule 3 #2, "feature pending" must read like a human wrote it, not an
 * engineer.
 */

import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  organizations,
  persons,
  powerMoves,
  ownership,
  users,
  watches,
  interactions,
  interactionParticipants,
  opportunities,
} from "../db/schema";
import type { ClassifiedIntent, IntentTool } from "./intent-router.service";
import { OPPORTUNITY_STAGE_TRANSITIONS, OPPORTUNITY_STAGES } from "../../shared/enums";
import type { OpportunityStage } from "../../shared/enums";
import { recordProvenance } from "../routers/provenance.router";

export type CommandResult =
  | { kind: "paths"; summary: string; payload: { target: string; results: unknown[] } }
  | { kind: "briefing"; summary: string; payload: { name: string; matched: { id: string; name: string; currentTitle: string | null }[] } }
  | { kind: "logged"; summary: string; payload: { interactionId: string; matchedPersons: { id: string; name: string }[] } }
  | { kind: "intel"; summary: string; payload: { org: string; powerMoves: PowerMoveSummary[] } }
  | { kind: "opportunity_updated"; summary: string; payload: { name: string; stage: string } }
  | { kind: "watch_added"; summary: string; payload: { target: string; watchId: string } }
  | { kind: "owner"; summary: string; payload: { target: string; matches: OwnerMatch[] } }
  | { kind: "gap"; summary: string; payload: { sector: string; covered: number; gaps: string[] } }
  | { kind: "pending"; summary: string; payload: { eta: string } }
  | { kind: "error"; summary: string; payload: { reason: string } };

interface PowerMoveSummary {
  id: string;
  type: string;
  headline: string;
  occurredAt: Date | null;
  primaryOrgName: string | null;
  primaryPersonName: string | null;
}

interface OwnerMatch {
  personId: string;
  personName: string;
  ownerName: string;
  tier: string;
}

interface DispatchContext {
  userId: string;
  userName: string;
}

/**
 * Dispatch a classified intent. Never throws to callers — wraps known errors
 * in `kind: 'error'` so the UI always gets a renderable result.
 */
export async function dispatchIntent(
  intent: ClassifiedIntent,
  ctx: DispatchContext,
): Promise<CommandResult> {
  try {
    switch (intent.tool) {
      case "findPath":
        return await findPathTool(intent.args.target ?? "", ctx);
      case "briefPerson":
        return await briefPersonTool(intent.args.name ?? "", ctx);
      case "logInteraction":
        return await logInteractionTool(intent.args.text ?? "", ctx);
      case "searchIntel":
        return await searchIntelTool(intent.args.org ?? "", ctx);
      case "updateOpportunity":
        return await updateOpportunityTool(
          intent.args.name ?? "",
          intent.args.stage ?? "",
          intent.args.note,
          ctx,
        );
      case "addToWatchlist":
        return await addToWatchlistTool(intent.args.target ?? "", ctx);
      case "whoOwns":
        return await whoOwnsTool(intent.args.target ?? "", ctx);
      case "coverageGap":
        return await coverageGapTool(intent.args.sector ?? "", ctx);
      case "unknown":
      default:
        return {
          kind: "error",
          summary:
            intent.rationale ??
            "I'm not sure what to do with that. Try asking for a path, a briefing, or logging a meeting — or tap the mic for voice.",
          payload: { reason: "unknown_intent" },
        };
    }
  } catch (err) {
    return {
      kind: "error",
      summary: `Something went wrong while running this command. ${err instanceof Error ? err.message : ""}`.trim(),
      payload: { reason: err instanceof Error ? err.message : String(err) },
    };
  }
}

function pendingResult(summary: string, eta: string): CommandResult {
  return { kind: "pending", summary, payload: { eta } };
}

// ─── findPath ────────────────────────────────────────────────────────────────

async function findPathTool(target: string, _ctx: DispatchContext): Promise<CommandResult> {
  if (!target.trim()) {
    return {
      kind: "error",
      summary: "Tell me who you'd like a path to. Example: 'Reach the SBI CMD'.",
      payload: { reason: "missing_target" },
    };
  }
  // Phase 3 scaffold: PathFinder lives in `searchRouter.findPath` and requires
  // explicit two-person IDs. The full natural-language path-resolution will
  // ship alongside the Graph page upgrades. For now, surface candidate persons
  // and orgs matching the target so the UI can offer disambiguation.
  const db = getDb();
  const q = `%${target.toLowerCase()}%`;
  const personMatches = await db
    .select({ id: persons.id, name: persons.name, currentTitle: persons.currentTitle })
    .from(persons)
    .where(sql`LOWER(${persons.name}) LIKE ${q}`)
    .limit(5);
  const orgMatches = await db
    .select({ id: organizations.id, name: organizations.name, shortName: organizations.shortName })
    .from(organizations)
    .where(or(sql`LOWER(${organizations.name}) LIKE ${q}`, sql`LOWER(${organizations.shortName}) LIKE ${q}`))
    .limit(5);

  const total = personMatches.length + orgMatches.length;
  if (total === 0) {
    return {
      kind: "paths",
      summary: `No matches for "${target}". The graph has only orgs we've seeded so far. Try a person name from PathFinder or add this contact first.`,
      payload: { target, results: [] },
    };
  }
  return {
    kind: "paths",
    summary: `Found ${total} match${total === 1 ? "" : "es"} for "${target}". Open PathFinder to compute the strongest route.`,
    payload: {
      target,
      results: [
        ...personMatches.map(p => ({ kind: "person" as const, ...p })),
        ...orgMatches.map(o => ({ kind: "organization" as const, ...o })),
      ],
    },
  };
}

// ─── briefPerson ─────────────────────────────────────────────────────────────

async function briefPersonTool(name: string, _ctx: DispatchContext): Promise<CommandResult> {
  if (!name.trim()) {
    return {
      kind: "error",
      summary: "Tell me whom to brief. Example: 'Brief me on Rajesh Kumar'.",
      payload: { reason: "missing_name" },
    };
  }
  const db = getDb();
  const q = `%${name.toLowerCase()}%`;
  const matches = await db
    .select({ id: persons.id, name: persons.name, currentTitle: persons.currentTitle })
    .from(persons)
    .where(sql`LOWER(${persons.name}) LIKE ${q}`)
    .limit(5);
  if (matches.length === 0) {
    return {
      kind: "briefing",
      summary: `I couldn't find "${name}" in the graph yet. Add them first, then ask again.`,
      payload: { name, matched: [] },
    };
  }
  if (matches.length === 1) {
    return {
      kind: "briefing",
      summary: `Found ${matches[0].name}${matches[0].currentTitle ? ` (${matches[0].currentTitle})` : ""}. Open their profile to generate a briefing.`,
      payload: { name, matched: matches },
    };
  }
  return {
    kind: "briefing",
    summary: `${matches.length} people match "${name}". Pick the right one to brief.`,
    payload: { name, matched: matches },
  };
}

// ─── logInteraction ──────────────────────────────────────────────────────────

async function logInteractionTool(text: string, ctx: DispatchContext): Promise<CommandResult> {
  if (!text.trim() || text.length < 10) {
    return {
      kind: "error",
      summary: "Tell me what happened. Example: 'Met Rajesh from SBI yesterday — said digital lending is moving fast.'",
      payload: { reason: "missing_text" },
    };
  }
  const db = getDb();

  // Naive entity resolution for week 3: extract Capitalised Words as person
  // candidates, match against existing persons. Full LLM-based extraction
  // ships in week 5 alongside provenance + opportunity tagging.
  const tokenSet = new Set(
    Array.from(text.matchAll(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2})\b/g)).map(m => m[1].toLowerCase()),
  );
  const matchedPersons: { id: string; name: string }[] = [];
  const tokenList = Array.from(tokenSet);
  if (tokenList.length > 0) {
    const all = await db.select({ id: persons.id, name: persons.name }).from(persons);
    for (const p of all) {
      const lower = p.name.toLowerCase();
      for (const candidate of tokenList) {
        if (lower.includes(candidate) || candidate.includes(lower)) {
          matchedPersons.push({ id: p.id, name: p.name });
          break;
        }
      }
    }
  }

  // Insert a generic interaction. Type defaults to 'other' since we don't
  // classify; the UI lets the user refine.
  const interactionId = crypto.randomUUID();
  await db.insert(interactions).values({
    id: interactionId,
    type: "other",
    occurredAt: new Date(),
    summary: text.slice(0, 500),
    rawInputText: text,
    inputMethod: "text",
    createdBy: ctx.userId,
  });

  for (const m of matchedPersons.slice(0, 5)) {
    await db.insert(interactionParticipants).values({
      id: crypto.randomUUID(),
      interactionId,
      personId: m.id,
      role: "attendee",
    });
  }

  // Record provenance: this interaction came in via the command box
  // (text_capture). Confidence 0.7 — entity-extraction is naive in week 3
  // and will tighten when the LLM-based extractor lands.
  await recordProvenance({
    entityType: "interaction",
    entityId: interactionId,
    sourceType: "text_capture",
    sourceLabel: "Command box",
    capturedBy: ctx.userId,
    confidence: 0.7,
  });

  const peopleSummary =
    matchedPersons.length === 0
      ? "No matching contacts auto-linked"
      : `Linked to ${matchedPersons.map(m => m.name).join(", ")}`;
  return {
    kind: "logged",
    summary: `Logged. ${peopleSummary}. Open the interaction to add details or attach an opportunity.`,
    payload: { interactionId, matchedPersons },
  };
}

// ─── updateOpportunity ───────────────────────────────────────────────────────

async function updateOpportunityTool(
  name: string,
  stageInput: string,
  note: string | undefined,
  ctx: DispatchContext,
): Promise<CommandResult> {
  if (!name.trim()) {
    return {
      kind: "error",
      summary: "Tell me which opportunity. Example: 'Got the LOI from SBI for the lending partnership'.",
      payload: { reason: "missing_name" },
    };
  }
  const stageNormalised = stageInput.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!OPPORTUNITY_STAGES.includes(stageNormalised as OpportunityStage)) {
    return {
      kind: "error",
      summary: `"${stageInput}" isn't a valid stage. Try: ${OPPORTUNITY_STAGES.slice(0, -1).join(", ")}, or lost.`,
      payload: { reason: "invalid_stage" },
    };
  }
  const targetStage = stageNormalised as OpportunityStage;

  const db = getDb();
  const q = `%${name.toLowerCase()}%`;
  const matches = await db
    .select({ id: opportunities.id, name: opportunities.name, stage: opportunities.stage, ownerId: opportunities.ownerId })
    .from(opportunities)
    .where(sql`LOWER(${opportunities.name}) LIKE ${q}`)
    .limit(5);
  if (matches.length === 0) {
    return {
      kind: "error",
      summary: `No opportunity matches "${name}" yet. Create one first from the Opportunities page.`,
      payload: { reason: "no_match" },
    };
  }
  if (matches.length > 1) {
    return {
      kind: "error",
      summary: `${matches.length} opportunities match "${name}" — be more specific or open the Opportunities page to update directly.`,
      payload: { reason: "ambiguous" },
    };
  }
  const opp = matches[0];
  const fromStage = opp.stage as OpportunityStage;
  if (fromStage === targetStage) {
    return {
      kind: "opportunity_updated",
      summary: `${opp.name} is already in stage "${targetStage}". Nothing to change.`,
      payload: { name: opp.name, stage: targetStage },
    };
  }
  const allowed = OPPORTUNITY_STAGE_TRANSITIONS[fromStage] ?? [];
  if (!allowed.includes(targetStage)) {
    return {
      kind: "error",
      summary: `Can't move "${opp.name}" from "${fromStage}" directly to "${targetStage}". Allowed next: ${allowed.join(", ")}.`,
      payload: { reason: "invalid_transition" },
    };
  }

  const now = new Date();
  await db
    .update(opportunities)
    .set({ stage: targetStage, lastStageChangeAt: now, lastActivityAt: now })
    .where(eq(opportunities.id, opp.id));

  // Record provenance for the stage transition.
  await recordProvenance({
    entityType: "opportunity",
    entityId: opp.id,
    fieldName: "stage",
    sourceType: "text_capture",
    sourceLabel: "Command box",
    capturedBy: ctx.userId,
    confidence: 0.85,
    metadata: note ? { note, fromStage, toStage: targetStage } : { fromStage, toStage: targetStage },
  });

  return {
    kind: "opportunity_updated",
    summary: `Moved "${opp.name}" from ${fromStage} to ${targetStage}.${note ? ` Noted: "${note}"` : ""}`,
    payload: { name: opp.name, stage: targetStage },
  };
}

// ─── searchIntel ─────────────────────────────────────────────────────────────

async function searchIntelTool(org: string, _ctx: DispatchContext): Promise<CommandResult> {
  if (!org.trim()) {
    return {
      kind: "error",
      summary: "Tell me which org. Example: 'What's new on ICICI'.",
      payload: { reason: "missing_org" },
    };
  }
  const db = getDb();
  const q = `%${org.toLowerCase()}%`;

  const orgMatches = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(or(sql`LOWER(${organizations.name}) LIKE ${q}`, sql`LOWER(${organizations.shortName}) LIKE ${q}`))
    .limit(3);

  if (orgMatches.length === 0) {
    return {
      kind: "intel",
      summary: `No org matches "${org}". Try the official name (e.g. "Reserve Bank of India" or "RBI").`,
      payload: { org, powerMoves: [] },
    };
  }

  const orgIds = orgMatches.map(o => o.id);
  const moves = await db
    .select({
      id: powerMoves.id,
      type: powerMoves.type,
      headline: powerMoves.headline,
      occurredAt: powerMoves.occurredAt,
      primaryOrgId: powerMoves.primaryOrgId,
      primaryPersonId: powerMoves.primaryPersonId,
    })
    .from(powerMoves)
    .where(
      and(
        sql`${powerMoves.primaryOrgId} IN (${sql.join(orgIds.map(id => sql`${id}`), sql`, `)})`,
        eq(powerMoves.isPublished, true),
      ),
    )
    .orderBy(desc(powerMoves.occurredAt))
    .limit(10);

  if (moves.length === 0) {
    return {
      kind: "intel",
      summary: `Tracking ${orgMatches[0].name} but no power-moves recorded yet. The change-detection agent ships in a future phase.`,
      payload: { org, powerMoves: [] },
    };
  }

  const orgNameById = new Map(orgMatches.map(o => [o.id, o.name]));
  const summarised: PowerMoveSummary[] = moves.map(m => ({
    id: m.id,
    type: m.type,
    headline: m.headline,
    occurredAt: m.occurredAt,
    primaryOrgName: m.primaryOrgId ? orgNameById.get(m.primaryOrgId) ?? null : null,
    primaryPersonName: null, // populated in week 6 when we join persons
  }));
  return {
    kind: "intel",
    summary: `${moves.length} recent power-move${moves.length === 1 ? "" : "s"} on ${orgMatches[0].name}.`,
    payload: { org, powerMoves: summarised },
  };
}

// ─── addToWatchlist ──────────────────────────────────────────────────────────

async function addToWatchlistTool(target: string, ctx: DispatchContext): Promise<CommandResult> {
  if (!target.trim()) {
    return {
      kind: "error",
      summary: "Tell me what to watch. Example: 'Watch the new RBI Deputy Governor'.",
      payload: { reason: "missing_target" },
    };
  }
  const db = getDb();
  // Try to bind to a known person/org first; fall back to a free-text watch.
  const q = `%${target.toLowerCase()}%`;
  const [orgMatch] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(or(sql`LOWER(${organizations.name}) LIKE ${q}`, sql`LOWER(${organizations.shortName}) LIKE ${q}`))
    .limit(1);
  // Heuristic classification when no entity match: capitalized 1-3 word
  // phrases default to "role" (e.g. "the new RBI Deputy Governor"), short
  // lowercase phrases default to "sector" (e.g. "private banks"). This keeps
  // the summary copy honest — we never say "watching Sanjay Malhotra as a
  // sector" because Sanjay Malhotra resolves to "role" instead.
  let targetType: "person" | "organization" | "sector" | "role";
  let targetId: string | null = null;
  let targetLabel = target;
  if (orgMatch) {
    targetType = "organization";
    targetId = orgMatch.id;
    targetLabel = orgMatch.name;
  } else {
    const [personMatch] = await db
      .select({ id: persons.id, name: persons.name })
      .from(persons)
      .where(sql`LOWER(${persons.name}) LIKE ${q}`)
      .limit(1);
    if (personMatch) {
      targetType = "person";
      targetId = personMatch.id;
      targetLabel = personMatch.name;
    } else if (/^[a-z\s]+$/.test(target.trim()) && target.trim().split(/\s+/).length <= 3) {
      targetType = "sector";
    } else {
      targetType = "role";
    }
  }

  // Idempotent: if a watch with same (user, type, label) exists, return that
  // instead of creating a duplicate. Per WATCH-DEDUP issue in MAPS, we
  // enforce dedup at app level.
  const [existing] = await db
    .select({ id: watches.id })
    .from(watches)
    .where(
      and(
        eq(watches.userId, ctx.userId),
        eq(watches.targetType, targetType),
        eq(watches.targetLabel, targetLabel),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      kind: "watch_added",
      summary: `Already watching ${targetLabel}. You'll see updates in your daily digest.`,
      payload: { target: targetLabel, watchId: existing.id },
    };
  }

  const watchId = crypto.randomUUID();
  await db.insert(watches).values({
    id: watchId,
    userId: ctx.userId,
    targetType,
    targetId,
    targetLabel,
    isActive: true,
    notifyDigest: true,
    notifyPush: false,
  });
  const qualifier =
    targetType === "sector" ? " as a sector" :
    targetType === "role" ? " as a role" :
    "";
  return {
    kind: "watch_added",
    summary: `Watching ${targetLabel}${qualifier}. You'll see updates in your daily digest.`,
    payload: { target: targetLabel, watchId },
  };
}

// ─── whoOwns ─────────────────────────────────────────────────────────────────

async function whoOwnsTool(target: string, _ctx: DispatchContext): Promise<CommandResult> {
  if (!target.trim()) {
    return {
      kind: "error",
      summary: "Tell me which relationship. Example: 'Who owns the HDFC relationship'.",
      payload: { reason: "missing_target" },
    };
  }
  const db = getDb();
  const q = `%${target.toLowerCase()}%`;
  const matches = await db
    .select({
      personId: persons.id,
      personName: persons.name,
      ownerName: users.name,
      tier: ownership.tier,
    })
    .from(ownership)
    .innerJoin(persons, eq(ownership.personId, persons.id))
    .innerJoin(users, eq(ownership.ownerUserId, users.id))
    .where(sql`LOWER(${persons.name}) LIKE ${q}`)
    .limit(10);
  if (matches.length === 0) {
    return {
      kind: "owner",
      summary: `No one yet owns a relationship matching "${target}". Assign an owner from the contact's profile.`,
      payload: { target, matches: [] },
    };
  }
  const summary =
    matches.length === 1
      ? `${matches[0].ownerName} owns ${matches[0].personName} (${matches[0].tier}).`
      : `${matches.length} contacts match "${target}". Owners listed below.`;
  return {
    kind: "owner",
    summary,
    payload: {
      target,
      matches: matches.map(m => ({
        personId: m.personId,
        personName: m.personName,
        ownerName: m.ownerName ?? "(unknown)",
        tier: m.tier,
      })),
    },
  };
}

// ─── coverageGap ─────────────────────────────────────────────────────────────

async function coverageGapTool(sector: string, _ctx: DispatchContext): Promise<CommandResult> {
  if (!sector.trim()) {
    return {
      kind: "error",
      summary: "Tell me which sector. Example: 'Where are we weak in private banks'.",
      payload: { reason: "missing_sector" },
    };
  }
  // Map common sector phrases to org_type enum values.
  const sectorMap: Record<string, string[]> = {
    "private bank": ["private_bank"],
    "private banks": ["private_bank"],
    "psu bank": ["psu_bank"],
    "psu banks": ["psu_bank"],
    "public sector bank": ["psu_bank"],
    "public sector banks": ["psu_bank"],
    "regulator": ["regulator"],
    "regulators": ["regulator"],
    "nbfc": ["nbfc"],
    "nbfcs": ["nbfc"],
    "dfi": ["dfi"],
    "dfis": ["dfi"],
    "government": ["government"],
  };
  const types = sectorMap[sector.toLowerCase().trim()];
  if (!types) {
    return {
      kind: "gap",
      summary: `I don't recognise "${sector}" as a sector yet. Try "private banks", "PSU banks", "regulators", or "NBFCs".`,
      payload: { sector, covered: 0, gaps: [] },
    };
  }
  const db = getDb();
  // Pull all orgs of the given type(s) plus how many have at least one tracked
  // person via tenures. Orgs with 0 tracked persons = coverage gaps.
  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
    })
    .from(organizations)
    .where(sql`${organizations.type} IN (${sql.join(types.map(t => sql`${t}`), sql`, `)})`);

  const gaps: string[] = [];
  let covered = 0;
  for (const o of orgs) {
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(persons)
      .where(eq(persons.currentOrgId, o.id));
    if (Number(count) === 0) gaps.push(o.name);
    else covered++;
  }
  return {
    kind: "gap",
    summary:
      gaps.length === 0
        ? `Full coverage in ${sector} (${covered} orgs all have at least one tracked contact).`
        : `${gaps.length} of ${orgs.length} ${sector} have no tracked contact yet.`,
    payload: { sector, covered, gaps },
  };
}

// Re-export for downstream tests
export type { IntentTool };
