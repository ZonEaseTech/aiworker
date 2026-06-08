PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_engine_invocations` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`turn_id` text,
	`seq` integer NOT NULL,
	`engine_id` text NOT NULL,
	`engine_command` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`input_ref` text NOT NULL,
	`summary` text,
	`error` text,
	`metadata_json` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_engine_invocations`("id", "session_id", "turn_id", "seq", "engine_id", "engine_command", "status", "input_ref", "summary", "error", "metadata_json", "started_at", "finished_at", "created_at", "updated_at")
SELECT
	"id",
	"session_id",
	"turn_id",
	"seq",
	"engine_id",
	"engine_command",
	"status",
	CASE
		WHEN "turn_id" IS NULL THEN 'aiworker://sessions/' || "session_id" || '/invocations/' || "id" || '/input'
		ELSE 'aiworker://sessions/' || "session_id" || '/turns/' || "turn_id" || '/input'
	END,
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
CREATE INDEX `engine_invocations_status_updated_at_idx` ON `engine_invocations` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `engine_invocations_turn_idx` ON `engine_invocations` (`turn_id`);
