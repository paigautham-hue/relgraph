import { z } from "zod";
import { router, domainScopedProcedure, contributorProcedure } from "../_core/trpc";
import { createNoteSchema, paginationSchema } from "@shared/validation";
import { VISIBILITY_LEVELS, ROLE_LEVELS, type UserRole } from "@shared/enums";
import { getDb } from "../db";
import { personNotes, persons, users } from "../db/schema";
import { eq, and, desc, asc, count, inArray } from "drizzle-orm";
import { logAudit, getClientIp } from "../middleware/audit";
import { TRPCError } from "@trpc/server";

const noteFilterSchema = paginationSchema.extend({
  personId: z.string().uuid().optional(),
});

const updateNoteSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1).optional(),
  visibilityLevel: z.enum(VISIBILITY_LEVELS).optional(),
});

function getVisibleLevels(role: string): string[] {
  const userLevel = ROLE_LEVELS[role as UserRole] ?? 0;
  const levels: string[] = [];
  if (userLevel >= ROLE_LEVELS.contributor) levels.push("contributor");
  if (userLevel >= ROLE_LEVELS.manager) levels.push("manager");
  if (userLevel >= ROLE_LEVELS.admin) levels.push("admin");
  return levels;
}

export const notesRouter = router({
  list: domainScopedProcedure.input(noteFilterSchema).query(async ({ input, ctx }) => {
    const db = getDb();
    const { page, pageSize, personId, sortOrder } = input;
    const offset = (page - 1) * pageSize;

    const visibleLevels = getVisibleLevels(ctx.user.role);

    const conditions: ReturnType<typeof eq>[] = [];
    if (personId) conditions.push(eq(personNotes.personId, personId));
    conditions.push(inArray(personNotes.visibilityLevel, visibleLevels as any));

    const where = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: personNotes.id,
          personId: personNotes.personId,
          content: personNotes.content,
          visibilityLevel: personNotes.visibilityLevel,
          inputMethod: personNotes.inputMethod,
          createdAt: personNotes.createdAt,
          personName: persons.name,
          authorName: users.name,
        })
        .from(personNotes)
        .leftJoin(persons, eq(personNotes.personId, persons.id))
        .leftJoin(users, eq(personNotes.authorId, users.id))
        .where(where)
        .orderBy(sortOrder === "asc" ? asc(personNotes.createdAt) : desc(personNotes.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(personNotes).where(where),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }),

  getById: domainScopedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const [note] = await db
        .select({
          id: personNotes.id,
          personId: personNotes.personId,
          content: personNotes.content,
          visibilityLevel: personNotes.visibilityLevel,
          inputMethod: personNotes.inputMethod,
          createdAt: personNotes.createdAt,
          updatedAt: personNotes.updatedAt,
          personName: persons.name,
          authorName: users.name,
        })
        .from(personNotes)
        .leftJoin(persons, eq(personNotes.personId, persons.id))
        .leftJoin(users, eq(personNotes.authorId, users.id))
        .where(eq(personNotes.id, input.id))
        .limit(1);

      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

      const visibleLevels = getVisibleLevels(ctx.user.role);
      if (!visibleLevels.includes(note.visibilityLevel)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this note" });
      }

      return note;
    }),

  create: contributorProcedure.input(createNoteSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    await db
      .insert(personNotes)
      .values({
        ...input,
        authorId: ctx.user.id,
      });

    const [note] = await db
      .select()
      .from(personNotes)
      .where(eq(personNotes.authorId, ctx.user.id))
      .orderBy(desc(personNotes.createdAt))
      .limit(1);

    if (!note) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create note" });
    }

    logAudit({
      userId: ctx.user.id,
      actionType: "create",
      entityType: "note",
      entityId: note.id,
      newValue: JSON.stringify(input),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    return note;
  }),

  update: contributorProcedure.input(updateNoteSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const { id, ...data } = input;

    const [existing] = await db
      .select()
      .from(personNotes)
      .where(eq(personNotes.id, id))
      .limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

    await db
      .update(personNotes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(personNotes.id, id));

    const [updated] = await db
      .select()
      .from(personNotes)
      .where(eq(personNotes.id, id))
      .limit(1);

    if (!updated) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update note" });
    }

    logAudit({
      userId: ctx.user.id,
      actionType: "update",
      entityType: "note",
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
        .from(personNotes)
        .where(eq(personNotes.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

      await db.delete(personNotes).where(eq(personNotes.id, input.id));

      logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "note",
        entityId: input.id,
        oldValue: JSON.stringify(existing),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return { success: true };
    }),
});
