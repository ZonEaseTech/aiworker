PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `bridge_events` (
	`event_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invocation_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`invocation_id`) REFERENCES `engine_invocations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bridge_events_invocation_created_at_idx` ON `bridge_events` (`invocation_id`,`created_at`);--> statement-breakpoint
DROP TABLE `session_events`;--> statement-breakpoint
DROP TABLE `turns`;--> statement-breakpoint
DROP TABLE `worker_overlay_assets`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_engine_invocations` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`engine_id` text NOT NULL,
	`engine_command` text,
	`invocation_status` text DEFAULT 'queued' NOT NULL,
	`process_state` text DEFAULT 'not_spawned' NOT NULL,
	`projection_receipt_id` text,
	`external_session_ref` text,
	`raw_log_ref` text,
	`event_log_ref` text,
	`failure_code` text,
	`input_ref` text NOT NULL,
	`summary` text,
	`error` text,
	`metadata_json` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_engine_invocations`("id", "session_id", "seq", "engine_id", "engine_command", "invocation_status", "process_state", "projection_receipt_id", "external_session_ref", "raw_log_ref", "event_log_ref", "failure_code", "input_ref", "summary", "error", "metadata_json", "started_at", "finished_at", "created_at", "updated_at")
SELECT
	"id",
	"session_id",
	"seq",
	"engine_id",
	"engine_command",
	"status",
	'not_spawned',
	NULL,
	NULL,
	NULL,
	NULL,
	NULL,
	"input_ref",
	"summary",
	"error",
	"metadata_json",
	"started_at",
	"finished_at",
	"created_at",
	"updated_at"
FROM `engine_invocations`;--> statement-breakpoint
DROP TABLE `engine_invocations`;--> statement-breakpoint
ALTER TABLE `__new_engine_invocations` RENAME TO `engine_invocations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `engine_invocations_engine_updated_at_idx` ON `engine_invocations` (`engine_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `engine_invocations_session_seq_idx` ON `engine_invocations` (`session_id`,`seq`);--> statement-breakpoint
CREATE INDEX `engine_invocations_status_updated_at_idx` ON `engine_invocations` (`invocation_status`,`updated_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_worker_config` (
	`worker_id` text NOT NULL,
	`config_key` text NOT NULL,
	`config_value_json` text NOT NULL,
	`source` text DEFAULT 'cli' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE `worker_config`;--> statement-breakpoint
ALTER TABLE `__new_worker_config` RENAME TO `worker_config`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `worker_config_worker_key_idx` ON `worker_config` (`worker_id`,`config_key`);
