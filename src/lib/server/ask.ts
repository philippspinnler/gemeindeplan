import type { AskRow } from '../ask-sort';
import type { Db } from './db';
import type { Member } from './db/schema';
import { displayName, listMembers } from './members';
import { memberActivity, weeksAgoLabel, weeksAheadLabel } from './stats';

export interface AskTables { talks: AskRow[]; prayers: AskRow[] }

/** Candidates for talks (ward + stake) and prayers (ward only), excluding "does not want" and inactive. */
export function askTables(db: Db, today: string): AskTables {
	const members = listMembers(db, { activeOnly: true });
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
		talks: members.filter((m) => !m.noTalk).map((m) => row(m, activity.get(m.id)?.lastTalk ?? null, activity.get(m.id)?.nextTalk ?? null, m.noteTalk)),
		prayers: members
			.filter((m) => m.kind === 'gemeinde' && !m.noPrayer)
			.map((m) => row(m, activity.get(m.id)?.lastPrayer ?? null, activity.get(m.id)?.nextPrayer ?? null, m.notePrayer))
	};
}
