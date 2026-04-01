// Role levels - numeric for comparison
export const ROLE_LEVELS = {
  viewer: 1,
  contributor: 2,
  manager: 3,
  admin: 4,
  super_admin: 5,
} as const;

export type UserRole = keyof typeof ROLE_LEVELS;
export const USER_ROLES = Object.keys(ROLE_LEVELS) as [UserRole, ...UserRole[]];

// Organization types
export const ORG_TYPES = ['psu_bank', 'private_bank', 'regulator', 'government', 'nbfc', 'dfi', 'corporate', 'other'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

// Tenure source
export const TENURE_SOURCES = ['manual', 'auto_scraped'] as const;
export type TenureSource = (typeof TENURE_SOURCES)[number];

// Relationship types
export const RELATIONSHIP_TYPES = ['direct', 'indirect', 'formal', 'informal', 'mentorship', 'alumni', 'other'] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

// Strength labels
export const STRENGTH_LABELS = ['dormant', 'acquaintance', 'active', 'strong', 'champion'] as const;
export type StrengthLabel = (typeof STRENGTH_LABELS)[number];

// External connection types
export const EXTERNAL_CONNECTION_TYPES = ['alumni', 'family', 'mentor_mentee', 'board_colleague', 'political_ally', 'professional', 'other'] as const;
export type ExternalConnectionType = (typeof EXTERNAL_CONNECTION_TYPES)[number];

// Interaction types
export const INTERACTION_TYPES = ['one_on_one_meeting', 'group_meeting', 'conference', 'phone_call', 'meal', 'event', 'email', 'social', 'other'] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

// Participant roles
export const PARTICIPANT_ROLES = ['attendee', 'organizer', 'speaker', 'host'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

// Input methods
export const INPUT_METHODS = ['voice', 'text', 'form', 'card_scan', 'auto_scraper', 'system'] as const;
export type InputMethod = (typeof INPUT_METHODS)[number];

// Reflection categories
export const REFLECTION_CATEGORIES = ['strategic_read', 'personality', 'network_dynamics', 'risk_concern', 'opportunity'] as const;
export type ReflectionCategory = (typeof REFLECTION_CATEGORIES)[number];

// Confidence levels
export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

// Visibility levels
export const VISIBILITY_LEVELS = ['contributor', 'manager', 'admin'] as const;
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];

// Audit action types
export const AUDIT_ACTION_TYPES = ['view', 'create', 'update', 'delete', 'search', 'export', 'generate_briefing', 'find_path', 'voice_query', 'text_query'] as const;
export type AuditActionType = (typeof AUDIT_ACTION_TYPES)[number];

// Audit entity types
export const AUDIT_ENTITY_TYPES = ['person', 'organization', 'interaction', 'reflection', 'note', 'tenure', 'relationship', 'intel_field', 'user', 'domain', 'external_connection', 'alert', 'briefing', 'chat_conversation'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

// Alert types
export const ALERT_TYPES = ['movement_detected', 'relationship_decay', 'opportunity', 'new_person_added', 'coverage_gap'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

// Alert severity
export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

// Chat message roles
export const CHAT_ROLES = ['user', 'assistant', 'system'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

// Org hierarchy relationship types
export const ORG_HIERARCHY_TYPES = ['subsidiary', 'department', 'regional_office', 'committee'] as const;
export type OrgHierarchyType = (typeof ORG_HIERARCHY_TYPES)[number];

// Person categories
export const PERSON_CATEGORIES = ['banker', 'regulator', 'bureaucrat', 'politician', 'corporate', 'other'] as const;
export type PersonCategory = (typeof PERSON_CATEGORIES)[number];

// External connection source
export const EXTERNAL_CONNECTION_SOURCES = ['team_input', 'reflection_extracted', 'auto_scraped'] as const;
export type ExternalConnectionSource = (typeof EXTERNAL_CONNECTION_SOURCES)[number];
