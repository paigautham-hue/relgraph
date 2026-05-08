import {
  mysqlTable,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  int,
  double,
  json,
  mysqlEnum,
  index,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  USER_ROLES,
  ORG_TYPES,
  TENURE_SOURCES,
  RELATIONSHIP_TYPES,
  STRENGTH_LABELS,
  EXTERNAL_CONNECTION_TYPES,
  INTERACTION_TYPES,
  PARTICIPANT_ROLES,
  INPUT_METHODS,
  REFLECTION_CATEGORIES,
  CONFIDENCE_LEVELS,
  VISIBILITY_LEVELS,
  AUDIT_ACTION_TYPES,
  AUDIT_ENTITY_TYPES,
  ALERT_TYPES,
  ALERT_SEVERITIES,
  CHAT_ROLES,
  ORG_HIERARCHY_TYPES,
  PERSON_CATEGORIES,
  EXTERNAL_CONNECTION_SOURCES,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_LINK_TARGET_TYPES,
  WATCH_TARGET_TYPES,
  OWNERSHIP_TIERS,
  PROVENANCE_SOURCE_TYPES,
  PROVENANCE_ENTITY_TYPES,
  AGENT_NAMES,
  AGENT_RUN_STATUSES,
  POWER_MOVE_TYPES,
  DIGEST_CARD_TYPES,
  VISIBILITY_SCOPES,
} from '../../shared/enums';

const pgTable = mysqlTable as typeof mysqlTable;
const pgEnum = (_enumName: string, values: readonly [string, ...string[]]) => {
  return (columnName: string) => mysqlEnum(columnName, values as [string, ...string[]]);
};
const integer = int;
const jsonb = json;
const real = double;
const uuid = (name: string) => {
  const column = varchar(name, { length: 36 }) as ReturnType<typeof varchar> & {
    defaultRandom: () => ReturnType<typeof varchar>;
  };
  column.defaultRandom = () => column.$defaultFn(() => crypto.randomUUID()) as ReturnType<typeof varchar>;
  return column;
};

// ─── Enums ───────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', USER_ROLES);
export const orgTypeEnum = pgEnum('org_type', ORG_TYPES);
export const orgHierarchyTypeEnum = pgEnum('org_hierarchy_type', ORG_HIERARCHY_TYPES);
export const personCategoryEnum = pgEnum('person_category', PERSON_CATEGORIES);
export const tenureSourceEnum = pgEnum('tenure_source', TENURE_SOURCES);
export const relationshipTypeEnum = pgEnum('relationship_type', RELATIONSHIP_TYPES);
export const strengthLabelEnum = pgEnum('strength_label', STRENGTH_LABELS);
export const externalConnectionTypeEnum = pgEnum('external_connection_type', EXTERNAL_CONNECTION_TYPES);
export const externalConnectionSourceEnum = pgEnum('external_connection_source', EXTERNAL_CONNECTION_SOURCES);
export const interactionTypeEnum = pgEnum('interaction_type', INTERACTION_TYPES);
export const participantRoleEnum = pgEnum('participant_role', PARTICIPANT_ROLES);
export const inputMethodEnum = pgEnum('input_method', INPUT_METHODS);
export const reflectionCategoryEnum = pgEnum('reflection_category', REFLECTION_CATEGORIES);
export const confidenceLevelEnum = pgEnum('confidence_level', CONFIDENCE_LEVELS);
export const visibilityLevelEnum = pgEnum('visibility_level', VISIBILITY_LEVELS);
export const auditActionTypeEnum = pgEnum('audit_action_type', AUDIT_ACTION_TYPES);
export const auditEntityTypeEnum = pgEnum('audit_entity_type', AUDIT_ENTITY_TYPES);
export const alertTypeEnum = pgEnum('alert_type', ALERT_TYPES);
export const alertSeverityEnum = pgEnum('alert_severity', ALERT_SEVERITIES);
export const chatRoleEnum = pgEnum('chat_role', CHAT_ROLES);
export const bankLeadershipRoleEnum = pgEnum('bank_leadership_role', ['chairman', 'managing_director', 'chairman_and_managing_director', 'executive_director', 'other']);
export const bankLeadershipSourceTypeEnum = pgEnum('bank_leadership_source_type', ['official_bank_website', 'stock_exchange_filing', 'regulator_publication', 'government_release', 'annual_report', 'press_release', 'secondary_reference', 'unknown']);
export const bankLeadershipValidationStatusEnum = pgEnum('bank_leadership_validation_status', ['pending_review', 'official_source_confirmed', 'secondary_source_only', 'conflict_detected', 'rejected', 'imported']);

// Strategic spine enums (week 1)
export const opportunityStageEnum = pgEnum('opportunity_stage', OPPORTUNITY_STAGES);
export const opportunityLinkTargetTypeEnum = pgEnum('opportunity_link_target_type', OPPORTUNITY_LINK_TARGET_TYPES);
export const watchTargetTypeEnum = pgEnum('watch_target_type', WATCH_TARGET_TYPES);
export const ownershipTierEnum = pgEnum('ownership_tier', OWNERSHIP_TIERS);
export const provenanceSourceTypeEnum = pgEnum('provenance_source_type', PROVENANCE_SOURCE_TYPES);
export const provenanceEntityTypeEnum = pgEnum('provenance_entity_type', PROVENANCE_ENTITY_TYPES);
export const agentNameEnum = pgEnum('agent_name', AGENT_NAMES);
export const agentRunStatusEnum = pgEnum('agent_run_status', AGENT_RUN_STATUSES);
export const powerMoveTypeEnum = pgEnum('power_move_type', POWER_MOVE_TYPES);
export const digestCardTypeEnum = pgEnum('digest_card_type', DIGEST_CARD_TYPES);
export const visibilityScopeEnum = pgEnum('visibility_scope', VISIBILITY_SCOPES);

// ─── 1. Users ────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash'),
  role: userRoleEnum('role').notNull().default('viewer'),
  avatarUrl: text('avatar_url'),
  isActive: boolean('is_active').notNull().default(true),
  lastActiveAt: timestamp('last_active_at'),
  openId: varchar('open_id', { length: 64 }).unique(),
  loginMethod: varchar('login_method', { length: 64 }),
  invitedBy: uuid('invited_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 2. Domains ──────────────────────────────────────────────────────────────

export const domains = pgTable('domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  parentDomainId: uuid('parent_domain_id'),
  description: text('description'),
  trackedRoleTypes: jsonb('tracked_role_types'),
  color: varchar('color', { length: 7 }),
  scraperConfig: jsonb('scraper_config'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 3. User Domain Access ───────────────────────────────────────────────────

export const userDomainAccess = pgTable('user_domain_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  domainId: uuid('domain_id').notNull().references(() => domains.id),
  grantedAt: timestamp('granted_at').notNull().defaultNow(),
});

// ─── 4. Organizations ────────────────────────────────────────────────────────

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  shortName: varchar('short_name', { length: 50 }),
  domainId: uuid('domain_id').notNull().references(() => domains.id),
  type: orgTypeEnum('type'),
  city: varchar('city', { length: 255 }),
  website: text('website'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 5. Org Hierarchy ────────────────────────────────────────────────────────

export const orgHierarchy = pgTable('org_hierarchy', {
  id: uuid('id').primaryKey().defaultRandom(),
  parentOrgId: uuid('parent_org_id').notNull().references(() => organizations.id),
  childOrgId: uuid('child_org_id').notNull().references(() => organizations.id),
  relationshipType: orgHierarchyTypeEnum('relationship_type').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── 6. Persons ──────────────────────────────────────────────────────────────

export const persons = pgTable('persons', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  currentTitle: varchar('current_title', { length: 255 }),
  currentOrgId: uuid('current_org_id').references(() => organizations.id),
  category: personCategoryEnum('category'),
  photoUrl: text('photo_url'),
  isTracked: boolean('is_tracked').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 7. Tenures ──────────────────────────────────────────────────────────────

export const tenures = pgTable('tenures', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => persons.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  title: varchar('title', { length: 255 }).notNull(),
  department: varchar('department', { length: 255 }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  isCurrent: boolean('is_current').notNull().default(false),
  source: tenureSourceEnum('source').notNull().default('manual'),
  sourceUrl: text('source_url'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 8. Relationships ────────────────────────────────────────────────────────

export const relationships = pgTable('relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourcePersonId: uuid('source_person_id').notNull().references(() => persons.id),
  targetPersonId: uuid('target_person_id').notNull().references(() => persons.id),
  type: relationshipTypeEnum('type').notNull(),
  strengthScore: integer('strength_score').notNull().default(50),
  strengthLabel: strengthLabelEnum('strength_label').notNull().default('acquaintance'),
  lastInteractionAt: timestamp('last_interaction_at'),
  originStory: text('origin_story'),
  declaredBy: uuid('declared_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 9. External Connections ─────────────────────────────────────────────────

export const externalConnections = pgTable('external_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  personAId: uuid('person_a_id').notNull().references(() => persons.id),
  personBId: uuid('person_b_id').notNull().references(() => persons.id),
  type: externalConnectionTypeEnum('type').notNull(),
  description: text('description'),
  discoveredBy: uuid('discovered_by').references(() => users.id),
  source: externalConnectionSourceEnum('source').notNull().default('team_input'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 10. Interactions ────────────────────────────────────────────────────────

export const interactions = pgTable('interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: interactionTypeEnum('type').notNull(),
  occurredAt: timestamp('occurred_at').notNull(),
  location: varchar('location', { length: 255 }),
  summary: text('summary').notNull(),
  depthScore: integer('depth_score'),
  rawInputText: text('raw_input_text'),
  inputMethod: inputMethodEnum('input_method'),
  voiceRecordingUrl: text('voice_recording_url'),
  voiceTranscript: text('voice_transcript'),
  aiExtractedSummary: text('ai_extracted_summary'),
  aiExtractedActions: jsonb('ai_extracted_actions'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 11. Interaction Participants ────────────────────────────────────────────

export const interactionParticipants = pgTable('interaction_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  interactionId: uuid('interaction_id').notNull().references(() => interactions.id),
  personId: uuid('person_id').notNull().references(() => persons.id),
  role: participantRoleEnum('role').notNull().default('attendee'),
});

// ─── 12. Reflections ─────────────────────────────────────────────────────────

export const reflections = pgTable('reflections', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => persons.id),
  authorId: uuid('author_id').notNull().references(() => users.id),
  category: reflectionCategoryEnum('category').notNull(),
  content: text('content').notNull(),
  confidenceLevel: confidenceLevelEnum('confidence_level').notNull().default('medium'),
  confidenceBasis: text('confidence_basis'),
  linkedInteractionId: uuid('linked_interaction_id').references(() => interactions.id),
  linkedOpportunity: text('linked_opportunity'),
  inputMethod: inputMethodEnum('input_method'),
  voiceRecordingUrl: text('voice_recording_url'),
  voiceTranscript: text('voice_transcript'),
  visibilityLevel: visibilityLevelEnum('visibility_level').notNull().default('contributor'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 13. Person Notes ────────────────────────────────────────────────────────

export const personNotes = pgTable('person_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => persons.id),
  authorId: uuid('author_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  inputMethod: inputMethodEnum('input_method'),
  voiceRecordingUrl: text('voice_recording_url'),
  voiceTranscript: text('voice_transcript'),
  visibilityLevel: visibilityLevelEnum('visibility_level').notNull().default('contributor'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 14. Person Intel ────────────────────────────────────────────────────────

export const personIntel = pgTable('person_intel', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => persons.id),
  fieldName: varchar('field_name', { length: 100 }).notNull(),
  fieldValue: text('field_value').notNull(),
  contributedBy: uuid('contributed_by').notNull().references(() => users.id),
  inputMethod: inputMethodEnum('input_method'),
  sourceUrl: text('source_url'),
  voiceRecordingUrl: text('voice_recording_url'),
  voiceTranscript: text('voice_transcript'),
  aiConfidence: real('ai_confidence'),
  lastVerifiedAt: timestamp('last_verified_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 15. Audit Log ───────────────────────────────────────────────────────────

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    actionType: auditActionTypeEnum('action_type').notNull(),
    entityType: auditEntityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id'),
    fieldName: varchar('field_name', { length: 255 }),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    inputMethod: inputMethodEnum('input_method'),
    voiceRecordingUrl: text('voice_recording_url'),
    rawInputText: text('raw_input_text'),
    sourceUrl: text('source_url'),
    aiConfidence: real('ai_confidence'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    sessionDurationS: integer('session_duration_s'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('audit_entity_idx').on(table.entityType, table.entityId, table.createdAt),
    index('audit_user_idx').on(table.userId, table.createdAt),
    index('audit_action_idx').on(table.actionType, table.createdAt),
  ],
);

// ─── 16. Alerts ──────────────────────────────────────────────────────────────

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: alertTypeEnum('type').notNull(),
  severity: alertSeverityEnum('severity').notNull().default('info'),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  personId: uuid('person_id').references(() => persons.id),
  orgId: uuid('org_id').references(() => organizations.id),
  suggestedAction: text('suggested_action'),
  isDismissed: boolean('is_dismissed').notNull().default(false),
  dismissedBy: uuid('dismissed_by').references(() => users.id),
  actionTaken: boolean('action_taken').notNull().default(false),
  actionNote: text('action_note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 17. Briefings ───────────────────────────────────────────────────────────

export const briefings = pgTable('briefings', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => persons.id),
  generatedBy: uuid('generated_by').notNull().references(() => users.id),
  content: text('content').notNull(),
  sourcesUsed: jsonb('sources_used'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── 18. Chat Conversations ──────────────────────────────────────────────────

export const chatConversations = pgTable('chat_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  title: varchar('title', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 19. Chat Messages ──────────────────────────────────────────────────────

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => chatConversations.id),
  role: chatRoleEnum('role').notNull(),
  content: text('content').notNull(),
  inputMethod: inputMethodEnum('input_method'),
  toolCalls: jsonb('tool_calls'),
  sourcesUsed: jsonb('sources_used'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── 20. Apify Source Configs ────────────────────────────────────────────────

export const apifySourceConfigs = pgTable('apify_source_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  capability: varchar('capability', { length: 32 }).notNull(),
  targetType: varchar('target_type', { length: 32 }).notNull(),
  actorId: varchar('actor_id', { length: 255 }),
  actorTaskId: varchar('actor_task_id', { length: 255 }),
  defaultInput: jsonb('default_input').notNull().default({}),
  fieldMappings: jsonb('field_mappings').notNull().default({}),
  watchFields: jsonb('watch_fields').notNull().default([]),
  runFrequencyCron: varchar('run_frequency_cron', { length: 100 }),
  targetOrganizationId: uuid('target_organization_id').references(() => organizations.id),
  targetPersonId: uuid('target_person_id').references(() => persons.id),
  createdBy: uuid('created_by').references(() => users.id),
  isActive: boolean('is_active').notNull().default(true),
  lastRunAt: timestamp('last_run_at'),
  lastRunStatus: varchar('last_run_status', { length: 32 }),
  lastRunSummary: text('last_run_summary'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('apify_source_capability_idx').on(table.capability, table.isActive),
  index('apify_source_target_org_idx').on(table.targetOrganizationId),
  index('apify_source_target_person_idx').on(table.targetPersonId),
]);

// ─── 21. Apify Runs ──────────────────────────────────────────────────────────

export const apifyRuns = pgTable('apify_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceConfigId: uuid('source_config_id').references(() => apifySourceConfigs.id),
  capability: varchar('capability', { length: 32 }).notNull(),
  targetType: varchar('target_type', { length: 32 }).notNull(),
  actorId: varchar('actor_id', { length: 255 }),
  actorTaskId: varchar('actor_task_id', { length: 255 }),
  apifyRunId: varchar('apify_run_id', { length: 255 }),
  datasetId: varchar('dataset_id', { length: 255 }),
  status: varchar('status', { length: 32 }).notNull().default('ready'),
  query: varchar('query', { length: 255 }),
  startUrls: jsonb('start_urls').notNull().default([]),
  inputPayload: jsonb('input_payload').notNull().default({}),
  outputPreview: jsonb('output_preview').notNull().default([]),
  normalizedOutput: jsonb('normalized_output').notNull().default([]),
  detectedChanges: jsonb('detected_changes').notNull().default([]),
  summary: text('summary'),
  itemCount: integer('item_count').notNull().default(0),
  errorMessage: text('error_message'),
  sourceSnapshot: jsonb('source_snapshot').notNull().default({}),
  executionMeta: jsonb('execution_meta').notNull().default({}),
  targetOrganizationId: uuid('target_organization_id').references(() => organizations.id),
  targetPersonId: uuid('target_person_id').references(() => persons.id),
  initiatedBy: uuid('initiated_by').references(() => users.id),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('apify_run_source_idx').on(table.sourceConfigId, table.createdAt),
  index('apify_run_status_idx').on(table.status, table.createdAt),
  index('apify_run_target_org_idx').on(table.targetOrganizationId, table.createdAt),
  index('apify_run_target_person_idx').on(table.targetPersonId, table.createdAt),
]);

export const bankLeadershipRecords = pgTable('bank_leadership_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  apifyRunId: uuid('apify_run_id').references(() => apifyRuns.id),
  sourceConfigId: uuid('source_config_id').references(() => apifySourceConfigs.id),
  roleType: bankLeadershipRoleEnum('role_type').notNull().default('other'),
  personName: varchar('person_name', { length: 255 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  normalizedTitle: varchar('normalized_title', { length: 255 }),
  bankName: varchar('bank_name', { length: 255 }).notNull(),
  bankType: orgTypeEnum('bank_type'),
  sourceUrl: text('source_url').notNull(),
  sourceDomain: varchar('source_domain', { length: 255 }),
  sourceType: bankLeadershipSourceTypeEnum('source_type').notNull().default('unknown'),
  sourcePublishedDate: date('source_published_date'),
  sourceObservedAt: timestamp('source_observed_at').notNull().defaultNow(),
  sourceExcerpt: text('source_excerpt'),
  sourcePayload: jsonb('source_payload').notNull().default({}),
  validationStatus: bankLeadershipValidationStatusEnum('validation_status').notNull().default('pending_review'),
  confidenceLevel: confidenceLevelEnum('confidence_level').notNull().default('medium'),
  confidenceScore: real('confidence_score'),
  validationNotes: text('validation_notes'),
  validationEvidence: jsonb('validation_evidence').notNull().default([]),
  isImported: boolean('is_imported').notNull().default(false),
  importedPersonId: uuid('imported_person_id').references(() => persons.id),
  importedTenureId: uuid('imported_tenure_id').references(() => tenures.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('bank_leadership_org_idx').on(table.organizationId, table.validationStatus, table.createdAt),
  index('bank_leadership_run_idx').on(table.apifyRunId, table.createdAt),
  index('bank_leadership_source_idx').on(table.sourceConfigId, table.roleType, table.createdAt),
]);

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  inviter: one(users, {
    fields: [users.invitedBy],
    references: [users.id],
    relationName: 'inviter',
  }),
  invitedUsers: many(users, { relationName: 'inviter' }),
  domainAccess: many(userDomainAccess),
  createdPersons: many(persons),
  interactions: many(interactions),
  reflections: many(reflections),
  personNotes: many(personNotes),
  personIntel: many(personIntel),
  auditLogs: many(auditLog),
  briefings: many(briefings),
  chatConversations: many(chatConversations),
  relationships: many(relationships),
  externalConnections: many(externalConnections),
  dismissedAlerts: many(alerts),
  apifySourceConfigs: many(apifySourceConfigs),
  apifyRuns: many(apifyRuns),
  bankLeadershipRecords: many(bankLeadershipRecords),
  // Strategic spine inverse relations (week 1)
  ownedOpportunities: many(opportunities, { relationName: 'opportunityOwner' }),
  createdOpportunities: many(opportunities, { relationName: 'opportunityCreator' }),
  watches: many(watches),
  ownedRelationships: many(ownership, { relationName: 'ownershipOwner' }),
  assignedOwnerships: many(ownership, { relationName: 'ownershipAssigner' }),
  capturedProvenance: many(provenance, { relationName: 'provenanceCapturer' }),
  verifiedProvenance: many(provenance, { relationName: 'provenanceVerifier' }),
  digestCards: many(digestCards),
  agentRunsScoped: many(agentRuns, { relationName: 'agentRunScopeUser' }),
  agentRunsTriggered: many(agentRuns, { relationName: 'agentRunTriggerUser' }),
  agentSchedulesUpdated: many(agentSchedules),
}));

export const domainsRelations = relations(domains, ({ one, many }) => ({
  parentDomain: one(domains, {
    fields: [domains.parentDomainId],
    references: [domains.id],
    relationName: 'domainParent',
  }),
  childDomains: many(domains, { relationName: 'domainParent' }),
  organizations: many(organizations),
  userAccess: many(userDomainAccess),
  // Strategic spine inverse relations (week 1)
  opportunities: many(opportunities),
}));

export const userDomainAccessRelations = relations(userDomainAccess, ({ one }) => ({
  user: one(users, {
    fields: [userDomainAccess.userId],
    references: [users.id],
  }),
  domain: one(domains, {
    fields: [userDomainAccess.domainId],
    references: [domains.id],
  }),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  domain: one(domains, {
    fields: [organizations.domainId],
    references: [domains.id],
  }),
  parentHierarchies: many(orgHierarchy, { relationName: 'childOrg' }),
  childHierarchies: many(orgHierarchy, { relationName: 'parentOrg' }),
  persons: many(persons),
  tenures: many(tenures),
  alerts: many(alerts),
  apifySourceConfigs: many(apifySourceConfigs),
  apifyRuns: many(apifyRuns),
  bankLeadershipRecords: many(bankLeadershipRecords),
  // Strategic spine inverse relations (week 1)
  digestCardsRelated: many(digestCards),
  powerMovesPrimary: many(powerMoves, { relationName: 'powerMovePrimaryOrg' }),
  powerMovesFrom: many(powerMoves, { relationName: 'powerMoveFromOrg' }),
  powerMovesTo: many(powerMoves, { relationName: 'powerMoveToOrg' }),
}));

export const orgHierarchyRelations = relations(orgHierarchy, ({ one }) => ({
  parentOrg: one(organizations, {
    fields: [orgHierarchy.parentOrgId],
    references: [organizations.id],
    relationName: 'parentOrg',
  }),
  childOrg: one(organizations, {
    fields: [orgHierarchy.childOrgId],
    references: [organizations.id],
    relationName: 'childOrg',
  }),
}));

export const personsRelations = relations(persons, ({ one, many }) => ({
  currentOrg: one(organizations, {
    fields: [persons.currentOrgId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [persons.createdBy],
    references: [users.id],
  }),
  tenures: many(tenures),
  sourceRelationships: many(relationships, { relationName: 'sourcePerson' }),
  targetRelationships: many(relationships, { relationName: 'targetPerson' }),
  externalConnectionsA: many(externalConnections, { relationName: 'personA' }),
  externalConnectionsB: many(externalConnections, { relationName: 'personB' }),
  participations: many(interactionParticipants),
  reflections: many(reflections),
  notes: many(personNotes),
  intel: many(personIntel),
  alerts: many(alerts),
  briefings: many(briefings),
  apifySourceConfigs: many(apifySourceConfigs),
  apifyRuns: many(apifyRuns),
  importedBankLeadershipRecords: many(bankLeadershipRecords),
  // Strategic spine inverse relations (week 1)
  ownership: many(ownership),
  digestCardsRelated: many(digestCards),
  powerMovesPrimary: many(powerMoves),
}));

export const tenuresRelations = relations(tenures, ({ one, many }) => ({
  person: one(persons, {
    fields: [tenures.personId],
    references: [persons.id],
  }),
  organization: one(organizations, {
    fields: [tenures.orgId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [tenures.createdBy],
    references: [users.id],
  }),
  importedBankLeadershipRecords: many(bankLeadershipRecords),
}));

export const relationshipsRelations = relations(relationships, ({ one }) => ({
  sourcePerson: one(persons, {
    fields: [relationships.sourcePersonId],
    references: [persons.id],
    relationName: 'sourcePerson',
  }),
  targetPerson: one(persons, {
    fields: [relationships.targetPersonId],
    references: [persons.id],
    relationName: 'targetPerson',
  }),
  declaredByUser: one(users, {
    fields: [relationships.declaredBy],
    references: [users.id],
  }),
}));

export const externalConnectionsRelations = relations(externalConnections, ({ one }) => ({
  personA: one(persons, {
    fields: [externalConnections.personAId],
    references: [persons.id],
    relationName: 'personA',
  }),
  personB: one(persons, {
    fields: [externalConnections.personBId],
    references: [persons.id],
    relationName: 'personB',
  }),
  discoveredByUser: one(users, {
    fields: [externalConnections.discoveredBy],
    references: [users.id],
  }),
}));

export const interactionsRelations = relations(interactions, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [interactions.createdBy],
    references: [users.id],
  }),
  participants: many(interactionParticipants),
  reflections: many(reflections),
}));

export const interactionParticipantsRelations = relations(interactionParticipants, ({ one }) => ({
  interaction: one(interactions, {
    fields: [interactionParticipants.interactionId],
    references: [interactions.id],
  }),
  person: one(persons, {
    fields: [interactionParticipants.personId],
    references: [persons.id],
  }),
}));

export const reflectionsRelations = relations(reflections, ({ one }) => ({
  person: one(persons, {
    fields: [reflections.personId],
    references: [persons.id],
  }),
  author: one(users, {
    fields: [reflections.authorId],
    references: [users.id],
  }),
  linkedInteraction: one(interactions, {
    fields: [reflections.linkedInteractionId],
    references: [interactions.id],
  }),
}));

export const personNotesRelations = relations(personNotes, ({ one }) => ({
  person: one(persons, {
    fields: [personNotes.personId],
    references: [persons.id],
  }),
  author: one(users, {
    fields: [personNotes.authorId],
    references: [users.id],
  }),
}));

export const personIntelRelations = relations(personIntel, ({ one }) => ({
  person: one(persons, {
    fields: [personIntel.personId],
    references: [persons.id],
  }),
  contributor: one(users, {
    fields: [personIntel.contributedBy],
    references: [users.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  person: one(persons, {
    fields: [alerts.personId],
    references: [persons.id],
  }),
  organization: one(organizations, {
    fields: [alerts.orgId],
    references: [organizations.id],
  }),
  dismissedByUser: one(users, {
    fields: [alerts.dismissedBy],
    references: [users.id],
  }),
}));

export const briefingsRelations = relations(briefings, ({ one }) => ({
  person: one(persons, {
    fields: [briefings.personId],
    references: [persons.id],
  }),
  generatedByUser: one(users, {
    fields: [briefings.generatedBy],
    references: [users.id],
  }),
}));

export const chatConversationsRelations = relations(chatConversations, ({ one, many }) => ({
  user: one(users, {
    fields: [chatConversations.userId],
    references: [users.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));

export const apifySourceConfigsRelations = relations(apifySourceConfigs, ({ one, many }) => ({
  targetOrganization: one(organizations, {
    fields: [apifySourceConfigs.targetOrganizationId],
    references: [organizations.id],
  }),
  targetPerson: one(persons, {
    fields: [apifySourceConfigs.targetPersonId],
    references: [persons.id],
  }),
  createdByUser: one(users, {
    fields: [apifySourceConfigs.createdBy],
    references: [users.id],
  }),
  runs: many(apifyRuns),
}));

export const apifyRunsRelations = relations(apifyRuns, ({ one, many }) => ({
  sourceConfig: one(apifySourceConfigs, {
    fields: [apifyRuns.sourceConfigId],
    references: [apifySourceConfigs.id],
  }),
  targetOrganization: one(organizations, {
    fields: [apifyRuns.targetOrganizationId],
    references: [organizations.id],
  }),
  targetPerson: one(persons, {
    fields: [apifyRuns.targetPersonId],
    references: [persons.id],
  }),
  initiatedByUser: one(users, {
    fields: [apifyRuns.initiatedBy],
    references: [users.id],
  }),
  bankLeadershipRecords: many(bankLeadershipRecords),
}));

export const bankLeadershipRecordsRelations = relations(bankLeadershipRecords, ({ one }) => ({
  organization: one(organizations, {
    fields: [bankLeadershipRecords.organizationId],
    references: [organizations.id],
  }),
  apifyRun: one(apifyRuns, {
    fields: [bankLeadershipRecords.apifyRunId],
    references: [apifyRuns.id],
  }),
  sourceConfig: one(apifySourceConfigs, {
    fields: [bankLeadershipRecords.sourceConfigId],
    references: [apifySourceConfigs.id],
  }),
  importedPerson: one(persons, {
    fields: [bankLeadershipRecords.importedPersonId],
    references: [persons.id],
  }),
  importedTenure: one(tenures, {
    fields: [bankLeadershipRecords.importedTenureId],
    references: [tenures.id],
  }),
  createdByUser: one(users, {
    fields: [bankLeadershipRecords.createdBy],
    references: [users.id],
  }),
}));

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Domain = typeof domains.$inferSelect;
export type InsertDomain = typeof domains.$inferInsert;

export type UserDomainAccess = typeof userDomainAccess.$inferSelect;
export type InsertUserDomainAccess = typeof userDomainAccess.$inferInsert;

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

export type OrgHierarchy = typeof orgHierarchy.$inferSelect;
export type InsertOrgHierarchy = typeof orgHierarchy.$inferInsert;

export type Person = typeof persons.$inferSelect;
export type InsertPerson = typeof persons.$inferInsert;

export type Tenure = typeof tenures.$inferSelect;
export type InsertTenure = typeof tenures.$inferInsert;

export type Relationship = typeof relationships.$inferSelect;
export type InsertRelationship = typeof relationships.$inferInsert;

export type ExternalConnection = typeof externalConnections.$inferSelect;
export type InsertExternalConnection = typeof externalConnections.$inferInsert;

export type Interaction = typeof interactions.$inferSelect;
export type InsertInteraction = typeof interactions.$inferInsert;

export type InteractionParticipant = typeof interactionParticipants.$inferSelect;
export type InsertInteractionParticipant = typeof interactionParticipants.$inferInsert;

export type Reflection = typeof reflections.$inferSelect;
export type InsertReflection = typeof reflections.$inferInsert;

export type PersonNote = typeof personNotes.$inferSelect;
export type InsertPersonNote = typeof personNotes.$inferInsert;

export type PersonIntel = typeof personIntel.$inferSelect;
export type InsertPersonIntel = typeof personIntel.$inferInsert;

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;

export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;

export type Briefing = typeof briefings.$inferSelect;
export type InsertBriefing = typeof briefings.$inferInsert;

export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatConversation = typeof chatConversations.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

export type ApifySourceConfig = typeof apifySourceConfigs.$inferSelect;
export type InsertApifySourceConfig = typeof apifySourceConfigs.$inferInsert;

export type ApifyRun = typeof apifyRuns.$inferSelect;
export type InsertApifyRun = typeof apifyRuns.$inferInsert;

export type BankLeadershipRecord = typeof bankLeadershipRecords.$inferSelect;
export type InsertBankLeadershipRecord = typeof bankLeadershipRecords.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGIC SPINE — Week 1 additions
// New tables: opportunities, opportunity_links, watches, ownership, provenance,
//             power_moves, digest_cards, agent_registry, agent_schedules, agent_runs
// ─────────────────────────────────────────────────────────────────────────────

// ─── 22. Opportunities ───────────────────────────────────────────────────────

export const opportunities = pgTable('opportunities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  stage: opportunityStageEnum('stage').notNull().default('identify'),
  domainId: uuid('domain_id').notNull().references(() => domains.id),
  ownerId: uuid('owner_id').references(() => users.id),
  visibilityScope: visibilityScopeEnum('visibility_scope').notNull().default('team'),
  momentumScore: integer('momentum_score').notNull().default(50),
  targetCloseDate: date('target_close_date'),
  lastStageChangeAt: timestamp('last_stage_change_at').notNull().defaultNow(),
  lastActivityAt: timestamp('last_activity_at').notNull().defaultNow(),
  isArchived: boolean('is_archived').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('opportunities_domain_idx').on(table.domainId, table.stage, table.isArchived),
  index('opportunities_owner_idx').on(table.ownerId, table.stage),
  index('opportunities_activity_idx').on(table.lastActivityAt),
]);

// ─── 23. Opportunity Links (polymorphic) ────────────────────────────────────

export const opportunityLinks = pgTable('opportunity_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id),
  targetType: opportunityLinkTargetTypeEnum('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  role: varchar('role', { length: 64 }),
  note: text('note'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('opp_links_opportunity_idx').on(table.opportunityId, table.targetType),
  index('opp_links_target_idx').on(table.targetType, table.targetId),
]);

// ─── 24. Watches (user → target) ─────────────────────────────────────────────

export const watches = pgTable('watches', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  targetType: watchTargetTypeEnum('target_type').notNull(),
  targetId: uuid('target_id'),
  targetLabel: varchar('target_label', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  notifyDigest: boolean('notify_digest').notNull().default(true),
  notifyPush: boolean('notify_push').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('watches_user_idx').on(table.userId, table.isActive),
  index('watches_target_idx').on(table.targetType, table.targetId),
]);

// ─── 25. Ownership (person → owning user) ────────────────────────────────────

export const ownership = pgTable('ownership', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => persons.id),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id),
  tier: ownershipTierEnum('tier').notNull().default('tier_2'),
  assignedBy: uuid('assigned_by').references(() => users.id),
  assignedAt: timestamp('assigned_at').notNull().defaultNow(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('ownership_person_idx').on(table.personId),
  index('ownership_owner_idx').on(table.ownerUserId, table.tier),
]);

// ─── 26. Provenance (polymorphic per-fact) ───────────────────────────────────

export const provenance = pgTable('provenance', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: provenanceEntityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  fieldName: varchar('field_name', { length: 100 }),
  sourceType: provenanceSourceTypeEnum('source_type').notNull(),
  sourceUrl: text('source_url'),
  sourceLabel: varchar('source_label', { length: 255 }),
  contentHash: varchar('content_hash', { length: 64 }),
  capturedBy: uuid('captured_by').references(() => users.id),
  capturedAt: timestamp('captured_at').notNull().defaultNow(),
  confidence: real('confidence'),
  verifiedBy: uuid('verified_by').references(() => users.id),
  verifiedAt: timestamp('verified_at'),
  expiresAt: timestamp('expires_at'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('provenance_entity_idx').on(table.entityType, table.entityId),
  index('provenance_hash_idx').on(table.contentHash),
  index('provenance_expires_idx').on(table.expiresAt),
]);

// ─── 27. Power Moves (change-detection emit) ─────────────────────────────────

export const powerMoves = pgTable('power_moves', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: powerMoveTypeEnum('type').notNull(),
  headline: varchar('headline', { length: 500 }).notNull(),
  summary: text('summary'),
  occurredAt: timestamp('occurred_at').notNull(),
  detectedAt: timestamp('detected_at').notNull().defaultNow(),
  primaryPersonId: uuid('primary_person_id').references(() => persons.id),
  primaryOrgId: uuid('primary_org_id').references(() => organizations.id),
  fromOrgId: uuid('from_org_id').references(() => organizations.id),
  toOrgId: uuid('to_org_id').references(() => organizations.id),
  fromTitle: varchar('from_title', { length: 255 }),
  toTitle: varchar('to_title', { length: 255 }),
  sourceUrl: text('source_url'),
  sourceType: provenanceSourceTypeEnum('source_type').notNull().default('unknown'),
  // Forward reference: agentRuns is defined later in this file (migration 0006).
  // Drizzle's references() callback resolves lazily so forward refs are OK.
  // The SQL FK is added via ALTER TABLE in migration 0006_agent_registry.sql.
  agentRunId: uuid('agent_run_id').references((): any => agentRuns.id),
  confidence: real('confidence'),
  isPublished: boolean('is_published').notNull().default(true),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('power_moves_person_idx').on(table.primaryPersonId, table.occurredAt),
  index('power_moves_org_idx').on(table.primaryOrgId, table.occurredAt),
  index('power_moves_detected_idx').on(table.detectedAt),
]);

// ─── 28. Digest Cards (Today feed) ───────────────────────────────────────────

export const digestCards = pgTable('digest_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: digestCardTypeEnum('type').notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  body: text('body'),
  rank: integer('rank').notNull().default(100),
  relatedPersonId: uuid('related_person_id').references(() => persons.id),
  relatedOrgId: uuid('related_org_id').references(() => organizations.id),
  relatedOpportunityId: uuid('related_opportunity_id').references(() => opportunities.id),
  relatedPowerMoveId: uuid('related_power_move_id').references(() => powerMoves.id),
  actionPayload: jsonb('action_payload'),
  isDismissed: boolean('is_dismissed').notNull().default(false),
  dismissedAt: timestamp('dismissed_at'),
  isActioned: boolean('is_actioned').notNull().default(false),
  actionedAt: timestamp('actioned_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('digest_cards_user_idx').on(table.userId, table.isDismissed, table.rank),
  index('digest_cards_user_created_idx').on(table.userId, table.createdAt),
  index('digest_cards_expires_idx').on(table.expiresAt),
]);

// ─── 29. Agent Registry ──────────────────────────────────────────────────────

export const agentRegistry = pgTable('agent_registry', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: agentNameEnum('name').notNull().unique(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  description: text('description'),
  version: varchar('version', { length: 32 }).notNull().default('1.0.0'),
  isEnabled: boolean('is_enabled').notNull().default(true),
  defaultCadenceCron: varchar('default_cadence_cron', { length: 100 }).notNull(),
  isUserScoped: boolean('is_user_scoped').notNull().default(false),
  isEventDriven: boolean('is_event_driven').notNull().default(false),
  defaultTokenCapUsd: real('default_token_cap_usd'),
  preferredModel: varchar('preferred_model', { length: 64 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── 30. Agent Schedules (admin-configurable cadence) ───────────────────────

export const agentSchedules = pgTable('agent_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').notNull().references(() => agentRegistry.id),
  cronExpression: varchar('cron_expression', { length: 100 }).notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  isDryRun: boolean('is_dry_run').notNull().default(false),
  monthlyTokenCapUsd: real('monthly_token_cap_usd'),
  monthlyTokensUsedUsd: real('monthly_tokens_used_usd').notNull().default(0),
  monthlyWindowStart: timestamp('monthly_window_start').notNull().defaultNow(),
  sourceAllowlist: jsonb('source_allowlist'),
  lastRunAt: timestamp('last_run_at'),
  nextRunAt: timestamp('next_run_at'),
  configOverrides: jsonb('config_overrides'),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('agent_schedules_agent_idx').on(table.agentId),
  index('agent_schedules_next_run_idx').on(table.isEnabled, table.nextRunAt),
]);

// ─── 31. Agent Runs (execution history) ─────────────────────────────────────

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').notNull().references(() => agentRegistry.id),
  scheduleId: uuid('schedule_id').references(() => agentSchedules.id),
  scopeUserId: uuid('scope_user_id').references(() => users.id),
  status: agentRunStatusEnum('status').notNull().default('queued'),
  triggeredBy: varchar('triggered_by', { length: 32 }).notNull().default('schedule'),
  triggeredByUserId: uuid('triggered_by_user_id').references(() => users.id),
  isDryRun: boolean('is_dry_run').notNull().default(false),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  durationMs: integer('duration_ms'),
  itemsProcessed: integer('items_processed').notNull().default(0),
  itemsCreated: integer('items_created').notNull().default(0),
  itemsUpdated: integer('items_updated').notNull().default(0),
  itemsSkipped: integer('items_skipped').notNull().default(0),
  tokensUsed: integer('tokens_used').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  modelUsed: varchar('model_used', { length: 64 }),
  errorMessage: text('error_message'),
  errorStack: text('error_stack'),
  output: jsonb('output'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('agent_runs_agent_idx').on(table.agentId, table.createdAt),
  index('agent_runs_schedule_idx').on(table.scheduleId, table.createdAt),
  index('agent_runs_status_idx').on(table.status, table.createdAt),
]);

// ─── Strategic spine relations ───────────────────────────────────────────────

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  domain: one(domains, {
    fields: [opportunities.domainId],
    references: [domains.id],
  }),
  owner: one(users, {
    fields: [opportunities.ownerId],
    references: [users.id],
    relationName: 'opportunityOwner',
  }),
  createdByUser: one(users, {
    fields: [opportunities.createdBy],
    references: [users.id],
    relationName: 'opportunityCreator',
  }),
  links: many(opportunityLinks),
  digestCards: many(digestCards),
}));

export const opportunityLinksRelations = relations(opportunityLinks, ({ one }) => ({
  opportunity: one(opportunities, {
    fields: [opportunityLinks.opportunityId],
    references: [opportunities.id],
  }),
  createdByUser: one(users, {
    fields: [opportunityLinks.createdBy],
    references: [users.id],
  }),
}));

export const watchesRelations = relations(watches, ({ one }) => ({
  user: one(users, {
    fields: [watches.userId],
    references: [users.id],
  }),
}));

export const ownershipRelations = relations(ownership, ({ one }) => ({
  person: one(persons, {
    fields: [ownership.personId],
    references: [persons.id],
  }),
  owner: one(users, {
    fields: [ownership.ownerUserId],
    references: [users.id],
    relationName: 'ownershipOwner',
  }),
  assigner: one(users, {
    fields: [ownership.assignedBy],
    references: [users.id],
    relationName: 'ownershipAssigner',
  }),
}));

export const provenanceRelations = relations(provenance, ({ one }) => ({
  capturer: one(users, {
    fields: [provenance.capturedBy],
    references: [users.id],
    relationName: 'provenanceCapturer',
  }),
  verifier: one(users, {
    fields: [provenance.verifiedBy],
    references: [users.id],
    relationName: 'provenanceVerifier',
  }),
}));

export const powerMovesRelations = relations(powerMoves, ({ one }) => ({
  primaryPerson: one(persons, {
    fields: [powerMoves.primaryPersonId],
    references: [persons.id],
  }),
  primaryOrg: one(organizations, {
    fields: [powerMoves.primaryOrgId],
    references: [organizations.id],
    relationName: 'powerMovePrimaryOrg',
  }),
  fromOrg: one(organizations, {
    fields: [powerMoves.fromOrgId],
    references: [organizations.id],
    relationName: 'powerMoveFromOrg',
  }),
  toOrg: one(organizations, {
    fields: [powerMoves.toOrgId],
    references: [organizations.id],
    relationName: 'powerMoveToOrg',
  }),
  agentRun: one(agentRuns, {
    fields: [powerMoves.agentRunId],
    references: [agentRuns.id],
  }),
}));

export const digestCardsRelations = relations(digestCards, ({ one }) => ({
  user: one(users, {
    fields: [digestCards.userId],
    references: [users.id],
  }),
  relatedPerson: one(persons, {
    fields: [digestCards.relatedPersonId],
    references: [persons.id],
  }),
  relatedOrg: one(organizations, {
    fields: [digestCards.relatedOrgId],
    references: [organizations.id],
  }),
  relatedOpportunity: one(opportunities, {
    fields: [digestCards.relatedOpportunityId],
    references: [opportunities.id],
  }),
  relatedPowerMove: one(powerMoves, {
    fields: [digestCards.relatedPowerMoveId],
    references: [powerMoves.id],
  }),
}));

export const agentRegistryRelations = relations(agentRegistry, ({ many }) => ({
  schedules: many(agentSchedules),
  runs: many(agentRuns),
}));

export const agentSchedulesRelations = relations(agentSchedules, ({ one, many }) => ({
  agent: one(agentRegistry, {
    fields: [agentSchedules.agentId],
    references: [agentRegistry.id],
  }),
  updater: one(users, {
    fields: [agentSchedules.updatedBy],
    references: [users.id],
  }),
  runs: many(agentRuns),
}));

export const agentRunsRelations = relations(agentRuns, ({ one }) => ({
  agent: one(agentRegistry, {
    fields: [agentRuns.agentId],
    references: [agentRegistry.id],
  }),
  schedule: one(agentSchedules, {
    fields: [agentRuns.scheduleId],
    references: [agentSchedules.id],
  }),
  scopeUser: one(users, {
    fields: [agentRuns.scopeUserId],
    references: [users.id],
    relationName: 'agentRunScopeUser',
  }),
  triggerUser: one(users, {
    fields: [agentRuns.triggeredByUserId],
    references: [users.id],
    relationName: 'agentRunTriggerUser',
  }),
}));

// ─── Strategic spine inferred types ─────────────────────────────────────────

export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = typeof opportunities.$inferInsert;

export type OpportunityLink = typeof opportunityLinks.$inferSelect;
export type InsertOpportunityLink = typeof opportunityLinks.$inferInsert;

export type Watch = typeof watches.$inferSelect;
export type InsertWatch = typeof watches.$inferInsert;

export type Ownership = typeof ownership.$inferSelect;
export type InsertOwnership = typeof ownership.$inferInsert;

export type Provenance = typeof provenance.$inferSelect;
export type InsertProvenance = typeof provenance.$inferInsert;

export type PowerMove = typeof powerMoves.$inferSelect;
export type InsertPowerMove = typeof powerMoves.$inferInsert;

export type DigestCard = typeof digestCards.$inferSelect;
export type InsertDigestCard = typeof digestCards.$inferInsert;

export type AgentRegistry = typeof agentRegistry.$inferSelect;
export type InsertAgentRegistry = typeof agentRegistry.$inferInsert;

export type AgentSchedule = typeof agentSchedules.$inferSelect;
export type InsertAgentSchedule = typeof agentSchedules.$inferInsert;

export type AgentRun = typeof agentRuns.$inferSelect;
export type InsertAgentRun = typeof agentRuns.$inferInsert;
