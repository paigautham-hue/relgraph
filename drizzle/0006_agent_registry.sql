-- Agent registry, schedules, and runs.
-- Admin-configurable cadence per agent. Runs track tokens used + cost.
--
-- The registry is seeded with the 10 canonical agents and their default
-- cadences. The default schedule is created off-by-default for ingestion
-- agents (admin must enable explicitly to avoid surprise costs).

CREATE TABLE IF NOT EXISTS `agent_registry` (
  `id` varchar(36) NOT NULL,
  `name` enum('ingestion_rbi_pib','ingestion_mca21_gazette','ingestion_bse_nse','change_detection','dedup','enrichment','path_recompute','brief','trust_auditor','digest') NOT NULL,
  `display_name` varchar(255) NOT NULL,
  `description` text NULL,
  `version` varchar(32) NOT NULL DEFAULT '1.0.0',
  `is_enabled` boolean NOT NULL DEFAULT TRUE,
  `default_cadence_cron` varchar(100) NOT NULL,
  `is_user_scoped` boolean NOT NULL DEFAULT FALSE,
  `is_event_driven` boolean NOT NULL DEFAULT FALSE,
  `default_token_cap_usd` double NULL,
  `preferred_model` varchar(64) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agent_registry_pk` PRIMARY KEY (`id`),
  CONSTRAINT `agent_registry_name_unique` UNIQUE (`name`)
);

CREATE TABLE IF NOT EXISTS `agent_schedules` (
  `id` varchar(36) NOT NULL,
  `agent_id` varchar(36) NOT NULL,
  `cron_expression` varchar(100) NOT NULL,
  `is_enabled` boolean NOT NULL DEFAULT TRUE,
  `is_dry_run` boolean NOT NULL DEFAULT FALSE,
  `monthly_token_cap_usd` double NULL,
  `monthly_tokens_used_usd` double NOT NULL DEFAULT 0,
  `monthly_window_start` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `source_allowlist` json NULL,
  `last_run_at` timestamp NULL DEFAULT NULL,
  `next_run_at` timestamp NULL DEFAULT NULL,
  `config_overrides` json NULL,
  `updated_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agent_schedules_pk` PRIMARY KEY (`id`),
  CONSTRAINT `as_agent_fk` FOREIGN KEY (`agent_id`) REFERENCES `agent_registry`(`id`) ON DELETE CASCADE,
  CONSTRAINT `as_updater_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `agent_schedules_agent_idx` (`agent_id`),
  INDEX `agent_schedules_next_run_idx` (`is_enabled`, `next_run_at`)
);

CREATE TABLE IF NOT EXISTS `agent_runs` (
  `id` varchar(36) NOT NULL,
  `agent_id` varchar(36) NOT NULL,
  `schedule_id` varchar(36) NULL,
  `scope_user_id` int NULL,
  `status` enum('queued','running','completed','failed','skipped','budget_exhausted','dry_run') NOT NULL DEFAULT 'queued',
  `triggered_by` varchar(32) NOT NULL DEFAULT 'schedule',
  `triggered_by_user_id` int NULL,
  `is_dry_run` boolean NOT NULL DEFAULT FALSE,
  `started_at` timestamp NULL DEFAULT NULL,
  `finished_at` timestamp NULL DEFAULT NULL,
  `duration_ms` int NULL,
  `items_processed` int NOT NULL DEFAULT 0,
  `items_created` int NOT NULL DEFAULT 0,
  `items_updated` int NOT NULL DEFAULT 0,
  `items_skipped` int NOT NULL DEFAULT 0,
  `tokens_used` int NOT NULL DEFAULT 0,
  `cost_usd` double NOT NULL DEFAULT 0,
  `model_used` varchar(64) NULL,
  `error_message` text NULL,
  `error_stack` text NULL,
  `output` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `agent_runs_pk` PRIMARY KEY (`id`),
  CONSTRAINT `ar_agent_fk` FOREIGN KEY (`agent_id`) REFERENCES `agent_registry`(`id`) ON DELETE CASCADE,
  CONSTRAINT `ar_schedule_fk` FOREIGN KEY (`schedule_id`) REFERENCES `agent_schedules`(`id`) ON DELETE SET NULL,
  CONSTRAINT `ar_scope_user_fk` FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `ar_trigger_user_fk` FOREIGN KEY (`triggered_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `agent_runs_agent_idx` (`agent_id`, `created_at`),
  INDEX `agent_runs_schedule_idx` (`schedule_id`, `created_at`),
  INDEX `agent_runs_status_idx` (`status`, `created_at`)
);

-- Seed the canonical 10 agents with default cadences.
-- All ingestion agents start DISABLED so admin must opt in (cost guardrail).
-- IDs are deterministic so the seed is idempotent across migrations.

INSERT IGNORE INTO `agent_registry` (`id`, `name`, `display_name`, `description`, `default_cadence_cron`, `is_user_scoped`, `is_event_driven`, `default_token_cap_usd`, `preferred_model`) VALUES
  ('00000000-0000-4000-a000-000000000001', 'ingestion_rbi_pib', 'Ingestion — RBI / PIB', 'Pull RBI press releases and PIB notifications. High-signal regulator feeds.', '0 */6 * * *', FALSE, FALSE, 50.0, 'claude-haiku-4-5-20251001'),
  ('00000000-0000-4000-a000-000000000002', 'ingestion_mca21_gazette', 'Ingestion — MCA21 / Gazette', 'Pull MCA21 corporate filings and Gazette of India notifications. Slow-moving batch.', '0 2 * * *', FALSE, FALSE, 30.0, 'claude-haiku-4-5-20251001'),
  ('00000000-0000-4000-a000-000000000003', 'ingestion_bse_nse', 'Ingestion — BSE / NSE Filings', 'Post-market disclosure pull from BSE and NSE.', '0 20 * * *', FALSE, FALSE, 40.0, 'claude-haiku-4-5-20251001'),
  ('00000000-0000-4000-a000-000000000004', 'change_detection', 'Change Detection', 'Diff prior 24h of ingested data, emit power_moves for role/board changes.', '0 4 * * *', FALSE, FALSE, 20.0, 'claude-sonnet-4-6'),
  ('00000000-0000-4000-a000-000000000005', 'dedup', 'Deduplication', 'Fuzzy-match new entities against existing graph. Auto-merge on >0.9 confidence.', '* * * * *', FALSE, TRUE, 10.0, 'claude-haiku-4-5-20251001'),
  ('00000000-0000-4000-a000-000000000006', 'enrichment', 'Enrichment', 'Backfill missing fields (titles, photos, source URLs) on partial records.', '0 3 * * 0', FALSE, FALSE, 15.0, 'claude-haiku-4-5-20251001'),
  ('00000000-0000-4000-a000-000000000007', 'path_recompute', 'Path Recompute', 'Re-run cached pathfinder results for opportunities affected by a moved node.', '* * * * *', FALSE, TRUE, 5.0, NULL),
  ('00000000-0000-4000-a000-000000000008', 'brief', 'Pre-Meeting Brief', 'For each user, pre-build briefings for tomorrow''s calendar meetings.', '0 5 * * *', TRUE, FALSE, 25.0, 'claude-sonnet-4-6'),
  ('00000000-0000-4000-a000-000000000009', 'trust_auditor', 'Trust Auditor', 'Demote confidence on facts past expires_at; flag stale roles.', '0 4 * * 0', FALSE, FALSE, 5.0, 'claude-haiku-4-5-20251001'),
  ('00000000-0000-4000-a000-00000000000a', 'digest', 'Daily Digest', 'For each user, assemble Today action feed cards from watches, owned relationships, opportunities.', '0 6 * * *', TRUE, FALSE, 20.0, 'claude-sonnet-4-6');

-- Seed default schedules. Ingestion + change_detection start DISABLED (cost guardrail);
-- admin enables via Agent Operations UI after reviewing cost projections.
-- User-facing agents (digest, brief) start ENABLED so users get value out of the box.

INSERT IGNORE INTO `agent_schedules` (`id`, `agent_id`, `cron_expression`, `is_enabled`, `is_dry_run`, `monthly_token_cap_usd`) VALUES
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', '0 */6 * * *', FALSE, TRUE,  50.0),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000002', '0 2 * * *',   FALSE, TRUE,  30.0),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000003', '0 20 * * *',  FALSE, TRUE,  40.0),
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-000000000004', '0 4 * * *',   FALSE, FALSE, 20.0),
  ('00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-000000000005', '* * * * *',   TRUE,  FALSE, 10.0),
  ('00000000-0000-4000-b000-000000000006', '00000000-0000-4000-a000-000000000006', '0 3 * * 0',   FALSE, FALSE, 15.0),
  ('00000000-0000-4000-b000-000000000007', '00000000-0000-4000-a000-000000000007', '* * * * *',   TRUE,  FALSE, 5.0),
  ('00000000-0000-4000-b000-000000000008', '00000000-0000-4000-a000-000000000008', '0 5 * * *',   TRUE,  FALSE, 25.0),
  ('00000000-0000-4000-b000-000000000009', '00000000-0000-4000-a000-000000000009', '0 4 * * 0',   TRUE,  FALSE, 5.0),
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-00000000000a', '0 6 * * *',   TRUE,  FALSE, 20.0);
