PRAGMA foreign_keys = OFF;
--> statement-breakpoint

CREATE TABLE `series_info` (
  `id` text PRIMARY KEY NOT NULL,
  `tvmaze_id` integer NOT NULL,
  `name` text NOT NULL,
  `image_url` text,
  `premiered_year` integer,
  `genres` text,
  `tvmaze_status` text,
  `summary` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint

INSERT INTO `series_info` (
  `id`, `tvmaze_id`, `name`, `image_url`, `premiered_year`, `genres`,
  `tvmaze_status`, `summary`, `created_at`
)
SELECT
  lower(hex(randomblob(16))), `tvmaze_id`, `name`, `image_url`, `premiered_year`, `genres`,
  `tvmaze_status`, `summary`, min(`created_at`)
FROM `series`
GROUP BY `tvmaze_id`;
--> statement-breakpoint

CREATE UNIQUE INDEX `series_info_tvmaze_idx` ON `series_info` (`tvmaze_id`);
--> statement-breakpoint

CREATE TABLE `series_new` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `series_info_id` text NOT NULL,
  `last_checked_at` integer,
  `last_episode_release_date` text,
  `last_episode_season_number` integer,
  `last_episode_number` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`series_info_id`) REFERENCES `series_info`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

INSERT INTO `series_new` (
  `id`, `user_id`, `series_info_id`, `last_checked_at`, `last_episode_release_date`,
  `last_episode_season_number`, `last_episode_number`, `created_at`
)
SELECT
  s.`id`, s.`user_id`, i.`id`, s.`last_checked_at`, s.`last_episode_release_date`,
  s.`last_episode_season_number`, s.`last_episode_number`, s.`created_at`
FROM `series` s
INNER JOIN `series_info` i ON i.`tvmaze_id` = s.`tvmaze_id`;
--> statement-breakpoint

DROP TABLE `series`;
--> statement-breakpoint
ALTER TABLE `series_new` RENAME TO `series`;
--> statement-breakpoint

CREATE UNIQUE INDEX `series_user_show_idx` ON `series` (`user_id`, `series_info_id`);
--> statement-breakpoint
CREATE INDEX `series_user_idx` ON `series` (`user_id`);
--> statement-breakpoint

PRAGMA foreign_keys = ON;
