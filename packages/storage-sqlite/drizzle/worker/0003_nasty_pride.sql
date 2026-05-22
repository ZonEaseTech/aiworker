CREATE TABLE IF NOT EXISTS `worker_overlay_assets` (
	`worker_id` text NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`content` text NOT NULL,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `worker_overlay_assets_worker_kind_target_id_idx` ON `worker_overlay_assets` (`worker_id`,`kind`,`target`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `worker_overlay_assets_worker_kind_idx` ON `worker_overlay_assets` (`worker_id`,`kind`);
