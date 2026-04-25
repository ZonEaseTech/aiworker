CREATE TABLE `cron_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`expression` text NOT NULL,
	`prompt` text NOT NULL,
	`channel` text NOT NULL,
	`chat_id` text NOT NULL,
	`account_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
