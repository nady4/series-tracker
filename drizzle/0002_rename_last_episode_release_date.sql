ALTER TABLE `series`
RENAME COLUMN `last_season_release_date` TO `last_episode_release_date`;
--> statement-breakpoint
UPDATE `series` SET `last_episode_release_date` = NULL;
