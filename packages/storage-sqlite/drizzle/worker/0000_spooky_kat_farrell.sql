CREATE TABLE `agent_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt` text NOT NULL,
	`status` text NOT NULL,
	`conversation_id` text,
	`created_at` text NOT NULL,
	`finished_at` text,
	`result` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`channel` text NOT NULL,
	`chat_id` text NOT NULL,
	`thread_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`summary` text,
	`started_at` text NOT NULL,
	`last_active_at` text NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `evolution_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`noticed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `execution_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text,
	`tool_name` text NOT NULL,
	`params` text,
	`result` text,
	`duration` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text,
	`tool_call_id` text,
	`tokens_in` integer,
	`tokens_out` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `skill_bindings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`brain_name` text,
	`skill_name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`config` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_bindings_source_brain_name_idx` ON `skill_bindings` (`source`,`brain_name`,`skill_name`);--> statement-breakpoint
CREATE TABLE `skill_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposed_name` text NOT NULL,
	`source` text NOT NULL,
	`body_markdown` text NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text,
	`decided_by` text
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
CREATE UNIQUE INDEX `worker_secrets_key_unique` ON `worker_secrets` (`key`);