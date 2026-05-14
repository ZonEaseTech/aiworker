CREATE TABLE `soul_app_audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` text NOT NULL,
	`action` text NOT NULL,
	`target_kind` text NOT NULL,
	`target` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`worker_id` text,
	`workspace_id` text,
	`session_id` text,
	`operator_id` text,
	`request_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `soul_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `soul_app_audit_app_created_at_idx` ON `soul_app_audit_events` (`app_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `soul_app_audit_context_idx` ON `soul_app_audit_events` (`workspace_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `soul_app_audit_target_idx` ON `soul_app_audit_events` (`target_kind`,`target`);--> statement-breakpoint
CREATE TABLE `soul_app_storage_records` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`worker_id` text,
	`workspace_id` text,
	`session_id` text,
	`operator_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `soul_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `soul_app_storage_app_key_idx` ON `soul_app_storage_records` (`app_id`,`key`);--> statement-breakpoint
CREATE INDEX `soul_app_storage_app_updated_at_idx` ON `soul_app_storage_records` (`app_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `soul_app_storage_namespace_idx` ON `soul_app_storage_records` (`namespace`);--> statement-breakpoint
CREATE INDEX `soul_app_storage_workspace_idx` ON `soul_app_storage_records` (`workspace_id`);