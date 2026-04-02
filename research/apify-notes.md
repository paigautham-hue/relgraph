# Apify notes for RelGraph integration

The official Apify API documentation confirms that the platform is organized around REST endpoints and supports secure bearer-token authentication through the `Authorization` header. The standard workflow is to run an Actor or task, poll the run status, and then fetch structured results from the default dataset identified in the run response.

The schedules documentation confirms that recurring monitoring can be implemented through cron-based schedules, with timezone support and JSON input overrides. A single schedule can trigger multiple Actor or task actions, which makes it suitable for recurring monitoring jobs over tracked people, organizations, or source groups.

For RelGraph, the most relevant Apify capabilities are actor or task execution for ingestion and enrichment, dataset retrieval for normalized output, and schedules for recurring monitoring workflows. Webhooks are also documented as a notification mechanism after runs, which could later support asynchronous alerts or background processing if needed.
