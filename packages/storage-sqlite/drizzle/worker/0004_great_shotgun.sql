CREATE TABLE `worker_engine_invocations` (
	`id` text PRIMARY KEY NOT NULL,
	`worker_id` text NOT NULL,
	`seq` integer NOT NULL,
	`engine_id` text NOT NULL,
	`engine_command` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`cwd` text NOT NULL,
	`input_ref` text,
	`stdout_ref` text,
	`stderr_ref` text,
	`exit_code` integer,
	`signal` text,
	`metadata_json` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `worker_engine_invocations_engine_updated_at_idx` ON `worker_engine_invocations` (`engine_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `worker_engine_invocations_status_updated_at_idx` ON `worker_engine_invocations` (`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `worker_engine_invocations_worker_seq_unique_idx` ON `worker_engine_invocations` (`worker_id`,`seq`);--> statement-breakpoint
CREATE INDEX `worker_engine_invocations_worker_updated_at_idx` ON `worker_engine_invocations` (`worker_id`,`updated_at`);