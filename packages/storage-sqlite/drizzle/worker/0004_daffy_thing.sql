CREATE TABLE `session_entries` (
	`session_key` text PRIMARY KEY NOT NULL,
	`current_conversation_id` text NOT NULL,
	`channel` text NOT NULL,
	`chat_id` text NOT NULL,
	`thread_id` text,
	`account_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`session_started_at` text NOT NULL,
	`last_interaction_at` text NOT NULL,
	`reset_at` text,
	`reset_reason` text,
	`context_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens_fresh` integer DEFAULT 0 NOT NULL,
	`compaction_count` integer DEFAULT 0 NOT NULL,
	`memory_flush_at` text,
	`memory_flush_compaction_count` integer DEFAULT 0 NOT NULL,
	`engine_bindings` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`current_conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_entries_current_conversation_id_idx` ON `session_entries` (`current_conversation_id`);--> statement-breakpoint
CREATE INDEX `session_entries_last_interaction_at_idx` ON `session_entries` (`last_interaction_at`);