import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  integer,
  real,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
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
} from '../../shared/enums';

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
}));

export const tenuresRelations = relations(tenures, ({ one }) => ({
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
