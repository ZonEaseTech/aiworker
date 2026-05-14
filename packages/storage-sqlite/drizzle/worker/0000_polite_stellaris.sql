CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`session_id` text,
	`turn_id` text,
	`invocation_id` text,
	`path` text NOT NULL,
	`kind` text DEFAULT 'file' NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invocation_id`) REFERENCES `engine_invocations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `artifacts_session_updated_at_idx` ON `artifacts` (`session_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `artifacts_status_updated_at_idx` ON `artifacts` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `artifacts_workspace_updated_at_idx` ON `artifacts` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `engine_invocations` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`seq` integer NOT NULL,
	`engine_id` text NOT NULL,
	`engine_command` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`prompt` text NOT NULL,
	`summary` text,
	`error` text,
	`metadata_json` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `engine_invocations_engine_updated_at_idx` ON `engine_invocations` (`engine_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `engine_invocations_session_seq_idx` ON `engine_invocations` (`session_id`,`seq`);--> statement-breakpoint
CREATE INDEX `engine_invocations_status_updated_at_idx` ON `engine_invocations` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `engine_invocations_turn_idx` ON `engine_invocations` (`turn_id`);--> statement-breakpoint
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
	`session_id` text,
	`turn_id` text,
	`artifact_id` text,
	`verdict` text DEFAULT 'needs_review' NOT NULL,
	`findings_json` text NOT NULL,
	`risks_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reviews_artifact_created_at_idx` ON `reviews` (`artifact_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reviews_session_created_at_idx` ON `reviews` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reviews_workspace_created_at_idx` ON `reviews` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `session_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`turn_id` text,
	`invocation_id` text,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invocation_id`) REFERENCES `engine_invocations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `session_events_session_created_at_idx` ON `session_events` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `session_events_session_seq_idx` ON `session_events` (`session_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_events_session_seq_unique_idx` ON `session_events` (`session_id`,`seq`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`worker_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`capability_template_id` text NOT NULL,
	`title` text NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`metadata_json` text NOT NULL,
	`started_at` text,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_capability_updated_at_idx` ON `sessions` (`capability_template_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `sessions_status_updated_at_idx` ON `sessions` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `sessions_worker_updated_at_idx` ON `sessions` (`worker_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `sessions_workspace_updated_at_idx` ON `sessions` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `turns` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`input` text NOT NULL,
	`response` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `turns_session_seq_idx` ON `turns` (`session_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `turns_session_seq_unique_idx` ON `turns` (`session_id`,`seq`);--> statement-breakpoint
CREATE INDEX `turns_status_updated_at_idx` ON `turns` (`status`,`updated_at`);--> statement-breakpoint
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
CREATE TABLE `workers` (
	`id` text PRIMARY KEY NOT NULL,
	`soul_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`default_engine_id` text,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workers_soul_idx` ON `workers` (`soul_id`);--> statement-breakpoint
CREATE INDEX `workers_status_updated_at_idx` ON `workers` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`worker_id` text NOT NULL,
	`name` text NOT NULL,
	`root_path` text NOT NULL,
	`type` text DEFAULT 'workspace' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`source_pointers_json` text NOT NULL,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_root_path_idx` ON `workspaces` (`root_path`);--> statement-breakpoint
CREATE INDEX `workspaces_status_updated_at_idx` ON `workspaces` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `workspaces_worker_updated_at_idx` ON `workspaces` (`worker_id`,`updated_at`);
