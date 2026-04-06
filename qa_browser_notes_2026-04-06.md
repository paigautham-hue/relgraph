# RelGraph QA browser notes

## Authenticated state confirmed

The app is already signed in as **gautham@manipalgroup.info** and lands on the dashboard inside the sidebar-based admin layout.

## Visible navigation confirmed

The authenticated sidebar shows these main routes: Dashboard, People, Organizations, Network Map, Path Finder, Alerts, Briefings, Users, Access Requests, Domains, Apify Ops, Bank Dataset, and Audit Log.

## Immediate QA implications

This confirms the current session is authenticated and ready for direct reproduction of the priority issues without needing a fresh login step. The next targets to reproduce are the People view, Network Map, Apify Ops, and Bank Dataset flows.

## Post-restart authenticated QA validation

The app was re-authenticated successfully with the provided admin account and returned to the dashboard without issues.

The **People** page no longer shows the earlier pagination validation failure. It now renders a clean empty state and the browser console is clear.

The **Network Map** page also no longer shows the earlier pagination validation failure. It loads the canvas correctly and presents a clean empty-state graph view.

The **Apify Operations** workflow was re-tested after restarting the development server. The Indian Banks domain was selected again and the seed action was triggered successfully.

The earlier `psu_bank` insertion failure did not recur after restart. Live DOM inspection of the Indian bank registry now shows the seeded rows with **Present** badges, and the source-configuration table contains generated monitoring entries, which confirms that organization seeding plus monitoring-config creation succeeded in the running app.
