import { createHash } from "crypto";
import { z } from "zod";
import { eq, and, like, desc, asc, count, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, domainScopedProcedure, contributorProcedure } from "../_core/trpc";
import {
  createPersonSchema,
  updatePersonSchema,
  personFilterSchema,
  validateContactImportSchema,
  commitContactImportSchema,
  contactImportHistoryFilterSchema,
  contactImportRunLookupSchema,
  resolveContactImportDuplicatesSchema,
} from "@shared/validation";
import { ROLE_LEVELS, type UserRole } from "@shared/enums";
import { getDb } from "../db";
import { persons, organizations, domains, personIntel, personNotes } from "../db/schema";
import { logAudit, getClientIp } from "../middleware/audit";
import {
  buildContactImportArtifacts,
  buildContactImportRunPayload,
  getContactImportHistoryEntry,
  getContactImportTemplateFieldLibrary,
  getContactImportTemplatePayload,
  getStoredContactImportTemplateConfig,
  listContactImportHistory,
  validateContactImport,
} from "../services/contact-import.service";

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
    const template = await getContactImportTemplatePayload();

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
      fieldLibrary: getContactImportTemplateFieldLibrary(),
      organizationReference: accessibleOrganizations,
    };
  }),

  getImportTemplateConfig: domainScopedProcedure.query(async ({ ctx }) => {
    assertCanImport(ctx.user.role);
    const stored = await getStoredContactImportTemplateConfig();
    return {
      ...stored,
      fieldLibrary: getContactImportTemplateFieldLibrary(),
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
          duplicateCount: result.duplicateRows.length,
          verdict: result.review.verdict,
          score: result.review.score,
          ok: result.ok,
          blockedByDuplicates: result.blockedByDuplicates,
        }),
        inputMethod: "system",
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
        metadata: {
          source: input.source,
          templateVersion: input.templateVersion,
        },
      });

      await logAudit({
        userId: ctx.user.id,
        actionType: "create",
        entityType: "person",
        fieldName: "contact_import.run",
        newValue: JSON.stringify(
          buildContactImportRunPayload({
            status: result.blockedByDuplicates || result.issues.some((issue) => issue.severity === "error")
              ? "blocked"
              : "validated",
            category: result.validRows[0]?.category,
            result,
          }),
        ),
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

  resolveImportDuplicates: domainScopedProcedure
    .input(resolveContactImportDuplicatesSchema)
    .mutation(async ({ input, ctx }) => {
      assertCanImport(ctx.user.role);

      const history = await listContactImportHistory({ page: 1, pageSize: 200 });
      const matchingRun = history.data.find((entry) => entry.validationDigest === input.validationDigest);

      if (!matchingRun) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "The import preview could not be found. Please validate the file again.",
        });
      }

      const historyEntry = await getContactImportHistoryEntry(matchingRun.id);
      const errorReport = historyEntry?.errorReport ?? [];
      const unresolvedRows = errorReport
        .filter((issue) => issue.message.includes("Likely duplicate contacts were found in RelGraph"))
        .map((issue) => issue.rowNumber);

      const requestedRows = new Set(input.rows.map((row: (typeof input.rows)[number]) => row.rowNumber));
      const missingRows = unresolvedRows.filter((rowNumber) => !requestedRows.has(rowNumber));
      if (missingRows.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Every duplicate row must be resolved before import can continue.",
        });
      }

      await logAudit({
        userId: ctx.user.id,
        actionType: "update",
        entityType: "person",
        fieldName: "contact_import.duplicate_resolution",
        newValue: JSON.stringify({
          validationDigest: input.validationDigest,
          rows: input.rows,
        }),
        inputMethod: "system",
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return {
        success: true,
        validationDigest: input.validationDigest,
        resolvedRows: input.rows.length,
      };
    }),

  listImportHistory: domainScopedProcedure
    .input(contactImportHistoryFilterSchema.optional())
    .query(async ({ input, ctx }) => {
      assertCanImport(ctx.user.role);

      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      return listContactImportHistory({
        page,
        pageSize,
        status: input?.status,
        category: input?.category,
        source: input?.source,
        createdByUserId: input?.createdByUserId,
        search: input?.search,
      });
    }),

  getImportHistoryEntry: domainScopedProcedure
    .input(contactImportRunLookupSchema)
    .query(async ({ input, ctx }) => {
      assertCanImport(ctx.user.role);

      const entry = await getContactImportHistoryEntry(input.id);
      if (!entry) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Import history entry not found." });
      }
      return entry;
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

      const revalidated = await validateContactImport({
        fileName: input.fileName,
        source: "csv",
        templateVersion: input.templateVersion,
        headers: (await getContactImportTemplatePayload()).headers,
        rows: input.rows.map((row: (typeof input.rows)[number]) => ({
          rowNumber: row.rowNumber,
          name: row.name,
          currentTitle: row.currentTitle,
          category: row.category,
          isTracked: row.isTracked,
          photoUrl: row.photoUrl,
          organizationName: undefined,
          domainName: undefined,
        })),
        accessibleDomainIds: ctx.accessibleDomainIds,
      }).catch(() => null);

      if (revalidated && revalidated.duplicateRows.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Likely duplicates still need resolution before import can continue.",
        });
      }

      const rowsToInsert = input.rows.map((row: (typeof input.rows)[number]) => ({
        id: crypto.randomUUID(),
        name: row.name,
        currentTitle: row.currentTitle,
        currentOrgId: row.organizationId ?? null,
        category: row.category,
        photoUrl: row.photoUrl,
        isTracked: row.isTracked,
        createdBy: ctx.user.id,
      }));

      await db.insert(persons).values(rowsToInsert);

      const created = await db
        .select()
        .from(persons)
        .where(inArray(persons.id, rowsToInsert.map((row: (typeof rowsToInsert)[number]) => row.id)));

      const createdById = new Map<string, (typeof created)[number]>(
        created.map((person) => [person.id, person] as const),
      );
      const createdByRowNumber = new Map<number, (typeof created)[number]>();
      rowsToInsert.forEach((row: (typeof rowsToInsert)[number], index: number) => {
        const rowNumber = input.rows[index]?.rowNumber;
        const createdPerson = createdById.get(row.id);
        if (typeof rowNumber === "number" && createdPerson) {
          createdByRowNumber.set(rowNumber, createdPerson);
        }
      });

      const intelPayload = input.rows.flatMap((row: (typeof input.rows)[number]) => {
        const createdPerson = createdByRowNumber.get(row.rowNumber);
        if (!createdPerson) return [];
        const artifacts = buildContactImportArtifacts({
          row: {
            rowNumber: row.rowNumber,
            name: row.name,
            currentTitle: row.currentTitle,
            organizationId: row.organizationId ?? null,
            category: row.category,
            isTracked: row.isTracked,
            photoUrl: row.photoUrl,
            organizationName: undefined,
            domainName: undefined,
            extraFieldValues: row.extraFieldValues,
            duplicateCandidates: [],
          },
          personId: createdPerson.id,
          userId: ctx.user.id,
        });
        return artifacts.intelEntries;
      });

      const notePayload = input.rows.flatMap((row: (typeof input.rows)[number]) => {
        const createdPerson = createdByRowNumber.get(row.rowNumber);
        if (!createdPerson) return [];
        const artifacts = buildContactImportArtifacts({
          row: {
            rowNumber: row.rowNumber,
            name: row.name,
            currentTitle: row.currentTitle,
            organizationId: row.organizationId ?? null,
            category: row.category,
            isTracked: row.isTracked,
            photoUrl: row.photoUrl,
            organizationName: undefined,
            domainName: undefined,
            extraFieldValues: row.extraFieldValues,
            duplicateCandidates: [],
          },
          personId: createdPerson.id,
          userId: ctx.user.id,
        });
        return artifacts.noteEntry ? [artifacts.noteEntry] : [];
      });

      if (intelPayload.length > 0) {
        await db.insert(personIntel).values(intelPayload);
      }
      if (notePayload.length > 0) {
        await db.insert(personNotes).values(notePayload);
      }

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

      await logAudit({
        userId: ctx.user.id,
        actionType: "create",
        entityType: "person",
        fieldName: "contact_import.run",
        newValue: JSON.stringify({
          status: "imported",
          fileName: input.fileName,
          source: "csv",
          templateVersion: input.templateVersion,
          rowCount: input.rows.length,
          validRowCount: input.rows.length,
          issueCount: 0,
          duplicateCount: 0,
          aiVerdict: "pass",
          validationDigest: input.validationDigest,
          category: input.rows[0]?.category,
          summary: `${created.length} contacts were imported successfully.`,
          errorReport: [],
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
    const personId = crypto.randomUUID();

    await db
      .insert(persons)
      .values({
        ...input,
        id: personId,
        createdBy: ctx.user.id,
      });

    const [person] = await db.select().from(persons).where(eq(persons.id, personId)).limit(1);
    if (!person) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Person could not be created" });
    }

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

    await db
      .update(persons)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(persons.id, id));

    const [updated] = await db.select().from(persons).where(eq(persons.id, id)).limit(1);
    if (!updated) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Person could not be updated" });
    }

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
