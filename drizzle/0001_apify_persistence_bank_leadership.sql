CREATE TABLE IF NOT EXISTS `domains` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `parent_domain_id` varchar(36) NULL,
  `description` text NULL,
  `tracked_role_types` json NULL,
  `color` varchar(7) NULL,
  `scraper_config` json NULL,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `domains_id` PRIMARY KEY(`id`),
  CONSTRAINT `domains_name_unique` UNIQUE(`name`)
);

CREATE TABLE IF NOT EXISTS `organizations` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `short_name` varchar(50) NULL,
  `domain_id` varchar(36) NOT NULL,
  `type` enum('bank','company','regulator','industry_body','government','investor','other') NULL,
  `city` varchar(255) NULL,
  `website` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
  CONSTRAINT `org_domain_fk` FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `persons` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `current_title` varchar(255) NULL,
  `current_org_id` varchar(36) NULL,
  `category` enum('banker','corporate','investor','advisor','government','other') NULL,
  `photo_url` text NULL,
  `is_tracked` boolean NOT NULL DEFAULT true,
  `created_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `persons_id` PRIMARY KEY(`id`),
  CONSTRAINT `person_org_fk` FOREIGN KEY (`current_org_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `person_user_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `tenures` (
  `id` varchar(36) NOT NULL,
  `person_id` varchar(36) NOT NULL,
  `org_id` varchar(36) NOT NULL,
  `title` varchar(255) NOT NULL,
  `department` varchar(255) NULL,
  `start_date` date NOT NULL,
  `end_date` date NULL,
  `is_current` boolean NOT NULL DEFAULT false,
  `source` enum('manual','import','auto_scraped','verified_public_source','ai_inferred') NOT NULL DEFAULT 'manual',
  `source_url` text NULL,
  `created_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `tenures_id` PRIMARY KEY(`id`),
  CONSTRAINT `tenure_person_fk` FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `tenure_org_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `tenure_user_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `apify_source_configs` (
  `id` varchar(36) NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` text NULL,
  `capability` varchar(32) NOT NULL,
  `target_type` varchar(32) NOT NULL,
  `actor_id` varchar(255) NULL,
  `actor_task_id` varchar(255) NULL,
  `default_input` json NOT NULL,
  `field_mappings` json NOT NULL,
  `watch_fields` json NOT NULL,
  `run_frequency_cron` varchar(100) NULL,
  `target_organization_id` varchar(36) NULL,
  `target_person_id` varchar(36) NULL,
  `created_by` int NULL,
  `is_active` boolean NOT NULL DEFAULT true,
  `last_run_at` timestamp NULL,
  `last_run_status` varchar(32) NULL,
  `last_run_summary` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `apify_source_configs_id` PRIMARY KEY(`id`),
  CONSTRAINT `asc_org_fk` FOREIGN KEY (`target_organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `asc_person_fk` FOREIGN KEY (`target_person_id`) REFERENCES `persons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `asc_user_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX `apify_source_capability_idx` ON `apify_source_configs` (`capability`, `is_active`);
CREATE INDEX `apify_source_target_org_idx` ON `apify_source_configs` (`target_organization_id`);
CREATE INDEX `apify_source_target_person_idx` ON `apify_source_configs` (`target_person_id`);

CREATE TABLE IF NOT EXISTS `apify_runs` (
  `id` varchar(36) NOT NULL,
  `source_config_id` varchar(36) NULL,
  `capability` varchar(32) NOT NULL,
  `target_type` varchar(32) NOT NULL,
  `actor_id` varchar(255) NULL,
  `actor_task_id` varchar(255) NULL,
  `apify_run_id` varchar(255) NULL,
  `dataset_id` varchar(255) NULL,
  `status` varchar(32) NOT NULL DEFAULT 'ready',
  `query` varchar(255) NULL,
  `start_urls` json NOT NULL,
  `input_payload` json NOT NULL,
  `output_preview` json NOT NULL,
  `normalized_output` json NOT NULL,
  `detected_changes` json NOT NULL,
  `summary` text NULL,
  `item_count` int NOT NULL DEFAULT 0,
  `error_message` text NULL,
  `source_snapshot` json NOT NULL,
  `execution_meta` json NOT NULL,
  `target_organization_id` varchar(36) NULL,
  `target_person_id` varchar(36) NULL,
  `initiated_by` int NULL,
  `started_at` timestamp NULL,
  `finished_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `apify_runs_id` PRIMARY KEY(`id`),
  CONSTRAINT `ar_source_fk` FOREIGN KEY (`source_config_id`) REFERENCES `apify_source_configs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ar_org_fk` FOREIGN KEY (`target_organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ar_person_fk` FOREIGN KEY (`target_person_id`) REFERENCES `persons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ar_user_fk` FOREIGN KEY (`initiated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX `apify_run_source_idx` ON `apify_runs` (`source_config_id`, `created_at`);
CREATE INDEX `apify_run_status_idx` ON `apify_runs` (`status`, `created_at`);
CREATE INDEX `apify_run_target_org_idx` ON `apify_runs` (`target_organization_id`, `created_at`);
CREATE INDEX `apify_run_target_person_idx` ON `apify_runs` (`target_person_id`, `created_at`);

CREATE TABLE IF NOT EXISTS `bank_leadership_records` (
  `id` varchar(36) NOT NULL,
  `organization_id` varchar(36) NULL,
  `apify_run_id` varchar(36) NULL,
  `source_config_id` varchar(36) NULL,
  `role_type` enum('chairman','managing_director','chairman_and_managing_director','executive_director','other') NOT NULL DEFAULT 'other',
  `person_name` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `normalized_title` varchar(255) NULL,
  `bank_name` varchar(255) NOT NULL,
  `bank_type` enum('bank','company','regulator','industry_body','government','investor','other') NULL,
  `source_url` text NOT NULL,
  `source_domain` varchar(255) NULL,
  `source_type` enum('official_bank_website','stock_exchange_filing','regulator_publication','government_release','annual_report','press_release','secondary_reference','unknown') NOT NULL DEFAULT 'unknown',
  `source_published_date` date NULL,
  `source_observed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `source_excerpt` text NULL,
  `source_payload` json NOT NULL,
  `validation_status` enum('pending_review','official_source_confirmed','secondary_source_only','conflict_detected','rejected','imported') NOT NULL DEFAULT 'pending_review',
  `confidence_level` enum('low','medium','high') NOT NULL DEFAULT 'medium',
  `confidence_score` double NULL,
  `validation_notes` text NULL,
  `validation_evidence` json NOT NULL,
  `is_imported` boolean NOT NULL DEFAULT false,
  `imported_person_id` varchar(36) NULL,
  `imported_tenure_id` varchar(36) NULL,
  `created_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `bank_leadership_records_id` PRIMARY KEY(`id`),
  CONSTRAINT `blr_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `blr_run_fk` FOREIGN KEY (`apify_run_id`) REFERENCES `apify_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `blr_source_fk` FOREIGN KEY (`source_config_id`) REFERENCES `apify_source_configs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `blr_person_fk` FOREIGN KEY (`imported_person_id`) REFERENCES `persons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `blr_tenure_fk` FOREIGN KEY (`imported_tenure_id`) REFERENCES `tenures`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `blr_user_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX `bank_leadership_org_idx` ON `bank_leadership_records` (`organization_id`, `validation_status`, `created_at`);
CREATE INDEX `bank_leadership_run_idx` ON `bank_leadership_records` (`apify_run_id`, `created_at`);
CREATE INDEX `bank_leadership_source_idx` ON `bank_leadership_records` (`source_config_id`, `role_type`, `created_at`);
