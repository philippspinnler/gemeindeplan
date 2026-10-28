-- "Leitung" is no longer a leader group: the youth always lead their Sunday class.
UPDATE `youth_event_parts` SET `leader_group` = NULL WHERE `leader_group` = 'leitung';
