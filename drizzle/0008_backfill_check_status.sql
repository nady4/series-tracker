UPDATE `series`
SET `check_status` = 'checked', `last_check_attempt_at` = `last_checked_at`
WHERE `last_checked_at` IS NOT NULL AND `check_status` = 'queued';
