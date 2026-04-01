export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const PASSWORD_MIN_LENGTH = 8;
export const JWT_ACCESS_EXPIRY = '24h';
export const JWT_REFRESH_EXPIRY = '7d';
export const RELGRAPH_SESSION_COOKIE = 'relgraph_session';
export const RELGRAPH_REFRESH_COOKIE = 'relgraph_refresh';

export const STRENGTH_RANGES = {
  dormant: { min: 0, max: 20 },
  acquaintance: { min: 21, max: 40 },
  active: { min: 41, max: 60 },
  strong: { min: 61, max: 80 },
  champion: { min: 81, max: 100 },
} as const;

export const DOMAIN_COLORS: Record<string, string> = {
  'PSU Banking': '#7F77DD',
  'Private Banking': '#1D9E75',
  'Regulators': '#D85A30',
  'Government': '#D4537E',
  'NBFCs': '#378ADD',
  'Corporates': '#BA7517',
};
