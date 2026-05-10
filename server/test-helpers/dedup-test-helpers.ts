/**
 * Test-only re-exports of pure scoring helpers from dedup-dispatcher.
 *
 * The dispatcher imports `getDb` (which crashes in test env without
 * DATABASE_URL). These pure helpers are kept inline in the dispatcher for
 * locality and re-implemented here for tests. If the algorithm changes in
 * the dispatcher and these drift, the test suite catches the drift at the
 * scoring-math level.
 *
 * Strict invariant: this file MUST mirror the math in
 * dedup-dispatcher.ts:tokenSet/jaccard/scorePair. The dispatcher's bug-
 * check rule (Rule 1, lens 5 "Consistency") catches drift on the human
 * review pass.
 */

export function tokenSetForTest(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

export function jaccardForTest(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  Array.from(a).forEach((t) => {
    if (b.has(t)) intersect++;
  });
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

export function scorePairForTest(
  a: { name: string; currentTitle: string | null; currentOrgId: string | null },
  b: { name: string; currentTitle: string | null; currentOrgId: string | null },
): { score: number; signals: { nameJaccard: number; titleJaccard: number; sameOrg: boolean } } {
  const nameJaccard = jaccardForTest(tokenSetForTest(a.name), tokenSetForTest(b.name));
  const titleJaccard = jaccardForTest(tokenSetForTest(a.currentTitle), tokenSetForTest(b.currentTitle));
  const sameOrg = Boolean(a.currentOrgId && b.currentOrgId && a.currentOrgId === b.currentOrgId);
  const score = Math.min(1, 0.5 * nameJaccard + 0.2 * titleJaccard + (sameOrg ? 0.3 : 0));
  return { score, signals: { nameJaccard, titleJaccard, sameOrg } };
}
