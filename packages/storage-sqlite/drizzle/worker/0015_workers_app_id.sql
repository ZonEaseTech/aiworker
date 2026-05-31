ALTER TABLE `workers` RENAME COLUMN `soul_id` TO `app_id`;--> statement-breakpoint
DROP INDEX IF EXISTS `workers_soul_idx`;--> statement-breakpoint
CREATE INDEX `workers_app_idx` ON `workers` (`app_id`);
