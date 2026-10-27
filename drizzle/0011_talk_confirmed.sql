ALTER TABLE `meeting_talks` ADD `confirmed` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `meeting_talks` SET `confirmed` = 1 WHERE `status` = 'zugesagt';
