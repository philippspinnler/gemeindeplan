-- A joint Wednesday now names the side that runs it: the side of its leader, JD when nobody leads yet.
UPDATE `youth_events` SET `joint` = 1, `kind` = (CASE WHEN `kind` = 'basel_wir' THEN 'basel_' ELSE 'gemeinsam_' END) || COALESCE(
	(SELECT `y`.`side` FROM `youth_event_parts` `p` JOIN `youth` `y` ON `y`.`member_id` = `p`.`leader_member_id` WHERE `p`.`event_id` = `youth_events`.`id` AND `p`.`side` = 'both' LIMIT 1),
	'jd'
) WHERE `kind` = 'basel_wir' OR (`kind` = 'aktivitaet' AND `joint` = 1);
