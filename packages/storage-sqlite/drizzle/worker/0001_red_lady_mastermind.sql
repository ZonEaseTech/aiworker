CREATE TABLE `soul_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`protocol` text NOT NULL,
	`soul_id` text NOT NULL,
	`status` text DEFAULT 'installed' NOT NULL,
	`source_kind` text NOT NULL,
	`source_ref` text NOT NULL,
	`manifest_digest` text NOT NULL,
	`manifest_json` text NOT NULL,
	`validation_issues_json` text NOT NULL,
	`health_status` text DEFAULT 'unknown' NOT NULL,
	`health_message` text,
	`installed_at` text NOT NULL,
	`enabled_at` text,
	`disabled_at` text,
	`last_healthcheck_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `soul_apps_manifest_digest_idx` ON `soul_apps` (`manifest_digest`);--> statement-breakpoint
CREATE INDEX `soul_apps_soul_idx` ON `soul_apps` (`soul_id`);--> statement-breakpoint
CREATE INDEX `soul_apps_status_updated_at_idx` ON `soul_apps` (`status`,`updated_at`);--> statement-breakpoint
DROP INDEX `files_workspace_path_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `files_workspace_path_idx` ON `files` (`workspace_id`,`path`);--> statement-breakpoint
DROP INDEX `workers_soul_idx`;--> statement-breakpoint
CREATE INDEX `workers_soul_idx` ON `workers` (`soul_id`);