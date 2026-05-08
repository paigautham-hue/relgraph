-- Strategic spine: opportunities, opportunity_links, watches, ownership,
-- provenance, power_moves, digest_cards.
--
-- Convention notes (from prior migrations):
-- - Primary keys are varchar(36) (UUID).
-- - FKs to users(id) use int (legacy users table); ON DELETE SET NULL.
-- - FKs to other entities (persons, organizations, opportunities) use varchar(36).
-- - Timestamps default to CURRENT_TIMESTAMP; updated_at auto-updates.

CREATE TABLE IF NOT EXISTS `opportunities` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text NULL,
  `stage` enum('identify','map','approach','engage','close','maintain','lost') NOT NULL DEFAULT 'identify',
  `domain_id` varchar(36) NOT NULL,
  `owner_id` int NULL,
  `visibility_scope` enum('private','team','org') NOT NULL DEFAULT 'team',
  `momentum_score` int NOT NULL DEFAULT 50,
  `target_close_date` date NULL,
  `last_stage_change_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_activity_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_archived` boolean NOT NULL DEFAULT FALSE,
  `created_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `opportunities_pk` PRIMARY KEY (`id`),
  CONSTRAINT `opp_domain_fk` FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON DELETE CASCADE,
  CONSTRAINT `opp_owner_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `opp_creator_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `opportunities_domain_idx` (`domain_id`, `stage`, `is_archived`),
  INDEX `opportunities_owner_idx` (`owner_id`, `stage`),
  INDEX `opportunities_activity_idx` (`last_activity_at`)
);

CREATE TABLE IF NOT EXISTS `opportunity_links` (
  `id` varchar(36) NOT NULL,
  `opportunity_id` varchar(36) NOT NULL,
  `target_type` enum('person','organization','interaction') NOT NULL,
  `target_id` varchar(36) NOT NULL,
  `role` varchar(64) NULL,
  `note` text NULL,
  `created_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `opp_links_pk` PRIMARY KEY (`id`),
  CONSTRAINT `opp_links_opp_fk` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON DELETE CASCADE,
  CONSTRAINT `opp_links_creator_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `opp_links_opportunity_idx` (`opportunity_id`, `target_type`),
  INDEX `opp_links_target_idx` (`target_type`, `target_id`)
);

CREATE TABLE IF NOT EXISTS `watches` (
  `id` varchar(36) NOT NULL,
  `user_id` int NOT NULL,
  `target_type` enum('person','organization','sector','role') NOT NULL,
  `target_id` varchar(36) NULL,
  `target_label` varchar(255) NOT NULL,
  `is_active` boolean NOT NULL DEFAULT TRUE,
  `notify_digest` boolean NOT NULL DEFAULT TRUE,
  `notify_push` boolean NOT NULL DEFAULT FALSE,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `watches_pk` PRIMARY KEY (`id`),
  CONSTRAINT `watches_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `watches_user_idx` (`user_id`, `is_active`),
  INDEX `watches_target_idx` (`target_type`, `target_id`)
);

CREATE TABLE IF NOT EXISTS `ownership` (
  `id` varchar(36) NOT NULL,
  `person_id` varchar(36) NOT NULL,
  `owner_user_id` int NOT NULL,
  `tier` enum('tier_1','tier_2','tier_3','tier_4') NOT NULL DEFAULT 'tier_2',
  `assigned_by` int NULL,
  `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ownership_pk` PRIMARY KEY (`id`),
  CONSTRAINT `ownership_person_unique` UNIQUE (`person_id`),
  CONSTRAINT `ownership_person_fk` FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON DELETE CASCADE,
  CONSTRAINT `ownership_owner_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `ownership_assigner_fk` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `ownership_person_idx` (`person_id`),
  INDEX `ownership_owner_idx` (`owner_user_id`, `tier`)
);

CREATE TABLE IF NOT EXISTS `provenance` (
  `id` varchar(36) NOT NULL,
  `entity_type` enum('person','organization','tenure','relationship','interaction','reflection','note','intel_field','opportunity','power_move') NOT NULL,
  `entity_id` varchar(36) NOT NULL,
  `field_name` varchar(100) NULL,
  `source_type` enum('voice_capture','text_capture','manual_form','apify_scrape','public_news','rbi_release','pib_release','mca21_filing','sebi_order','bse_filing','nse_filing','gazette_notification','annual_report','press_release','email_forward','csv_import','ai_extraction','team_member','system','unknown') NOT NULL,
  `source_url` text NULL,
  `source_label` varchar(255) NULL,
  `content_hash` varchar(64) NULL,
  `captured_by` int NULL,
  `captured_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confidence` double NULL,
  `verified_by` int NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `metadata` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `provenance_pk` PRIMARY KEY (`id`),
  CONSTRAINT `provenance_capturer_fk` FOREIGN KEY (`captured_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `provenance_verifier_fk` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `provenance_entity_idx` (`entity_type`, `entity_id`),
  INDEX `provenance_hash_idx` (`content_hash`),
  INDEX `provenance_expires_idx` (`expires_at`)
);

CREATE TABLE IF NOT EXISTS `power_moves` (
  `id` varchar(36) NOT NULL,
  `type` enum('role_change','board_appointment','board_exit','committee_appointment','company_formation','regulatory_action','major_filing','public_statement','other') NOT NULL,
  `headline` varchar(500) NOT NULL,
  `summary` text NULL,
  `occurred_at` timestamp NOT NULL,
  `detected_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `primary_person_id` varchar(36) NULL,
  `primary_org_id` varchar(36) NULL,
  `from_org_id` varchar(36) NULL,
  `to_org_id` varchar(36) NULL,
  `from_title` varchar(255) NULL,
  `to_title` varchar(255) NULL,
  `source_url` text NULL,
  `source_type` enum('voice_capture','text_capture','manual_form','apify_scrape','public_news','rbi_release','pib_release','mca21_filing','sebi_order','bse_filing','nse_filing','gazette_notification','annual_report','press_release','email_forward','csv_import','ai_extraction','team_member','system','unknown') NOT NULL DEFAULT 'unknown',
  `agent_run_id` varchar(36) NULL,
  `confidence` double NULL,
  `is_published` boolean NOT NULL DEFAULT TRUE,
  `metadata` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `power_moves_pk` PRIMARY KEY (`id`),
  CONSTRAINT `pm_person_fk` FOREIGN KEY (`primary_person_id`) REFERENCES `persons`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pm_primary_org_fk` FOREIGN KEY (`primary_org_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pm_from_org_fk` FOREIGN KEY (`from_org_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL,
  CONSTRAINT `pm_to_org_fk` FOREIGN KEY (`to_org_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL,
  INDEX `power_moves_person_idx` (`primary_person_id`, `occurred_at`),
  INDEX `power_moves_org_idx` (`primary_org_id`, `occurred_at`),
  INDEX `power_moves_detected_idx` (`detected_at`)
);

CREATE TABLE IF NOT EXISTS `digest_cards` (
  `id` varchar(36) NOT NULL,
  `user_id` int NOT NULL,
  `type` enum('power_move','briefing','follow_up','stale_relationship','new_path','team_intel','opportunity_stall','no_owner','opportunity_momentum','watchlist_hit') NOT NULL,
  `title` varchar(500) NOT NULL,
  `body` text NULL,
  `rank` int NOT NULL DEFAULT 100,
  `related_person_id` varchar(36) NULL,
  `related_org_id` varchar(36) NULL,
  `related_opportunity_id` varchar(36) NULL,
  `related_power_move_id` varchar(36) NULL,
  `action_payload` json NULL,
  `is_dismissed` boolean NOT NULL DEFAULT FALSE,
  `dismissed_at` timestamp NULL DEFAULT NULL,
  `is_actioned` boolean NOT NULL DEFAULT FALSE,
  `actioned_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `digest_cards_pk` PRIMARY KEY (`id`),
  CONSTRAINT `dc_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `dc_person_fk` FOREIGN KEY (`related_person_id`) REFERENCES `persons`(`id`) ON DELETE SET NULL,
  CONSTRAINT `dc_org_fk` FOREIGN KEY (`related_org_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL,
  CONSTRAINT `dc_opp_fk` FOREIGN KEY (`related_opportunity_id`) REFERENCES `opportunities`(`id`) ON DELETE SET NULL,
  CONSTRAINT `dc_pm_fk` FOREIGN KEY (`related_power_move_id`) REFERENCES `power_moves`(`id`) ON DELETE SET NULL,
  INDEX `digest_cards_user_idx` (`user_id`, `is_dismissed`, `rank`),
  INDEX `digest_cards_user_created_idx` (`user_id`, `created_at`),
  INDEX `digest_cards_expires_idx` (`expires_at`)
);
