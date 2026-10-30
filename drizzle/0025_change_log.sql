CREATE TABLE `changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`user_id` integer,
	`section` text NOT NULL,
	`key` text NOT NULL,
	`before` text,
	`after` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `changes_section_key` ON `changes` (`section`,`key`,`id`);