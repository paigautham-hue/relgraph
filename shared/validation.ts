import { z } from "zod";
import {
  USER_ROLES, ORG_TYPES, TENURE_SOURCES, RELATIONSHIP_TYPES, STRENGTH_LABELS,
  EXTERNAL_CONNECTION_TYPES, INTERACTION_TYPES, PARTICIPANT_ROLES, INPUT_METHODS,
  REFLECTION_CATEGORIES, CONFIDENCE_LEVELS, VISIBILITY_LEVELS, PERSON_CATEGORIES,
  EXTERNAL_CONNECTION_SOURCES, ORG_HIERARCHY_TYPES,
} from './enums';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PASSWORD_MIN_LENGTH } from './constants';
import {
  CONTACT_IMPORT_HEADERS,
  CONTACT_IMPORT_MAX_ROWS,
  CONTACT_IMPORT_TEMPLATE_VERSION,
  CONTACT_IMPORT_FIELD_LIBRARY,
  DEFAULT_CONTACT_IMPORT_CATEGORY_FIELDS,
} from './contactImport';

// Auth
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(PASSWORD_MIN_LENGTH),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH),
});

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(PASSWORD_MIN_LENGTH),
});

export const requestAccessSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255).optional(),
  note: z.string().max(1000).optional(),
});

export const setupPasswordSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(PASSWORD_MIN_LENGTH),
});

// Pagination
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Person
export const createPersonSchema = z.object({
  name: z.string().min(1).max(255),
  currentTitle: z.string().max(255).optional(),
  currentOrgId: z.string().uuid().optional(),
  category: z.enum(PERSON_CATEGORIES).optional(),
  photoUrl: z.string().url().optional(),
  isTracked: z.boolean().default(true),
});

export const updatePersonSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  currentTitle: z.string().max(255).optional(),
  currentOrgId: z.string().uuid().nullable().optional(),
  category: z.enum(PERSON_CATEGORIES).optional(),
  photoUrl: z.string().url().nullable().optional(),
  isTracked: z.boolean().optional(),
});

export const personFilterSchema = paginationSchema.extend({
  search: z.string().optional(),
  domainId: z.string().uuid().optional(),
  category: z.enum(PERSON_CATEGORIES).optional(),
  isTracked: z.boolean().optional(),
  orgId: z.string().uuid().optional(),
});

// Organization
export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  shortName: z.string().max(50).optional(),
  domainId: z.string().uuid(),
  type: z.enum(ORG_TYPES).optional(),
  city: z.string().max(255).optional(),
  website: z.string().url().optional(),
});

export const updateOrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  shortName: z.string().max(50).optional(),
  domainId: z.string().uuid().optional(),
  type: z.enum(ORG_TYPES).optional(),
  city: z.string().max(255).optional(),
  website: z.string().url().nullable().optional(),
});

// Tenure
export const createTenureSchema = z.object({
  personId: z.string().uuid(),
  orgId: z.string().uuid(),
  title: z.string().min(1).max(255),
  department: z.string().max(255).optional(),
  startDate: z.string(), // ISO date string
  endDate: z.string().optional(),
  isCurrent: z.boolean().default(false),
  source: z.enum(TENURE_SOURCES).default('manual'),
  sourceUrl: z.string().url().optional(),
});

// Relationship
export const createRelationshipSchema = z.object({
  sourcePersonId: z.string().uuid(),
  targetPersonId: z.string().uuid(),
  type: z.enum(RELATIONSHIP_TYPES),
  strengthScore: z.number().int().min(0).max(100).default(50),
  strengthLabel: z.enum(STRENGTH_LABELS).default('acquaintance'),
  originStory: z.string().optional(),
});

// External Connection
export const createExternalConnectionSchema = z.object({
  personAId: z.string().uuid(),
  personBId: z.string().uuid(),
  type: z.enum(EXTERNAL_CONNECTION_TYPES),
  description: z.string().optional(),
  source: z.enum(EXTERNAL_CONNECTION_SOURCES).default('team_input'),
});

// Interaction
export const createInteractionSchema = z.object({
  type: z.enum(INTERACTION_TYPES),
  occurredAt: z.string(), // ISO datetime
  location: z.string().max(255).optional(),
  summary: z.string().min(1),
  depthScore: z.number().int().min(1).max(10).optional(),
  rawInputText: z.string().optional(),
  inputMethod: z.enum(INPUT_METHODS).default('form'),
  participants: z.array(z.object({
    personId: z.string().uuid(),
    role: z.enum(PARTICIPANT_ROLES).default('attendee'),
  })).min(1),
});

// Reflection
export const createReflectionSchema = z.object({
  personId: z.string().uuid(),
  category: z.enum(REFLECTION_CATEGORIES),
  content: z.string().min(1),
  confidenceLevel: z.enum(CONFIDENCE_LEVELS).default('medium'),
  confidenceBasis: z.string().optional(),
  linkedInteractionId: z.string().uuid().optional(),
  linkedOpportunity: z.string().optional(),
  inputMethod: z.enum(INPUT_METHODS).default('text'),
  visibilityLevel: z.enum(VISIBILITY_LEVELS).default('contributor'),
});

// Person Intel
export const createIntelSchema = z.object({
  personId: z.string().uuid(),
  fieldName: z.string().min(1).max(100),
  fieldValue: z.string().min(1),
  inputMethod: z.enum(INPUT_METHODS).default('text'),
  sourceUrl: z.string().url().optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
});

// Person Notes
export const createNoteSchema = z.object({
  personId: z.string().uuid(),
  content: z.string().min(1),
  inputMethod: z.enum(INPUT_METHODS).default('text'),
  visibilityLevel: z.enum(VISIBILITY_LEVELS).default('contributor'),
});

// Org Hierarchy
export const createOrgHierarchySchema = z.object({
  parentOrgId: z.string().uuid(),
  childOrgId: z.string().uuid(),
  relationshipType: z.enum(ORG_HIERARCHY_TYPES),
});

// Audit filter
export const auditFilterSchema = paginationSchema.extend({
  userId: z.string().uuid().optional(),
  actionType: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  email: z.string().optional(),
  outcome: z.string().optional(),
  authOnly: z.boolean().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Admin user management
export const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.enum(USER_ROLES),
  password: z.string().min(PASSWORD_MIN_LENGTH),
  domainIds: z.array(z.string().uuid()).default([]),
});

export const updateUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
  domainIds: z.array(z.string().uuid()).optional(),
});

export const allowlistEmailSchema = z.object({
  email: z.string().email(),
  role: z.enum(USER_ROLES).default('viewer'),
});

export const removeAllowlistEmailSchema = z.object({
  email: z.string().email(),
});

export const bulkAccessRequestApprovalSchema = z.object({
  requests: z.array(z.object({
    email: z.string().email(),
    role: z.enum(USER_ROLES),
  })).min(1),
});

export const bulkAccessRequestDenialSchema = z.object({
  emails: z.array(z.string().email()).min(1),
});

// Contact import
export const contactImportSourceSchema = z.enum(['csv', 'xlsx', 'xls']);

export const contactImportRowSchema = z.object({
  rowNumber: z.number().int().min(2),
  name: z.string().max(255).optional(),
  currentTitle: z.string().max(255).optional(),
  organizationName: z.string().max(255).optional(),
  domainName: z.string().max(255).optional(),
  category: z.enum(PERSON_CATEGORIES).optional(),
  isTracked: z.union([z.boolean(), z.string(), z.number()]).optional(),
  photoUrl: z.string().optional(),
}).catchall(z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]));

export const validateContactImportSchema = z.object({
  fileName: z.string().min(1).max(255),
  source: contactImportSourceSchema,
  templateVersion: z.string().min(1).default(CONTACT_IMPORT_TEMPLATE_VERSION),
  headers: z.array(z.string()).min(1).max(CONTACT_IMPORT_HEADERS.length + 5),
  rows: z.array(contactImportRowSchema).min(1).max(CONTACT_IMPORT_MAX_ROWS),
});

export const commitContactImportSchema = z.object({
  fileName: z.string().min(1).max(255),
  templateVersion: z.string().min(1),
  rows: z.array(
    z.object({
      rowNumber: z.number().int().min(2),
      name: z.string().min(1).max(255),
      currentTitle: z.string().max(255).optional(),
      organizationId: z.string().uuid().nullable().optional(),
      category: z.enum(PERSON_CATEGORIES).optional(),
      isTracked: z.boolean(),
      photoUrl: z.string().url().optional(),
      extraFieldValues: z.record(z.string(), z.string()).default({}),
    }),
  ).min(1).max(CONTACT_IMPORT_MAX_ROWS),
  validationDigest: z.string().min(8),
});

const contactImportExtraFieldKeys = Object.keys(CONTACT_IMPORT_FIELD_LIBRARY) as [
  keyof typeof CONTACT_IMPORT_FIELD_LIBRARY,
  ...(keyof typeof CONTACT_IMPORT_FIELD_LIBRARY)[],
];

export const contactImportTemplateFieldConfigSchema = z.object({
  category: z.enum(PERSON_CATEGORIES),
  enabledFieldKeys: z.array(z.enum(contactImportExtraFieldKeys)).max(contactImportExtraFieldKeys.length),
});

export const updateContactImportTemplateConfigSchema = z.object({
  templateVersion: z.string().min(1).default(CONTACT_IMPORT_TEMPLATE_VERSION),
  categories: z.array(contactImportTemplateFieldConfigSchema)
    .min(1)
    .default(DEFAULT_CONTACT_IMPORT_CATEGORY_FIELDS),
});

export const contactImportHistoryFilterSchema = paginationSchema.extend({
  status: z.enum(["validated", "blocked", "imported"]).optional(),
  category: z.enum(PERSON_CATEGORIES).optional(),
  source: contactImportSourceSchema.optional(),
  createdByUserId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export const contactImportRunLookupSchema = z.object({
  id: z.string().uuid(),
});

export const resolveContactImportDuplicatesSchema = z.object({
  validationDigest: z.string().min(8),
  rows: z.array(
    z.object({
      rowNumber: z.number().int().min(2),
      selectedExistingPersonId: z.string().uuid().optional(),
      resolution: z.enum(["skip_existing", "import_anyway"]),
    }),
  ).min(1),
});

// Apify
export const apifyCapabilitySchema = z.enum(["discovery", "enrichment", "monitoring"]);
export const apifyTargetTypeSchema = z.enum(["search", "organization", "person"]);
export const apifyRunStatusSchema = z.enum(["ready", "running", "succeeded", "failed"]);

const apifyJsonRecordSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

export const createApifySourceConfigSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  capability: apifyCapabilitySchema,
  targetType: apifyTargetTypeSchema,
  actorId: z.string().min(1).max(255).optional(),
  actorTaskId: z.string().min(1).max(255).optional(),
  defaultInput: apifyJsonRecordSchema.default({}),
  fieldMappings: z.record(z.string(), z.string()).default({}),
  watchFields: z.array(z.string().min(1).max(100)).default([]),
  runFrequencyCron: z.string().max(100).optional(),
  targetOrganizationId: z.string().uuid().nullable().optional(),
  targetPersonId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
}).refine((value) => Boolean(value.actorId || value.actorTaskId), {
  message: "Either actorId or actorTaskId is required",
  path: ["actorId"],
});

export const updateApifySourceConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  capability: apifyCapabilitySchema.optional(),
  targetType: apifyTargetTypeSchema.optional(),
  actorId: z.string().min(1).max(255).nullable().optional(),
  actorTaskId: z.string().min(1).max(255).nullable().optional(),
  defaultInput: apifyJsonRecordSchema.optional(),
  fieldMappings: z.record(z.string(), z.string()).optional(),
  watchFields: z.array(z.string().min(1).max(100)).optional(),
  runFrequencyCron: z.string().max(100).nullable().optional(),
  targetOrganizationId: z.string().uuid().nullable().optional(),
  targetPersonId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const apifySourceFilterSchema = paginationSchema.extend({
  capability: apifyCapabilitySchema.optional(),
  targetType: apifyTargetTypeSchema.optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
});

export const runApifySourceSchema = z.object({
  sourceConfigId: z.string().uuid().optional(),
  actorId: z.string().min(1).max(255).optional(),
  actorTaskId: z.string().min(1).max(255).optional(),
  capability: apifyCapabilitySchema.optional(),
  targetType: apifyTargetTypeSchema.optional(),
  query: z.string().max(255).optional(),
  startUrls: z.array(z.string().url()).max(20).optional(),
  targetOrganizationId: z.string().uuid().optional(),
  targetPersonId: z.string().uuid().optional(),
  maxItems: z.number().int().min(1).max(200).default(25),
  inputOverrides: apifyJsonRecordSchema.default({}),
}).refine((value) => Boolean(value.sourceConfigId || value.actorId || value.actorTaskId), {
  message: "Provide a saved source config or an actor/task identifier",
  path: ["sourceConfigId"],
});

export const apifyRunFilterSchema = paginationSchema.extend({
  sourceConfigId: z.string().uuid().optional(),
  capability: apifyCapabilitySchema.optional(),
  status: apifyRunStatusSchema.optional(),
  targetPersonId: z.string().uuid().optional(),
  targetOrganizationId: z.string().uuid().optional(),
});

export const apifyRunLookupSchema = z.object({
  id: z.string().uuid(),
});

export const applyApifyDiscoverySchema = z.object({
  runId: z.string().uuid(),
  domainId: z.string().uuid(),
  selectedItemIndexes: z.array(z.number().int().min(0)).min(1),
  defaultCategory: z.enum(PERSON_CATEGORIES).optional(),
});

export const applyApifyEnrichmentSchema = z.object({
  runId: z.string().uuid(),
  personId: z.string().uuid(),
  selectedFields: z.array(z.string().min(1)).default([]),
});

export const syncApifyMonitoringSchema = z.object({
  sourceConfigId: z.string().uuid(),
  createAlerts: z.boolean().default(true),
});

export const bankLeadershipRoleTypeSchema = z.enum([
  "chairman",
  "managing_director",
  "chairman_and_managing_director",
  "executive_director",
  "other",
]);

export const bankLeadershipSourceTypeSchema = z.enum([
  "official_bank_website",
  "stock_exchange_filing",
  "regulator_publication",
  "government_release",
  "annual_report",
  "press_release",
  "secondary_reference",
  "unknown",
]);

export const bankLeadershipValidationStatusSchema = z.enum([
  "pending_review",
  "official_source_confirmed",
  "secondary_source_only",
  "conflict_detected",
  "rejected",
  "imported",
]);

export const bankLeadershipRecordFilterSchema = paginationSchema.extend({
  organizationId: z.string().uuid().optional(),
  apifyRunId: z.string().uuid().optional(),
  sourceConfigId: z.string().uuid().optional(),
  validationStatus: bankLeadershipValidationStatusSchema.optional(),
  roleType: bankLeadershipRoleTypeSchema.optional(),
  onlyUnimported: z.boolean().optional(),
  search: z.string().optional(),
});

export const createBankLeadershipRecordSchema = z.object({
  organizationId: z.string().uuid().optional(),
  sourceConfigId: z.string().uuid().optional(),
  bankName: z.string().min(1).max(255).optional(),
  personName: z.string().min(1).max(255),
  title: z.string().min(1).max(255),
  sourceUrl: z.string().url(),
  sourceType: bankLeadershipSourceTypeSchema.default("official_bank_website"),
  sourcePublishedDate: z.string().nullable().optional(),
  sourceExcerpt: z.string().max(5000).optional(),
  sourcePayload: apifyJsonRecordSchema.default({}),
  confidenceLevel: z.enum(CONFIDENCE_LEVELS).optional(),
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
  validationStatus: bankLeadershipValidationStatusSchema.optional(),
  validationNotes: z.string().max(5000).nullable().optional(),
  validationEvidence: z.array(z.object({
    label: z.string().min(1).max(255),
    url: z.string().url().optional(),
    note: z.string().max(1000).optional(),
  })).optional(),
}).refine((value) => Boolean(value.organizationId || value.bankName), {
  message: "Provide an organization or bank name",
  path: ["organizationId"],
});

export const updateBankLeadershipRecordSchema = z.object({
  id: z.string().uuid(),
  validationStatus: bankLeadershipValidationStatusSchema.optional(),
  confidenceLevel: z.enum(CONFIDENCE_LEVELS).optional(),
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
  validationNotes: z.string().max(5000).nullable().optional(),
  validationEvidence: z.array(z.object({
    label: z.string().min(1).max(255),
    url: z.string().url().optional(),
    note: z.string().max(1000).optional(),
  })).optional(),
  sourceType: bankLeadershipSourceTypeSchema.optional(),
  sourcePublishedDate: z.string().nullable().optional(),
});

export const importBankLeadershipRecordSchema = z.object({
  id: z.string().uuid(),
  domainId: z.string().uuid().optional(),
  createOrganizationIfMissing: z.boolean().default(true),
  personNameOverride: z.string().min(1).max(255).optional(),
  titleOverride: z.string().min(1).max(255).optional(),
  startDate: z.string().optional(),
  markAsCurrent: z.boolean().default(true),
});

// Domain
export const createDomainSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isActive: z.boolean().default(true),
});

export const updateDomainSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isActive: z.boolean().optional(),
});

// Alert
export const updateAlertSchema = z.object({
  id: z.string().uuid(),
  isDismissed: z.boolean().optional(),
  actionTaken: z.boolean().optional(),
  actionNote: z.string().optional(),
});
