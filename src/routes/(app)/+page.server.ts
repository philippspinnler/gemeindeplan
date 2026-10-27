import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { formatDateLong, todayIso } from '$lib/dates';
import { adjacentMeetingDates, ensureSundays, listMeetings, loadMeetingFullByDate } from '$lib/server/meetings';
import { overviewRange, summarize } from '$lib/server/overview';
import { can, youthOnly } from '$lib/server/permissions';
import { isWednesday, loadYouthEvent, type YouthEventFull } from '$lib/server/youth';
import { addDays, formatDateShort } from '$lib/dates';

/** Traffic light for the bishopric: is the JM side of this youth event planned? */
function youthTile(date: string, full: YouthEventFull | null, needText: boolean): { date: string; dateLabel: string; state: 'ok' | 'todo' | 'off'; text: string } {
	const dateLabel = formatDateShort(date);
	if (full?.status === 'off') return { date, dateLabel, state: 'off', text: full.offLabel ?? 'fällt aus' };
	const part = full?.parts.find((p) => p.side === 'jm') ?? full?.parts.find((p) => p.side === 'both');
	const missing = [
		...(needText && !part?.text ? ['Aktivität'] : []),
		...(needText ? (part?.leader ? [] : ['Leitung']) : part?.leaderGroup ? [] : ['Leitung']),
		...(needText ? (full?.thought ? [] : ['Gedanke']) : part?.teacher ? [] : ['Lehrer'])
	];
	return missing.length ? { date, dateLabel, state: 'todo', text: `offen: ${missing.join(', ')}` } : { date, dateLabel, state: 'ok', text: 'alles geplant' };
}

export const load: PageServerLoad = ({ locals, url }) => {
	const today = todayIso();
	const role = locals.user!.role;
	const showProgram = can(role, 'program.view');
	if (youthOnly(role)) redirect(303, '/jugend');
	ensureSundays(locals.db, today);
	const showPrayers = can(role, 'meeting.prayers');
	/** Role "Gebete": prayers only, no topics, hymns or music. */
	const showHymns = can(role, 'hymns.view');
	const prayersOnly = showPrayers && !showProgram && !showHymns;
	/** Music and conductor: organ and conducting as separate columns. */
	const musicColumns = showHymns && !showProgram;
	const yearParam = url.searchParams.get('jahr');
	const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
	const range = overviewRange(today, year);
	const meetings = listMeetings(locals.db, range.from, range.to).map((m) => summarize(m, { showProgram, showPrayers }));
	const upcoming = meetings.find((m) => m.date >= today) ?? null;
	const dateParam = url.searchParams.get('datum');
	const picked = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? loadMeetingFullByDate(locals.db, dateParam) : null;
	const next = picked ? summarize(picked, { showProgram, showPrayers }) : upcoming;
	const nav = next ? { ...adjacentMeetingDates(locals.db, next.date), isUpcoming: next.date === upcoming?.date } : null;
	const years: number[] = [];
	for (let y = Number(today.slice(0, 4)) - 1; y <= Number(today.slice(0, 4)) + 1; y++) years.push(y);
	// JM tiles: the class of the shown Sunday and the next Wednesday (from today when showing the upcoming Sunday, else after it).
	let youth: { klasse: ReturnType<typeof youthTile>; aktivitaet: ReturnType<typeof youthTile> } | null = null;
	if (next && showProgram && can(role, 'youth.view')) {
		let wed = picked ? addDays(next.date, 1) : today;
		while (!isWednesday(wed)) wed = addDays(wed, 1);
		youth = {
			klasse: youthTile(next.date, loadYouthEvent(locals.db, next.date), false),
			aktivitaet: youthTile(wed, loadYouthEvent(locals.db, wed), true)
		};
	}
	return {
		youth,
		today,
		year,
		years,
		next,
		nextTitle: next ? formatDateLong(next.date) : null,
		nav,
		meetings,
		role,
		showProgram,
		showHymns,
		prayersOnly,
		musicColumns
	};
};

