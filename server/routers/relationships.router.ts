import { z } from "zod";
import { router, domainScopedProcedure, contributorProcedure } from "../_core/trpc";
import { createRelationshipSchema, paginationSchema } from "@shared/validation";
import { recordEntityProvenance } from "../services/provenance-helpers";
import { RELATIONSHIP_TYPES, STRENGTH_LABELS } from "@shared/enums";
import { getDb } from "../db";
import { relationships, persons } from "../db/schema";
import { eq, and, or, desc, asc, count, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { logAudit, getClientIp } from "../middleware/audit";
import { TRPCError } from "@trpc/server";

const relationshipFilterSchema = paginationSchema.extend({
  personId: z.string().uuid().optional(),
  type: z.enum(RELATIONSHIP_TYPES).optional(),
  strengthLabel: z.enum(STRENGTH_LABELS).optional(),
});

const updateRelationshipSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(RELATIONSHIP_TYPES).optional(),
  strengthScore: z.number().int().min(0).max(100).optional(),
  strengthLabel: z.enum(STRENGTH_LABELS).optional(),
  originStory: z.string().nullable().optional(),
});

export const relationshipsRouter = router({
  list: domainScopedProcedure
    .input(relationshipFilterSchema)
    .query(async ({ input }) => {
      const db = getDb();
      const { page, pageSize, personId, type, strengthLabel, sortOrder } = input;
      const offset = (page - 1) * pageSize;

      const sourcePerson = alias(persons, "sourcePerson");
      const targetPerson = alias(persons, "targetPerson");

      const conditions: ReturnType<typeof eq>[] = [];
      if (personId) {
        conditions.push(
          or(
            eq(relationships.sourcePersonId, personId),
            eq(relationships.targetPersonId, personId),
          )!,
        );
      }
      if (type) conditions.push(eq(relationships.type, type));
      if (strengthLabel) conditions.push(eq(relationships.strengthLabel, strengthLabel));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [data, [{ total }]] = await Promise.all([
        db
          .select({
            id: relationships.id,
            sourcePersonId: relationships.sourcePersonId,
            targetPersonId: relationships.targetPersonId,
            type: relationships.type,
            strengthScore: relationships.strengthScore,
            strengthLabel: relationships.strengthLabel,
            lastInteractionAt: relationships.lastInteractionAt,
            originStory: relationships.originStory,
            createdAt: relationships.createdAt,
            sourcePersonName: sourcePerson.name,
            targetPersonName: targetPerson.name,
          })
          .from(relationships)
          .leftJoin(sourcePerson, eq(relationships.sourcePersonId, sourcePerson.id))
          .leftJoin(targetPerson, eq(relationships.targetPersonId, targetPerson.id))
          .where(where)
          .orderBy(
            sortOrder === "asc"
              ? asc(relationships.strengthScore)
              : desc(relationships.strengthScore),
          )
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(relationships).where(where),
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
    .query(async ({ input }) => {
      const db = getDb();
      const sourcePerson = alias(persons, "sourcePerson");
      const targetPerson = alias(persons, "targetPerson");

      const [rel] = await db
        .select({
          id: relationships.id,
          sourcePersonId: relationships.sourcePersonId,
          targetPersonId: relationships.targetPersonId,
          type: relationships.type,
          strengthScore: relationships.strengthScore,
          strengthLabel: relationships.strengthLabel,
          lastInteractionAt: relationships.lastInteractionAt,
          originStory: relationships.originStory,
          createdAt: relationships.createdAt,
          updatedAt: relationships.updatedAt,
          sourcePersonName: sourcePerson.name,
          targetPersonName: targetPerson.name,
        })
        .from(relationships)
        .leftJoin(sourcePerson, eq(relationships.sourcePersonId, sourcePerson.id))
        .leftJoin(targetPerson, eq(relationships.targetPersonId, targetPerson.id))
        .where(eq(relationships.id, input.id))
        .limit(1);

      if (!rel) throw new TRPCError({ code: "NOT_FOUND", message: "Relationship not found" });
      return rel;
    }),

  create: contributorProcedure
    .input(createRelationshipSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const relationshipId = crypto.randomUUID();

      await db
        .insert(relationships)
        .values({
          ...input,
          id: relationshipId,
          declaredBy: ctx.user.id,
        });

      const [rel] = await db
        .select()
        .from(relationships)
        .where(eq(relationships.id, relationshipId))
        .limit(1);

      if (!rel) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Relationship could not be created" });
      }

      logAudit({
        userId: ctx.user.id,
        actionType: "create",
        entityType: "relationship",
        entityId: rel.id,
        newValue: JSON.stringify(input),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      await recordEntityProvenance({
        entityType: "relationship",
        entityId: rel.id,
        capturedBy: ctx.user.id,
        inputMethod: null,
        sourceLabel: input.type,
      });

      return rel;
    }),

  update: contributorProcedure
    .input(updateRelationshipSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { id, ...data } = input;

      const [existing] = await db
        .select()
        .from(relationships)
        .where(eq(relationships.id, id))
        .limit(1);
      if (!existing)
        throw new TRPCError({ code: "NOT_FOUND", message: "Relationship not found" });

      await db
        .update(relationships)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(relationships.id, id));

      const [updated] = await db
        .select()
        .from(relationships)
        .where(eq(relationships.id, id))
        .limit(1);

      if (!updated) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Relationship could not be updated" });
      }

      logAudit({
        userId: ctx.user.id,
        actionType: "update",
        entityType: "relationship",
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
        .from(relationships)
        .where(eq(relationships.id, input.id))
        .limit(1);
      if (!existing)
        throw new TRPCError({ code: "NOT_FOUND", message: "Relationship not found" });

      await db.delete(relationships).where(eq(relationships.id, input.id));

      logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "relationship",
        entityId: input.id,
        oldValue: JSON.stringify(existing),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return { success: true };
    }),
});
