import { createHash } from "node:crypto";
import { z } from "zod";
import { router, domainScopedProcedure, contributorProcedure } from "../_core/trpc";
import {
  createPersonSchema,
  updatePersonSchema,
  personFilterSchema,
  validateContactImportSchema,
  commitContactImportSchema,
} from "@shared/validation";
import { getDb } from "../db";
import { persons, organizations, domains } from "../db/schema";
import { eq, and, like, desc, asc, count, inArray } from "drizzle-orm";
import { logAudit, getClientIp } from "../middleware/audit";
import { TRPCError } from "@trpc/server";
import {
  getContactImportTemplatePayload,
  validateContactImport,
} from "../services/contact-import.service";
import { ROLE_LEVELS, type UserRole } from "@shared/enums";

function assertCanImport(role: string) {
  const userLevel = ROLE_LEVELS[role as UserRole] ?? 0;
  if (userLevel < ROLE_LEVELS.contributor) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to import contacts.",
    });
  }
}

function buildCommittedRowsDigest(args: {
  fileName: string;
  templateVersion: string;
  rows: Array<{
    rowNumber: number;
    name: string;
    currentTitle?: string;
    organizationId?: string | null;
    category?: string;
    isTracked: boolean;
    photoUrl?: string;
  }>;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        fileName: args.fileName,
        templateVersion: args.templateVersion,
        rows: args.rows,
      }),
    )
    .digest("hex");
}

export const personsRouter = router({
  list: domainScopedProcedure.input(personFilterSchema).query(async ({ input, ctx }) => {
    const db = getDb();
    const { page, pageSize, search, domainId, category, isTracked, orgId, sortOrder } = input;
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (ctx.accessibleDomainIds) {
      conditions.push(inArray(organizations.domainId, ctx.accessibleDomainIds));
    }
    if (search) {
      conditions.push(like(persons.name, `%${search}%`));
    }
    if (category) {
      conditions.push(eq(persons.category, category));
    }
    if (isTracked !== undefined) {
      conditions.push(eq(persons.isTracked, isTracked));
    }
    if (orgId) {
      conditions.push(eq(persons.currentOrgId, orgId));
    }
    if (domainId) {
      conditions.push(eq(organizations.domainId, domainId));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: persons.id,
          name: persons.name,
          currentTitle: persons.currentTitle,
          category: persons.category,
          photoUrl: persons.photoUrl,
          isTracked: persons.isTracked,
          currentOrgId: persons.currentOrgId,
          createdAt: persons.createdAt,
          orgName: organizations.name,
          domainName: domains.name,
          domainColor: domains.color,
        })
        .from(persons)
        .leftJoin(organizations, eq(persons.currentOrgId, organizations.id))
        .leftJoin(domains, eq(organizations.domainId, domains.id))
        .where(where)
        .orderBy(sortOrder === "asc" ? asc(persons.name) : desc(persons.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(persons)
        .leftJoin(organizations, eq(persons.currentOrgId, organizations.id))
        .where(where),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }),

  getImportTemplate: domainScopedProcedure.query(async ({ ctx }) => {
    assertCanImport(ctx.user.role);
    const db = getDb();
    const template = getContactImportTemplatePayload();

    const accessibleOrganizations = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        domainId: organizations.domainId,
        domainName: domains.name,
      })
      .from(organizations)
      .innerJoin(domains, eq(organizations.domainId, domains.id))
      .where(
        ctx.accessibleDomainIds && ctx.accessibleDomainIds.length > 0
          ? inArray(organizations.domainId, ctx.accessibleDomainIds)
          : undefined,
      )
      .orderBy(asc(domains.name), asc(organizations.name));

    return {
      ...template,
      organizationReference: accessibleOrganizations,
    };
  }),

  validateImport: domainScopedProcedure
    .input(validateContactImportSchema)
    .mutation(async ({ input, ctx }) => {
      assertCanImport(ctx.user.role);

      const result = await validateContactImport({
        fileName: input.fileName,
        source: input.source,
        templateVersion: input.templateVersion,
        headers: input.headers,
        rows: input.rows,
        accessibleDomainIds: ctx.accessibleDomainIds,
      });

      await logAudit({
        userId: ctx.user.id,
        actionType: "search",
        entityType: "person",
        fieldName: "auth.contact_import_validation",
        newValue: JSON.stringify({
          fileName: input.fileName,
          rowCount: input.rows.length,
          validRows: result.validRows.length,
          issueCount: result.issues.length,
          verdict: result.review.verdict,
          score: result.review.score,
          ok: result.ok,
        }),
        inputMethod: "system",
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
        metadata: {
          source: input.source,
          templateVersion: input.templateVersion,
        },
      });

      return result;
    }),

  commitImport: domainScopedProcedure
    .input(commitContactImportSchema)
    .mutation(async ({ input, ctx }) => {
      assertCanImport(ctx.user.role);

      const db = getDb();
      const expectedDigest = buildCommittedRowsDigest({
        fileName: input.fileName,
        templateVersion: input.templateVersion,
        rows: input.rows,
      });

      if (input.validationDigest !== expectedDigest) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The import preview is out of date. Please validate the file again before importing.",
        });
      }

      const created = await db
        .insert(persons)
        .values(
          input.rows.map((row) => ({
            name: row.name,
            currentTitle: row.currentTitle,
            currentOrgId: row.organizationId ?? null,
            category: row.category,
            photoUrl: row.photoUrl,
            isTracked: row.isTracked,
            createdBy: ctx.user.id,
          })),
        )
        .returning();

      await logAudit({
        userId: ctx.user.id,
        actionType: "create",
        entityType: "person",
        fieldName: "auth.contact_import_commit",
        newValue: JSON.stringify({
          fileName: input.fileName,
          importedCount: created.length,
          validationDigest: input.validationDigest,
        }),
        inputMethod: "system",
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return {
        success: true,
        count: created.length,
        data: created,
      };
    }),

  getById: domainScopedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [person] = await db
        .select({
          id: persons.id,
          name: persons.name,
          currentTitle: persons.currentTitle,
          currentOrgId: persons.currentOrgId,
          category: persons.category,
          photoUrl: persons.photoUrl,
          isTracked: persons.isTracked,
          createdAt: persons.createdAt,
          updatedAt: persons.updatedAt,
          orgName: organizations.name,
          domainName: domains.name,
          domainColor: domains.color,
        })
        .from(persons)
        .leftJoin(organizations, eq(persons.currentOrgId, organizations.id))
        .leftJoin(domains, eq(organizations.domainId, domains.id))
        .where(eq(persons.id, input.id))
        .limit(1);

      if (!person) throw new TRPCError({ code: "NOT_FOUND", message: "Person not found" });
      return person;
    }),

  create: contributorProcedure.input(createPersonSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const [person] = await db
      .insert(persons)
      .values({
        ...input,
        createdBy: ctx.user.id,
      })
      .returning();

    logAudit({
      userId: ctx.user.id,
      actionType: "create",
      entityType: "person",
      entityId: person.id,
      newValue: JSON.stringify(input),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    return person;
  }),

  update: contributorProcedure.input(updatePersonSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const { id, ...data } = input;

    const [existing] = await db.select().from(persons).where(eq(persons.id, id)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Person not found" });

    const [updated] = await db
      .update(persons)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(persons.id, id))
      .returning();

    logAudit({
      userId: ctx.user.id,
      actionType: "update",
      entityType: "person",
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
      const [existing] = await db.select().from(persons).where(eq(persons.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Person not found" });

      await db.delete(persons).where(eq(persons.id, input.id));

      logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "person",
        entityId: input.id,
        oldValue: JSON.stringify(existing),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return { success: true };
    }),
});
