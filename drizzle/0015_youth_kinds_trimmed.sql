-- Holidays, stake and temple dates now live in youth_breaks; the Wednesday itself is a plain activity again.
UPDATE `youth_events` SET `kind` = 'aktivitaet', `details` = NULL WHERE `kind` IN ('pfahl', 'tempel', 'ferien', 'keine');--> statement-breakpoint
UPDATE `youth_events` SET `kind` = 'aktivitaet' WHERE `kind` IN ('fireside', 'uebertragung');
