# RelGraph Full QA Session Notes

## Authenticated entry checkpoint

I successfully signed in to the live preview as the super admin account and landed on the main dashboard. The left navigation shows the core product routes and admin routes now visible to an authenticated super admin.

| Section | Visible entries |
|---|---|
| Core navigation | Dashboard, People, Organizations, Network Map, Path Finder, Alerts, Briefings |
| Admin navigation | Users, Access Requests, Domains, Apify Ops, Bank Dataset, Audit Log |

## Immediate observations

The authenticated shell rendered without a blocking runtime error. The recent dashboard cards show zero-state data, which is acceptable for an empty workspace, but each linked flow still needs targeted validation. The next QA steps are to check every admin page, core lists, creation flows, and any actions likely to depend on live database schema assumptions.

## User Management page check

The User Management screen loads successfully after authentication and settles into a valid empty state instead of hanging or crashing. The page shows the expected tabs for **Users**, **Registration Allowlist**, and **Access Requests**, and the primary **Create User** action is visible.

| Checkpoint | Result |
|---|---|
| Route load | Passed |
| Runtime crash on page load | Not observed |
| Empty-state rendering | Passed |
| Admin tabs visible | Passed |

The next QA step is to exercise the tabbed admin flows and creation actions because those are more likely to surface schema or mutation issues than the empty-state list view.

## Registration Allowlist re-test after server restart

The authenticated **Registration Allowlist** tab now completes successfully when the form is submitted with synchronized input events. A live approval request for a fresh test address returned HTTP 200 and created a new pending-registration user record, confirming that the backend allowlist mutation is functioning after the restart and compatibility fixes.

| Checkpoint | Result |
|---|---|
| Allowlist tab load | Passed |
| Allowlist mutation request | Passed |
| Response status | 200 OK |
| Created record shape | Returned id, email, role, invitedBy |
| Immediate list refresh | Passed |

The recent `audit_log` error visible in server logs appears to be historical output from earlier sessions rather than a fresh failure during this re-test, but audit persistence still remains on the QA watchlist until another action confirms clean current writes.

## Audit Log page validation

The **Audit Log** admin page loads successfully in the authenticated session and currently shows recent authentication activity entries instead of failing with a missing-table runtime error. The visible list contains recent login events for the super admin account, which indicates audit records are present and queryable in the live environment despite the earlier historical server-log noise.

| Checkpoint | Result |
|---|---|
| Audit Log route load | Passed |
| Table rendering | Passed |
| Recent records visible | Passed |
| Fresh missing-table error on page load | Not observed |

This reduces the likelihood that audit persistence is currently broken in the live app, though I still need to test one or two non-login admin actions to confirm audit writes remain healthy beyond authentication events.

## Access Requests page validation

The **Access Requests** admin route loads successfully and renders a clean empty state with no blocking runtime error. The page shows the bulk-approval controls, reserved-identity guidance, selection checkbox, and empty-state messaging, which indicates the request-listing path is functioning for a zero-record scenario.

| Checkpoint | Result |
|---|---|
| Access Requests route load | Passed |
| Empty-state rendering | Passed |
| Bulk action controls visible | Passed |
| Runtime crash on page load | Not observed |

This does not yet validate approve or deny mutations, but it confirms that the listing flow is currently stable in the authenticated admin session.

## Domain Management create-flow validation

The repaired **Domain Management** flow now succeeds end to end in the live authenticated session. I opened the add-domain modal, created a fresh test entry named **QA Domain 2026-04-06 08:31**, and the new row appeared immediately in the table with active status.

| Checkpoint | Result |
|---|---|
| Domains route load | Passed |
| Add Domain modal open | Passed |
| Domain create submit | Passed |
| New row visible after submit | Passed |
| Previously reported insert failure | Not reproduced |

This confirms the UUID-based domain-creation fix is working in the browser, not just in tests.

## People page validation

The **People** route loads successfully in the authenticated session and renders a stable empty state rather than failing when no contacts are present. The page shows the expected toolbar actions for import history, template settings, contact import, and manual person creation, along with working search and filter controls.

| Checkpoint | Result |
|---|---|
| People route load | Passed |
| Empty-state rendering | Passed |
| Search control visible | Passed |
| Domain/category filters visible | Passed |
| Core action buttons visible | Passed |

I have not yet executed a create/import mutation here, but the zero-data list view and route rendering are currently stable.

## Organizations page validation

The **Organizations** route loads successfully in the authenticated session and renders a clean zero-data state instead of crashing when no organizations are present. The page exposes the expected search field, domain filter, and **Add Organization** action, which indicates the list and toolbar layer are currently stable for an empty workspace.

| Checkpoint | Result |
|---|---|
| Organizations route load | Passed |
| Empty-state rendering | Passed |
| Search control visible | Passed |
| Domain filter visible | Passed |
| Add Organization action visible | Passed |

I still need to exercise creation on this page to rule out mutation-specific issues, but the route and empty-list rendering are currently behaving normally.

## Network Map validation

The **Network Map** route loads without a runtime crash, but the large visualization panel initially looks visually blank in the browser until its empty-state copy is inspected more closely. DOM inspection confirms that the page is intentionally rendering an empty-state graph container with controls and messaging rather than failing silently.

| Checkpoint | Result |
|---|---|
| Network Map route load | Passed |
| Runtime crash on page load | Not observed |
| Empty-state messaging present | Passed |
| Basic controls present | Passed |
| Usability clarity | Needs improvement |

The current empty-state copy includes **No network data to display**, **Add people and relationships to see the graph**, and summary values such as **0 people**, **0 relationships**, and **Zoom: 100%**. This means the page is functionally loading, but the empty visualization area could be mistaken for a rendering bug because the explanatory content is visually subtle.

## Path Finder validation

The **Path Finder** route loads successfully in the authenticated session and presents a stable empty state when no contacts are available to search. The search field is visible and the page communicates the intended workflow clearly enough to confirm that the route is functioning rather than failing.

| Checkpoint | Result |
|---|---|
| Path Finder route load | Passed |
| Search input visible | Passed |
| Empty-state messaging visible | Passed |
| Runtime crash on page load | Not observed |

The page currently behaves as an empty-data experience, not a broken flow. I still need populated graph data to validate ranking accuracy and result rendering, but the route itself is stable.

## Alerts page validation

The **Alerts** route loads successfully in the authenticated session and presents a stable empty state when there are no active intelligence events. The page renders the expected category tabs and the **Show Dismissed** control without a runtime crash, which indicates that the listing and filtering shell is currently functioning.

| Checkpoint | Result |
|---|---|
| Alerts route load | Passed |
| Empty-state rendering | Passed |
| Category tabs visible | Passed |
| Show Dismissed control visible | Passed |
| Runtime crash on page load | Not observed |

This confirms the route is stable for a zero-alert scenario. I still need populated alert data to validate tab filtering behavior and dismissed-state transitions fully.

## Briefings page validation

The **Briefings** route loads successfully in the authenticated session and presents a stable zero-data experience. The page shows the expected split layout for recent briefings and briefing detail, along with the **Generate Briefing** action, without any visible runtime failure.

| Checkpoint | Result |
|---|---|
| Briefings route load | Passed |
| Empty-state rendering | Passed |
| Generate Briefing action visible | Passed |
| Dual-panel layout visible | Passed |
| Runtime crash on page load | Not observed |

This confirms that the route shell is stable in an empty-data state. I still need to validate briefing generation separately because that flow may depend on additional upstream data and long-running backend work.
