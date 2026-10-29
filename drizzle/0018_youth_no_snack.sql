ALTER TABLE `youth_events` ADD `no_snack` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- "No snack" used to be typed as text.
UPDATE `youth_events` SET `no_snack` = 1, `snack` = NULL WHERE lower(trim(`snack`)) IN ('-', '--', '---', 'kein snack', 'keiner', 'kein');
