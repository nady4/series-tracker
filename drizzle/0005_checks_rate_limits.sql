ALTER TABLE `series` ADD COLUMN `last_check_attempt_at` integer;
--> statement-breakpoint
ALTER TABLE `series` ADD COLUMN `check_claimed_at` integer;
--> statement-breakpoint
ALTER TABLE `series` ADD COLUMN `check_status` text DEFAULT 'queued' NOT NULL;
--> statement-breakpoint
ALTER TABLE `series` ADD COLUMN `last_check_error` text;
--> statement-breakpoint
CREATE INDEX `series_check_due_idx` ON `series` (`check_status`, `last_check_attempt_at`);
--> statement-breakpoint

ALTER TABLE `series_news` ADD COLUMN `has_changes` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `series_news_series_checked_idx` ON `series_news` (`series_id`, `checked_at`);
--> statement-breakpoint

CREATE TABLE `rate_limits` (
  `key` text PRIMARY KEY NOT NULL,
  `window_start` integer NOT NULL,
  `count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_window_idx` ON `rate_limits` (`window_start`);
