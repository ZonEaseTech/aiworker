CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`worker_id` text,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `audit_events_worker_id_idx` ON `audit_events` (`worker_id`);--> statement-breakpoint
CREATE TABLE `registered_workers` (
	`id` text PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`display_name` text NOT NULL,
	`api_token_enc` text NOT NULL,
	`nonce` text NOT NULL,
	`auth_tag` text NOT NULL,
	`added_at` text NOT NULL,
	`added_by` text NOT NULL,
	`last_seen_at` text,
	`last_seen_state` text,
	`last_config_version` integer
);
