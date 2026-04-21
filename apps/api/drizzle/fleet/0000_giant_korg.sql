CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`worker_id` text,
	`detail` text
);
--> statement-breakpoint
CREATE TABLE `worker_configs` (
	`worker_id` text PRIMARY KEY NOT NULL,
	`config_json` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `worker_secrets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`worker_id` text NOT NULL,
	`key` text NOT NULL,
	`value_enc` text NOT NULL,
	`nonce` text NOT NULL,
	`auth_tag` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `worker_secrets_worker_key_idx` ON `worker_secrets` (`worker_id`,`key`);--> statement-breakpoint
CREATE TABLE `workers` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`container_id` text,
	`container_image` text NOT NULL,
	`config_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workers_slug_unique` ON `workers` (`slug`);