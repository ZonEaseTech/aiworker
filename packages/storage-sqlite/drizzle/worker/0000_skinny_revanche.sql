CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text,
	`path` text NOT NULL,
	`kind` text DEFAULT 'file' NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `artifacts_run_updated_at_idx` ON `artifacts` (`run_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `artifacts_status_updated_at_idx` ON `artifacts` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `artifacts_workspace_updated_at_idx` ON `artifacts` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `briefs_status_updated_at_idx` ON `briefs` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `briefs_workspace_updated_at_idx` ON `briefs` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`path` text NOT NULL,
	`kind` text DEFAULT 'file' NOT NULL,
	`size` integer,
	`mtime` integer,
	`hash` text,
	`source` text DEFAULT 'user' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `files_kind_idx` ON `files` (`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_workspace_path_idx` ON `files` (`workspace_id`,`path`);--> statement-breakpoint
CREATE INDEX `files_workspace_updated_at_idx` ON `files` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`source_review_id` text,
	`statement` text NOT NULL,
	`evidence_json` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lessons_status_updated_at_idx` ON `lessons` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `lessons_workspace_updated_at_idx` ON `lessons` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text,
	`artifact_id` text,
	`verdict` text DEFAULT 'needs_review' NOT NULL,
	`findings_json` text NOT NULL,
	`risks_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reviews_artifact_created_at_idx` ON `reviews` (`artifact_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reviews_run_created_at_idx` ON `reviews` (`run_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reviews_workspace_created_at_idx` ON `reviews` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `run_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_events_run_seq_idx` ON `run_events` (`run_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_events_run_seq_unique_idx` ON `run_events` (`run_id`,`seq`);--> statement-breakpoint
CREATE INDEX `run_events_run_created_at_idx` ON `run_events` (`run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`brief_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`executor` text NOT NULL,
	`prompt` text NOT NULL,
	`summary` text,
	`error` text,
	`metadata_json` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`brief_id`) REFERENCES `briefs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `runs_brief_updated_at_idx` ON `runs` (`brief_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `runs_status_updated_at_idx` ON `runs` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `runs_workspace_updated_at_idx` ON `runs` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `worker_config` (
	`pk` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`config_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `worker_identity` (
	`pk` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`worker_id` text NOT NULL,
	`api_token_enc` text NOT NULL,
	`nonce` text NOT NULL,
	`auth_tag` text NOT NULL,
	`bootstrap_shown_at` text NOT NULL,
	`created_at` text NOT NULL,
	`rotated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `worker_identity_worker_id_unique` ON `worker_identity` (`worker_id`);--> statement-breakpoint
CREATE TABLE `worker_secrets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value_enc` text NOT NULL,
	`nonce` text NOT NULL,
	`auth_tag` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `worker_secrets_key_unique` ON `worker_secrets` (`key`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`root_path` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_root_path_idx` ON `workspaces` (`root_path`);--> statement-breakpoint
CREATE INDEX `workspaces_updated_at_idx` ON `workspaces` (`updated_at`);