CREATE INDEX `agent_tasks_created_at_idx` ON `agent_tasks` (`created_at`);--> statement-breakpoint
CREATE INDEX `conversations_lookup_idx` ON `conversations` (`channel`,`chat_id`,`thread_id`,`status`);--> statement-breakpoint
CREATE INDEX `conversations_last_active_at_idx` ON `conversations` (`last_active_at`);--> statement-breakpoint
CREATE INDEX `cron_jobs_due_idx` ON `cron_jobs` (`enabled`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `evolution_observations_noticed_at_idx` ON `evolution_observations` (`noticed_at`);--> statement-breakpoint
CREATE INDEX `execution_logs_conversation_id_idx` ON `execution_logs` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`);