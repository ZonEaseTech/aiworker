CREATE TABLE `brain_journal_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text,
	`conversation_id` text,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `brain_journal_events_conversation_created_at_idx` ON `brain_journal_events` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `brain_journal_events_kind_created_at_idx` ON `brain_journal_events` (`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `brain_journal_events_task_created_at_idx` ON `brain_journal_events` (`task_id`,`created_at`);