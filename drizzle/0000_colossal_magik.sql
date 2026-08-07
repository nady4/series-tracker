CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tvmaze_id` integer NOT NULL,
	`name` text NOT NULL,
	`image_url` text,
	`premiered_year` integer,
	`genres` text,
	`tvmaze_status` text,
	`summary` text,
	`last_checked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_user_show_idx` ON `series` (`user_id`,`tvmaze_id`);--> statement-breakpoint
CREATE INDEX `series_user_idx` ON `series` (`user_id`);--> statement-breakpoint
CREATE TABLE `series_news` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`checked_at` integer NOT NULL,
	`show_status` text,
	`has_next_season_news` integer DEFAULT false NOT NULL,
	`next_season` text,
	`summary` text,
	`sources` text,
	`provider` text,
	`model_used` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `series_news_series_idx` ON `series_news` (`series_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`byok_key_enc` text,
	`byok_base_url` text,
	`byok_model` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);