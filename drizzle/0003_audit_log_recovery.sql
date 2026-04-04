CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NULL,
  `action_type` enum('view','create','update','delete','search','export','generate_briefing','find_path','voice_query','text_query') NOT NULL,
  `entity_type` enum('person','organization','interaction','reflection','note','tenure','relationship','intel_field','user','domain','external_connection','alert','briefing','chat_conversation','apify_source','apify_run') NOT NULL,
  `entity_id` varchar(36) NULL,
  `field_name` varchar(255) NULL,
  `old_value` text NULL,
  `new_value` text NULL,
  `input_method` enum('voice','text','form','card_scan','auto_scraper','system') NULL,
  `voice_recording_url` text NULL,
  `raw_input_text` text NULL,
  `source_url` text NULL,
  `ai_confidence` double NULL,
  `ip_address` varchar(45) NULL,
  `user_agent` text NULL,
  `session_duration_s` int NULL,
  `metadata` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `audit_log_id` PRIMARY KEY (`id`)
);

CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity_type`, `entity_id`, `created_at`);
CREATE INDEX `audit_user_idx` ON `audit_log` (`user_id`, `created_at`);
CREATE INDEX `audit_action_idx` ON `audit_log` (`action_type`, `created_at`);
