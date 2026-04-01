import { z } from "zod";
import { router, domainScopedProcedure, contributorProcedure } from "../_core/trpc";
import { createInteractionSchema, paginationSchema } from "@shared/validation";
import { INTERACTION_TYPES } from "@shared/enums";
import { getDb } from "../db";
import { interactions, interactionParticipants, persons } from "../db/schema";
import { eq, and, desc, asc, count, inArray, sql } from "drizzle-orm";
import { logAudit, getClientIp } from "../middleware/audit";
import { TRPCError } from "@trpc/server";

const interactionFilterSchema = paginationSchema.extend({
  personId: z.string().uuid().optional(),
  type: z.enum(INTERACTION_TYPES).optional(),
});

const updateInteractionSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(INTERACTION_TYPES).optional(),
  occurredAt: z.string().optional(),
  location: z.string().max(255).nullable().optional(),
  summary: z.string().min(1).optional(),
  depthScore: z.number().int().min(1).max(10).nullable().optional(),
});

export const interactionsRouter = router({
  list: domainScopedProcedure.input(interactionFilterSchema).query(async ({ input }) => {
    const db = getDb();
    const { page, pageSize, personId, type, sortOrder } = input;
    const offset = (page - 1) * pageSize;

    // If filtering by personId, find interaction IDs that have this person as participant
    let interactionIds: string[] | null = null;
    if (personId) {
      const participantRows = await db
        .select({ interactionId: interactionParticipants.interactionId })
        .from(interactionParticipants)
        .where(eq(interactionParticipants.personId, personId));
      interactionIds = participantRows.map((r) => r.interactionId);
      if (interactionIds.length === 0) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
      }
    }

    const conditions: ReturnType<typeof eq>[] = [];
    if (interactionIds) {
      conditions.push(inArray(interactions.id, interactionIds));
    }
    if (type) {
      conditions.push(eq(interactions.type, type));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: interactions.id,
          type: interactions.type,
          occurredAt: interactions.occurredAt,
          location: interactions.location,
          summary: interactions.summary,
          depthScore: interactions.depthScore,
          inputMethod: interactions.inputMethod,
          createdAt: interactions.createdAt,
        })
        .from(interactions)
        .where(where)
        .orderBy(sortOrder === "asc" ? asc(interactions.occurredAt) : desc(interactions.occurredAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(interactions).where(where),
    ]);

    // Fetch participants for each interaction
    if (data.length > 0) {
      const ids = data.map((d) => d.id);
      const participantsData = await db
        .select({
          interactionId: interactionParticipants.interactionId,
          personId: interactionParticipants.personId,
          role: interactionParticipants.role,
          personName: persons.name,
        })
        .from(interactionParticipants)
        .leftJoin(persons, eq(interactionParticipants.personId, persons.id))
        .where(inArray(interactionParticipants.interactionId, ids));

      const participantMap = new Map<string, typeof participantsData>();
      for (const p of participantsData) {
        const list = participantMap.get(p.interactionId) ?? [];
        list.push(p);
        participantMap.set(p.interactionId, list);
      }

      return {
        data: data.map((d) => ({
          ...d,
          participants: participantMap.get(d.id) ?? [],
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }

    return {
      data: data.map((d) => ({ ...d, participants: [] })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }),

  getById: domainScopedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [interaction] = await db
        .select()
        .from(interactions)
        .where(eq(interactions.id, input.id))
        .limit(1);

      if (!interaction)
        throw new TRPCError({ code: "NOT_FOUND", message: "Interaction not found" });

      const participantsData = await db
        .select({
          id: interactionParticipants.id,
          personId: interactionParticipants.personId,
          role: interactionParticipants.role,
          personName: persons.name,
        })
        .from(interactionParticipants)
        .leftJoin(persons, eq(interactionParticipants.personId, persons.id))
        .where(eq(interactionParticipants.interactionId, input.id));

      return { ...interaction, participants: participantsData };
    }),

  create: contributorProcedure.input(createInteractionSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const { participants, ...interactionData } = input;

    const [interaction] = await db
      .insert(interactions)
      .values({
        ...interactionData,
        occurredAt: new Date(interactionData.occurredAt),
        createdBy: ctx.user.id,
      })
      .returning();

    // Insert participants
    if (participants.length > 0) {
      await db.insert(interactionParticipants).values(
        participants.map((p) => ({
          interactionId: interaction.id,
          personId: p.personId,
          role: p.role,
        })),
      );
    }

    logAudit({
      userId: ctx.user.id,
      actionType: "create",
      entityType: "interaction",
      entityId: interaction.id,
      newValue: JSON.stringify(input),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    return interaction;
  }),

  update: contributorProcedure.input(updateInteractionSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const { id, ...data } = input;

    const [existing] = await db
      .select()
      .from(interactions)
      .where(eq(interactions.id, id))
      .limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Interaction not found" });

    const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (data.occurredAt) {
      updateData.occurredAt = new Date(data.occurredAt);
    }

    const [updated] = await db
      .update(interactions)
      .set(updateData)
      .where(eq(interactions.id, id))
      .returning();

    logAudit({
      userId: ctx.user.id,
      actionType: "update",
      entityType: "interaction",
      entityId: id,
      oldValue: JSON.stringify(existing),
      newValue: JSON.stringify(data),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    return updated;
  }),

  delete: contributorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(interactions)
        .where(eq(interactions.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Interaction not found" });

      // Participants are cascade-deleted via FK
      await db.delete(interactions).where(eq(interactions.id, input.id));

      logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "interaction",
        entityId: input.id,
        oldValue: JSON.stringify(existing),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return { success: true };
    }),
});
