export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    avatarUrl: string | null;
  };
  accessToken?: string;
}

export interface PersonSummary {
  id: string;
  name: string;
  currentTitle: string | null;
  currentOrgName: string | null;
  category: string | null;
  photoUrl: string | null;
  isTracked: boolean;
  domainName: string | null;
  domainColor: string | null;
}

export interface TenureItem {
  id: string;
  orgId: string;
  orgName: string;
  title: string;
  department: string | null;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  source: string;
}

export interface RelationshipItem {
  id: string;
  personId: string;
  personName: string;
  type: string;
  strengthScore: number;
  strengthLabel: string;
  lastInteractionAt: string | null;
  originStory: string | null;
  declaredByName: string | null;
}

export interface InteractionItem {
  id: string;
  type: string;
  occurredAt: string;
  location: string | null;
  summary: string;
  depthScore: number | null;
  inputMethod: string | null;
  createdByName: string | null;
  participants: { personId: string; personName: string; role: string }[];
}

export interface ReflectionItem {
  id: string;
  category: string;
  content: string;
  confidenceLevel: string;
  confidenceBasis: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  inputMethod: string | null;
  visibilityLevel: string;
  createdAt: string;
}

export interface IntelFieldItem {
  id: string;
  fieldName: string;
  fieldValue: string;
  contributedByName: string;
  inputMethod: string | null;
  sourceUrl: string | null;
  aiConfidence: number | null;
  lastVerifiedAt: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalPersons: number;
  totalOrganizations: number;
  totalInteractions: number;
  totalRelationships: number;
  strengthDistribution: Record<string, number>;
  recentActivity: { date: string; count: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategic spine types (week 1)
// ─────────────────────────────────────────────────────────────────────────────

export interface OpportunitySummary {
  id: string;
  name: string;
  description: string | null;
  stage: string;
  domainId: string;
  domainName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  visibilityScope: string;
  momentumScore: number;
  targetCloseDate: string | null;
  lastStageChangeAt: string;
  lastActivityAt: string;
  isArchived: boolean;
  linkCount: number;
  createdAt: string;
}

export interface OpportunityLinkItem {
  id: string;
  opportunityId: string;
  targetType: 'person' | 'organization' | 'interaction';
  targetId: string;
  targetLabel: string;
  role: string | null;
  note: string | null;
  createdAt: string;
}

export interface WatchItem {
  id: string;
  targetType: 'person' | 'organization' | 'sector' | 'role';
  targetId: string | null;
  targetLabel: string;
  isActive: boolean;
  notifyDigest: boolean;
  notifyPush: boolean;
  createdAt: string;
}

export interface OwnershipItem {
  id: string;
  personId: string;
  personName: string;
  ownerUserId: string;
  ownerName: string;
  tier: 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4';
  assignedAt: string;
  notes: string | null;
}

export interface ProvenanceItem {
  id: string;
  entityType: string;
  entityId: string;
  fieldName: string | null;
  sourceType: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  capturedBy: string | null;
  capturedByName: string | null;
  capturedAt: string;
  confidence: number | null;
  verifiedBy: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  isStale: boolean;
}

export interface PowerMoveItem {
  id: string;
  type: string;
  headline: string;
  summary: string | null;
  occurredAt: string;
  detectedAt: string;
  primaryPersonId: string | null;
  primaryPersonName: string | null;
  primaryOrgId: string | null;
  primaryOrgName: string | null;
  fromOrgName: string | null;
  toOrgName: string | null;
  fromTitle: string | null;
  toTitle: string | null;
  sourceUrl: string | null;
  sourceType: string;
  confidence: number | null;
}

export interface DigestCardItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  rank: number;
  relatedPersonId: string | null;
  relatedPersonName: string | null;
  relatedOrgId: string | null;
  relatedOrgName: string | null;
  relatedOpportunityId: string | null;
  relatedOpportunityName: string | null;
  relatedPowerMoveId: string | null;
  actionPayload: Record<string, unknown> | null;
  isDismissed: boolean;
  isActioned: boolean;
  createdAt: string;
  expiresAt: string | null;
}

export interface AgentRegistryItem {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  version: string;
  isEnabled: boolean;
  defaultCadenceCron: string;
  isUserScoped: boolean;
  isEventDriven: boolean;
  defaultTokenCapUsd: number | null;
  preferredModel: string | null;
}

export interface AgentScheduleItem {
  id: string;
  agentId: string;
  agentName: string;
  agentDisplayName: string;
  cronExpression: string;
  isEnabled: boolean;
  isDryRun: boolean;
  monthlyTokenCapUsd: number | null;
  monthlyTokensUsedUsd: number;
  monthlyWindowStart: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  sourceAllowlist: string[] | null;
}

export interface AgentRunItem {
  id: string;
  agentId: string;
  agentName: string;
  scheduleId: string | null;
  status: string;
  triggeredBy: string;
  isDryRun: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  tokensUsed: number;
  costUsd: number;
  modelUsed: string | null;
  errorMessage: string | null;
  createdAt: string;
}
