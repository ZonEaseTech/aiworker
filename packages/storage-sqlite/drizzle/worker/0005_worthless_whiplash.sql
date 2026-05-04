CREATE TABLE `brain_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_id` text,
	`type` text NOT NULL,
	`ref` text NOT NULL,
	`hash` text,
	`source` text NOT NULL,
	`sensitivity` text DEFAULT 'internal' NOT NULL,
	`retention` text,
	`status` text DEFAULT 'active' NOT NULL,
	`summary` text,
	`evidence_refs` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `brain_artifacts_scope_type_idx` ON `brain_artifacts` (`scope_id`,`type`);--> statement-breakpoint
CREATE INDEX `brain_artifacts_status_type_idx` ON `brain_artifacts` (`status`,`type`);--> statement-breakpoint
CREATE INDEX `brain_artifacts_updated_at_idx` ON `brain_artifacts` (`updated_at`);