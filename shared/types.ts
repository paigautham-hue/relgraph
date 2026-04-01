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
