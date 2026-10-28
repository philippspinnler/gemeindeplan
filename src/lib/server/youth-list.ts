import { parseIso, todayIso, WEEKDAYS } from '../dates';
import type { Db } from './db';
import type { YouthBreak } from './db/schema';
import { overviewRange } from './overview';
import { ensureYouthEvents, isFifthSunday, listYouthEvents, topicLine, YOUTH_AREA_LABELS, YOUTH_KIND_LABELS, type YouthEventFull } from './youth';
import { YOUTH_BREAK_KIND_LABELS } from './youth-breaks';
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

/** Area per side in JD / JM order; one value when both match or the activity is joint. */
export function areaSummary(e: YouthEventFull): string | null {
	const label = (side: 'jd' | 'jm' | 'both') => {
		const a = e.parts.find((p) => p.side === side)?.area;
		return a ? YOUTH_AREA_LABELS[a] : null;
	};
	const both = e.event.joint ? [label('both')] : [label('jd'), label('jm')];
	if (!both.some(Boolean)) return null;
	return [...new Set(both.map((l) => l ?? '–'))].join(' / ');
}

const dayLabel = (iso: string) => {
	const d = parseIso(iso);
	return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
};

/** Text for a Wednesday cancelled by a stake or temple date: when it really takes place and what. */
export function eventOffLabel(b: YouthBreak): string {
	const days = b.toDate === b.fromDate ? dayLabel(b.fromDate) : `${dayLabel(b.fromDate)} – ${dayLabel(b.toDate)}`;
	return b.label ? `${days}: ${b.label}` : days;
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
			const event = e.offBreak && e.offBreak.kind !== 'ferien' ? e.offBreak : null;
			return {
				date: e.event.date,
				dateLabel: `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}.`,
				kindLabel: event ? YOUTH_BREAK_KIND_LABELS[event.kind] : usual ? '' : YOUTH_KIND_LABELS[e.event.kind],
				status: e.status,
				offLabel: event ? eventOffLabel(event) : e.offLabel,
				isEvent: !!event,
				jd: summary(e, 'jd'),
				jm: summary(e, 'jm'),
				extra: weekday === 'sunday' ? topicLine(e.event) : e.event.snack,
				thought: e.thought?.firstName ?? null,
				area: areaSummary(e),
				hint: fifth ? '5. Sonntag – Klasse mit Erwachsenen?' : null
			};
		});
	const years: number[] = [];
	for (let y = Number(today.slice(0, 4)) - 1; y <= Number(today.slice(0, 4)) + 1; y++) years.push(y);
	// Same cards as the public youth page, limited to this weekday.
	const next = year ? [] : youthPageItems(db, today, { big: 2, small: 0, weekday }).big;
	return { weekday, rows, years, year, today, next };
}
