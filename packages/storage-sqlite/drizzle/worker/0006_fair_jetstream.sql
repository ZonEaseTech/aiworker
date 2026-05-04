CREATE TABLE `brain_admission_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposal_id` text NOT NULL,
	`decision` text NOT NULL,
	`decided_by` text NOT NULL,
	`decided_at` text NOT NULL,
	`reason` text,
	`applied_at` text,
	`failure_reason` text,
	FOREIGN KEY (`proposal_id`) REFERENCES `brain_admission_proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `brain_admission_decisions_proposal_id_idx` ON `brain_admission_decisions` (`proposal_id`);--> statement-breakpoint
CREATE INDEX `brain_admission_decisions_decided_at_idx` ON `brain_admission_decisions` (`decided_at`);--> statement-breakpoint
CREATE TABLE `brain_admission_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_id` text,
	`soul_id` text NOT NULL,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`summary` text NOT NULL,
	`evidence` text NOT NULL,
	`risk` text DEFAULT 'high' NOT NULL,
	`confidence` real NOT NULL,
	`rollback` text NOT NULL,
	`payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `brain_admission_proposals_status_kind_idx` ON `brain_admission_proposals` (`status`,`kind`);--> statement-breakpoint
CREATE INDEX `brain_admission_proposals_scope_id_idx` ON `brain_admission_proposals` (`scope_id`);--> statement-breakpoint
CREATE INDEX `brain_admission_proposals_created_at_idx` ON `brain_admission_proposals` (`created_at`);