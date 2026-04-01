import { z } from 'zod';
import {
  USER_ROLES, ORG_TYPES, TENURE_SOURCES, RELATIONSHIP_TYPES, STRENGTH_LABELS,
  EXTERNAL_CONNECTION_TYPES, INTERACTION_TYPES, PARTICIPANT_ROLES, INPUT_METHODS,
  REFLECTION_CATEGORIES, CONFIDENCE_LEVELS, VISIBILITY_LEVELS, PERSON_CATEGORIES,
  EXTERNAL_CONNECTION_SOURCES, ORG_HIERARCHY_TYPES,
} from './enums';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PASSWORD_MIN_LENGTH } from './constants';

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
