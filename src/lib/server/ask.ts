import type { AskRow } from '../ask-sort';
import type { Db } from './db';
import type { Member } from './db/schema';
import { displayName, isStakeOfficer, listMembers } from './members';
import { memberActivity, weeksAgoLabel, weeksAheadLabel } from './stats';

export interface AskTables { talks: AskRow[]; prayers: AskRow[] }

/** Active ward members who don't decline; stake officers get their talks from the stake but may still pray in their ward. */
export function askTables(db: Db, today: string): AskTables {
	const members = listMembers(db, { activeOnly: true, kind: 'gemeinde' });
	const activity = memberActivity(db, today);
	const row = (m: Member, last: string | null, next: string | null, note: string | null): AskRow => ({
		id: m.id,
		name: displayName(m),
		firstName: m.firstName,
		sortName: `${m.lastName} ${m.firstName}`.trim(),
		lastDate: last,
		nextDate: next,
		label: next ? weeksAheadLabel(next, today) : weeksAgoLabel(last, today),
		planned: next !== null,
		note: note ?? ''
	});
	return {
		talks: members.filter((m) => !m.noTalk && !isStakeOfficer(m)).map((m) => row(m, activity.get(m.id)?.lastTalk ?? null, activity.get(m.id)?.nextTalk ?? null, m.noteTalk)),
		prayers: members
			.filter((m) => !m.noPrayer)
			.map((m) => row(m, activity.get(m.id)?.lastPrayer ?? null, activity.get(m.id)?.nextPrayer ?? null, m.notePrayer))
	};
}
