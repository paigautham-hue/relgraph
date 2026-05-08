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
// NOTE: any addition here requires an ALTER TABLE on the audit_log.entity_type
// column to add the new enum value(s). See migration 0005_strategic_spine.sql.
export const AUDIT_ENTITY_TYPES = [
  'person', 'organization', 'interaction', 'reflection', 'note', 'tenure',
  'relationship', 'intel_field', 'user', 'domain', 'external_connection',
  'alert', 'briefing', 'chat_conversation', 'apify_source', 'apify_run',
  // Strategic spine (week 1) — must be reflected in audit_log.entity_type DDL
  'opportunity', 'opportunity_link', 'watch', 'ownership', 'provenance',
  'power_move', 'digest_card', 'agent_schedule', 'agent_run',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

// Alert types
export const ALERT_TYPES = ['movement_detected', 'relationship_decay', 'opportunity', 'new_person_added', 'coverage_gap', 'source_change_detected', 'source_run_failed', 'new_lead_discovered'] as const;
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

// ─── Strategic Spine (week 1) ────────────────────────────────────────────────

// Opportunity stages — state machine for business initiatives
export const OPPORTUNITY_STAGES = ['identify', 'map', 'approach', 'engage', 'close', 'maintain', 'lost'] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

// Valid stage transitions (forward + backward + lost from any active stage)
export const OPPORTUNITY_STAGE_TRANSITIONS: Record<OpportunityStage, OpportunityStage[]> = {
  identify: ['map', 'lost'],
  map: ['identify', 'approach', 'lost'],
  approach: ['map', 'engage', 'lost'],
  engage: ['approach', 'close', 'lost'],
  close: ['engage', 'maintain', 'lost'],
  maintain: ['close', 'lost'],
  lost: ['identify'],
};

// Opportunity link target types — polymorphic links from opportunity to other entities
export const OPPORTUNITY_LINK_TARGET_TYPES = ['person', 'organization', 'interaction'] as const;
export type OpportunityLinkTargetType = (typeof OPPORTUNITY_LINK_TARGET_TYPES)[number];

// Watch target types — what a user can subscribe to
export const WATCH_TARGET_TYPES = ['person', 'organization', 'sector', 'role'] as const;
export type WatchTargetType = (typeof WATCH_TARGET_TYPES)[number];

// Ownership tiers — drives stay-connected expectations and "no owner" alerts
export const OWNERSHIP_TIERS = ['tier_1', 'tier_2', 'tier_3', 'tier_4'] as const;
export type OwnershipTier = (typeof OWNERSHIP_TIERS)[number];

// Provenance source types — how a fact entered the system
export const PROVENANCE_SOURCE_TYPES = [
  'voice_capture',
  'text_capture',
  'manual_form',
  'apify_scrape',
  'public_news',
  'rbi_release',
  'pib_release',
  'mca21_filing',
  'sebi_order',
  'bse_filing',
  'nse_filing',
  'gazette_notification',
  'annual_report',
  'press_release',
  'email_forward',
  'csv_import',
  'ai_extraction',
  'team_member',
  'system',
  'unknown',
] as const;
export type ProvenanceSourceType = (typeof PROVENANCE_SOURCE_TYPES)[number];

// Provenance entity types — polymorphic: which entity does this fact attach to
export const PROVENANCE_ENTITY_TYPES = [
  'person',
  'organization',
  'tenure',
  'relationship',
  'interaction',
  'reflection',
  'note',
  'intel_field',
  'opportunity',
  'power_move',
] as const;
export type ProvenanceEntityType = (typeof PROVENANCE_ENTITY_TYPES)[number];

// Agent names — canonical list of background workers
export const AGENT_NAMES = [
  'ingestion_rbi_pib',
  'ingestion_mca21_gazette',
  'ingestion_bse_nse',
  'change_detection',
  'dedup',
  'enrichment',
  'path_recompute',
  'brief',
  'trust_auditor',
  'digest',
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

// Agent run statuses — execution lifecycle
export const AGENT_RUN_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'skipped',
  'budget_exhausted',
  'dry_run',
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

// Power-move types — what change-detection agents emit
export const POWER_MOVE_TYPES = [
  'role_change',
  'board_appointment',
  'board_exit',
  'committee_appointment',
  'company_formation',
  'regulatory_action',
  'major_filing',
  'public_statement',
  'other',
] as const;
export type PowerMoveType = (typeof POWER_MOVE_TYPES)[number];

// Digest card types — what shows up in the Today feed
export const DIGEST_CARD_TYPES = [
  'power_move',
  'briefing',
  'follow_up',
  'stale_relationship',
  'new_path',
  'team_intel',
  'opportunity_stall',
  'no_owner',
  'opportunity_momentum',
  'watchlist_hit',
] as const;
export type DigestCardType = (typeof DIGEST_CARD_TYPES)[number];

// Visibility scope for opportunities/watches/notes — multi-user trust
export const VISIBILITY_SCOPES = ['private', 'team', 'org'] as const;
export type VisibilityScope = (typeof VISIBILITY_SCOPES)[number];

// (STRATEGIC_AUDIT_ENTITY_TYPES was folded into AUDIT_ENTITY_TYPES above —
// the audit_log table uses one enum; new entities live in the same list.)
