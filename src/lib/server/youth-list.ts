import { parseIso, todayIso, WEEKDAYS } from '../dates';
import type { Db } from './db';
import { overviewRange } from './overview';
import { ensureYouthEvents, isFifthSunday, listYouthEvents, YOUTH_KIND_LABELS, type YouthEventFull } from './youth';
import { youthPageItems } from './youth-page';
import { YOUTH_GROUP_LABELS } from './youth-people';

export type YouthWeekday = 'sunday' | 'wednesday';

function summary(e: YouthEventFull, side: 'jd' | 'jm'): string | null {
	const part = e.parts.find((p) => p.side === side) ?? e.parts.find((p) => p.side === 'both');
	if (!part) return null;
	const base = e.weekday === 'wednesday' ? part.text : part.leaderGroup ? (YOUTH_GROUP_LABELS[part.leaderGroup] ?? part.leaderGroup) : null;
	if (!base) return null;
	return part.teacher ? `${base} · ${part.teacher.firstName}` : base;
}

/** Rows for one weekday of the youth list: Sundays (classes) or Wednesdays (activities). */
export function youthList(db: Db, url: URL, weekday: YouthWeekday) {
	const today = todayIso();
	ensureYouthEvents(db, today);
	const yearParam = url.searchParams.get('jahr');
	const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
	const range = overviewRange(today, year);
	const rows = listYouthEvents(db, range.from, range.to)
		.filter((e) => e.weekday === weekday)
		.map((e) => {
			const fifth = isFifthSunday(e.event.date) && e.event.kind !== 'erwachsene';
			const d = parseIso(e.event.date);
			const usual = e.event.kind === (weekday === 'sunday' ? 'klasse' : 'aktivitaet');
			return {
				date: e.event.date,
				dateLabel: `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}.`,
				kindLabel: usual ? '' : YOUTH_KIND_LABELS[e.event.kind],
				status: e.status,
				offLabel: e.offLabel,
				jd: summary(e, 'jd'),
				jm: summary(e, 'jm'),
				extra: weekday === 'sunday' ? e.event.topic : e.event.snack,
				thought: e.thought?.firstName ?? null,
				hint: fifth ? '5. Sonntag – Klasse mit Erwachsenen?' : null
			};
		});
	const years: number[] = [];
	for (let y = Number(today.slice(0, 4)) - 1; y <= Number(today.slice(0, 4)) + 1; y++) years.push(y);
	// Same cards as the public youth page, limited to this weekday.
	const next = year ? [] : youthPageItems(db, today, { big: 2, small: 0, weekday }).big;
	return { weekday, rows, years, year, today, next };
}
