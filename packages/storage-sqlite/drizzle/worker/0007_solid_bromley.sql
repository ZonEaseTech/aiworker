CREATE TABLE `decision_pipeline_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stage` text NOT NULL,
	`source` text NOT NULL,
	`evaluator` text NOT NULL,
	`reason` text NOT NULL,
	`fallback` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `decision_pipeline_samples_stage_created_at_idx` ON `decision_pipeline_samples` (`stage`,`created_at`);