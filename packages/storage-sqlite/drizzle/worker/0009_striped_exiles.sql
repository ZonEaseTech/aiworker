CREATE TABLE `worker_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text,
	`conversation_id` text,
	`relative_path` text NOT NULL,
	`kind` text DEFAULT 'file' NOT NULL,
	`title` text NOT NULL,
	`mime_type` text,
	`size_bytes` integer,
	`hash` text,
	`source` text DEFAULT 'executor' NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `worker_artifacts_conversation_updated_at_idx` ON `worker_artifacts` (`conversation_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `worker_artifacts_relative_path_idx` ON `worker_artifacts` (`relative_path`);--> statement-breakpoint
CREATE INDEX `worker_artifacts_run_updated_at_idx` ON `worker_artifacts` (`run_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `worker_artifacts_status_updated_at_idx` ON `worker_artifacts` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `worker_artifacts_updated_at_idx` ON `worker_artifacts` (`updated_at`);