ALTER TABLE `youth_events` ADD `thought_member_id` integer REFERENCES members(id);--> statement-breakpoint
UPDATE `youth_events` SET `thought_member_id` = (SELECT `thought_member_id` FROM `youth_event_parts` p WHERE p.`event_id` = `youth_events`.`id` AND p.`thought_member_id` IS NOT NULL ORDER BY CASE p.`side` WHEN 'both' THEN 0 WHEN 'jd' THEN 1 ELSE 2 END LIMIT 1);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_youth_event_parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`side` text NOT NULL,
	`text` text,
	`details` text,
	`leader_member_id` integer,
	`leader_group` text,
	`teacher_member_id` integer,
	FOREIGN KEY (`event_id`) REFERENCES `youth_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`leader_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_youth_event_parts`("id", "event_id", "side", "text", "details", "leader_member_id", "leader_group", "teacher_member_id") SELECT "id", "event_id", "side", "text", "details", "leader_member_id", "leader_group", "teacher_member_id" FROM `youth_event_parts`;--> statement-breakpoint
DROP TABLE `youth_event_parts`;--> statement-breakpoint
ALTER TABLE `__new_youth_event_parts` RENAME TO `youth_event_parts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `youth_event_parts_side` ON `youth_event_parts` (`event_id`,`side`);