CREATE TABLE IF NOT EXISTS `user_domain_access` (
  `id` varchar(36) NOT NULL,
  `user_id` int NOT NULL,
  `domain_id` varchar(36) NOT NULL,
  `granted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `user_domain_access_pk` PRIMARY KEY (`id`),
  CONSTRAINT `uda_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `uda_domain_fk` FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `org_hierarchy` (
  `id` varchar(36) NOT NULL,
  `parent_org_id` varchar(36) NOT NULL,
  `child_org_id` varchar(36) NOT NULL,
  `relationship_type` enum('subsidiary','department','regional_office','committee') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `org_hierarchy_pk` PRIMARY KEY (`id`),
  CONSTRAINT `org_h_parent_fk` FOREIGN KEY (`parent_org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  CONSTRAINT `org_h_child_fk` FOREIGN KEY (`child_org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `relationships` (
  `id` varchar(36) NOT NULL,
  `source_person_id` varchar(36) NOT NULL,
  `target_person_id` varchar(36) NOT NULL,
  `type` enum('direct','indirect','formal','informal','mentorship','alumni','other') NOT NULL,
  `strength_score` int NOT NULL DEFAULT 50,
  `strength_label` enum('dormant','acquaintance','active','strong','champion') NOT NULL DEFAULT 'acquaintance',
  `last_interaction_at` timestamp NULL DEFAULT NULL,
  `origin_story` text NULL,
  `declared_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `relationships_pk` PRIMARY KEY (`id`),
  CONSTRAINT `rel_source_fk` FOREIGN KEY (`source_person_id`) REFERENCES `persons`(`id`) ON DELETE CASCADE,
  CONSTRAINT `rel_target_fk` FOREIGN KEY (`target_person_id`) REFERENCES `persons`(`id`) ON DELETE CASCADE,
  CONSTRAINT `rel_declared_by_fk` FOREIGN KEY (`declared_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `external_connections` (
  `id` varchar(36) NOT NULL,
  `person_a_id` varchar(36) NOT NULL,
  `person_b_id` varchar(36) NOT NULL,
  `type` enum('alumni','family','mentor_mentee','board_colleague','political_ally','professional','other') NOT NULL,
  `description` text NULL,
  `discovered_by` int NULL,
  `source` enum('team_input','reflection_extracted','auto_scraped') NOT NULL DEFAULT 'team_input',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `external_connections_pk` PRIMARY KEY (`id`),
  CONSTRAINT `ext_person_a_fk` FOREIGN KEY (`person_a_id`) REFERENCES `persons`(`id`) ON DELETE CASCADE,
  CONSTRAINT `ext_person_b_fk` FOREIGN KEY (`person_b_id`) REFERENCES `persons`(`id`) ON DELETE CASCADE,
  CONSTRAINT `ext_discovered_by_fk` FOREIGN KEY (`discovered_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `interactions` (
  `id` varchar(36) NOT NULL,
  `type` enum('one_on_one_meeting','group_meeting','conference','phone_call','meal','event','email','social','other') NOT NULL,
  `occurred_at` timestamp NOT NULL,
  `location` varchar(255) NULL,
  `summary` text NOT NULL,
  `depth_score` int NULL,
  `raw_input_text` text NULL,
  `input_method` enum('voice','text','form','card_scan','auto_scraper','system') NULL,
  `voice_recording_url` text NULL,
  `voice_transcript` text NULL,
  `ai_extracted_summary` text NULL,
  `ai_extracted_actions` json NULL,
  `created_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `interactions_pk` PRIMARY KEY (`id`),
  CONSTRAINT `interactions_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `interaction_participants` (
  `id` varchar(36) NOT NULL,
  `interaction_id` varchar(36) NOT NULL,
  `person_id` varchar(36) NOT NULL,
  `role` enum('attendee','organizer','speaker','host') NOT NULL DEFAULT 'attendee',
  CONSTRAINT `interaction_participants_pk` PRIMARY KEY (`id`),
  CONSTRAINT `ip_interaction_fk` FOREIGN KEY (`interaction_id`) REFERENCES `interactions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `ip_person_fk` FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `reflections` (
  `id` varchar(36) NOT NULL,
  `person_id` varchar(36) NOT NULL,
  `author_id` int NOT NULL,
  `category` enum('strategic_read','personality','network_dynamics','risk_concern','opportunity') NOT NULL,
  `content` text NOT NULL,
  `confidence_level` enum('low','medium','high') NOT NULL DEFAULT 'medium',
  `confidence_basis` text NULL,
  `linked_interaction_id` varchar(36) NULL,
  `linked_opportunity` text NULL,
  `input_method` enum('voice','text','form','card_scan','auto_scraper','system') NULL,
  `voice_recording_url` text NULL,
  `voice_transcript` text NULL,
  `visibility_level` enum('contributor','manager','admin') NOT NULL DEFAULT 'contributor',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `reflections_pk` PRIMARY KEY (`id`),
  CONSTRAINT `reflections_person_fk` FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON DELETE CASCADE,
  CONSTRAINT `reflections_author_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `reflections_interaction_fk` FOREIGN KEY (`linked_interaction_id`) REFERENCES `interactions`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `person_notes` (
  `id` varchar(36) NOT NULL,
  `person_id` varchar(36) NOT NULL,
  `author_id` int NOT NULL,
  `content` text NOT NULL,
  `input_method` enum('voice','text','form','card_scan','auto_scraper','system') NULL,
  `voice_recording_url` text NULL,
  `voice_transcript` text NULL,
  `visibility_level` enum('contributor','manager','admin') NOT NULL DEFAULT 'contributor',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `person_notes_pk` PRIMARY KEY (`id`),
  CONSTRAINT `person_notes_person_fk` FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON DELETE CASCADE,
  CONSTRAINT `person_notes_author_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `person_intel` (
  `id` varchar(36) NOT NULL,
  `person_id` varchar(36) NOT NULL,
  `field_name` varchar(100) NOT NULL,
  `field_value` text NOT NULL,
  `contributed_by` int NOT NULL,
  `input_method` enum('voice','text','form','card_scan','auto_scraper','system') NULL,
  `source_url` text NULL,
  `voice_recording_url` text NULL,
  `voice_transcript` text NULL,
  `ai_confidence` double NULL,
  `last_verified_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `person_intel_pk` PRIMARY KEY (`id`),
  CONSTRAINT `person_intel_person_fk` FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON DELETE CASCADE,
  CONSTRAINT `person_intel_contrib_fk` FOREIGN KEY (`contributed_by`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `alerts` (
  `id` varchar(36) NOT NULL,
  `type` enum('movement_detected','relationship_decay','opportunity','new_person_added','coverage_gap','source_change_detected','source_run_failed','new_lead_discovered') NOT NULL,
  `severity` enum('info','warning','critical') NOT NULL DEFAULT 'info',
  `title` varchar(255) NOT NULL,
  `description` text NULL,
  `person_id` varchar(36) NULL,
  `org_id` varchar(36) NULL,
  `suggested_action` text NULL,
  `is_dismissed` tinyint(1) NOT NULL DEFAULT 0,
  `dismissed_by` int NULL,
  `action_taken` tinyint(1) NOT NULL DEFAULT 0,
  `action_note` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `alerts_pk` PRIMARY KEY (`id`),
  CONSTRAINT `alerts_person_fk` FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON DELETE SET NULL,
  CONSTRAINT `alerts_org_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL,
  CONSTRAINT `alerts_dismissed_by_fk` FOREIGN KEY (`dismissed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `briefings` (
  `id` varchar(36) NOT NULL,
  `person_id` varchar(36) NOT NULL,
  `generated_by` int NOT NULL,
  `content` text NOT NULL,
  `sources_used` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `briefings_pk` PRIMARY KEY (`id`),
  CONSTRAINT `briefings_person_fk` FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON DELETE CASCADE,
  CONSTRAINT `briefings_generated_by_fk` FOREIGN KEY (`generated_by`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `chat_conversations` (
  `id` varchar(36) NOT NULL,
  `user_id` int NOT NULL,
  `title` varchar(255) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `chat_conversations_pk` PRIMARY KEY (`id`),
  CONSTRAINT `chat_conversations_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` varchar(36) NOT NULL,
  `conversation_id` varchar(36) NOT NULL,
  `role` enum('user','assistant','system') NOT NULL,
  `content` text NOT NULL,
  `input_method` enum('voice','text','form','card_scan','auto_scraper','system') NULL,
  `tool_calls` json NULL,
  `sources_used` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `chat_messages_pk` PRIMARY KEY (`id`),
  CONSTRAINT `chat_messages_conversation_fk` FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations`(`id`) ON DELETE CASCADE
);
