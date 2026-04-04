# Authenticated admin validation notes

## Session state

- User successfully signed in to RelGraph and reached the authenticated dashboard.
- Admin sidebar shows both **Apify Ops** and **Bank Dataset** entries.

## Apify Operations page observations

- The authenticated **Apify Operations** page loads successfully at `/admin/apify`.
- The page displays the expected admin sections for source creation, source configurations, recent run activity, Indian bank seed workflow, and the Indian bank target registry.
- Current live state on the page:
  - Configured sources: `0`
  - Recorded runs: `0`
  - Indian bank targets: `31`
  - Pending leadership review: `0`
- The page includes a domain selector for seeding, but no domain is currently selected.
- The page exposes a direct navigation link to the bank validation queue at `/admin/bank-dataset`.
- The bank target registry renders successfully with seed state values showing `Not seeded`.

## Current validation implication

- Authenticated navigation is now working.
- Apify and bank-dataset admin routes appear reachable from the sidebar.
- Full workflow execution may still depend on available domain data and seedable records.

## Audit log recovery validation

The authenticated **Audit Log** screen now loads successfully at `/admin/audit` after the recovery migration created the missing `audit_log` table. The page renders its filter controls and empty-state table instead of surfacing the previous database failure, which confirms the blocking table-not-found error has been cleared. The log currently shows `0 entries`, so the recovery resolved the write-path blocker but there are not yet visible records in the current filtered view.
