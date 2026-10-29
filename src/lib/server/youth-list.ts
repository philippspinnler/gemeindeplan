import { parseIso, todayIso, WEEKDAYS } from '../dates';
import type { Db } from './db';
import type { YouthBreak } from './db/schema';
import { overviewRange } from './overview';
import { ensureYouthEvents, isFifthSunday, listYouthEvents, topicLine, YOUTH_AREA_LABELS, YOUTH_KIND_LABELS, type YouthEventFull } from './youth';
import { listBreaks, mergeRuns, YOUTH_BREAK_KIND_LABELS } from './youth-breaks';
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
	return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}.`;
};

/** What a stake or temple date is, plus its last day when it spans several. */
export function eventText(b: YouthBreak): string {
	const what = b.label ?? YOUTH_BREAK_KIND_LABELS[b.kind];
	return b.toDate === b.fromDate ? what : `${what} (bis ${dayLabel(b.toDate)}${parseIso(b.toDate).getUTCMonth() + 1}.)`;
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
			const usual = e.event.kind === (weekday === 'sunday' ? 'klasse' : 'aktivitaet');
			// The stake or temple date gets a row of its own, so the Wednesday only says it is off.
			const byEvent = e.offBreak && e.offBreak.kind !== 'ferien';
			return {
				date: e.event.date,
				dateLabel: dayLabel(e.event.date),
				kindLabel: usual ? '' : YOUTH_KIND_LABELS[e.event.kind],
				status: e.status,
				offLabel: byEvent ? 'Fällt aus' : e.offLabel,
				href: e.status === 'off' ? null : `/jugend/${e.event.date}`,
				isEvent: false,
				joint: e.event.joint,
				jd: summary(e, 'jd'),
				jm: summary(e, 'jm'),
				extra: weekday === 'sunday' ? topicLine(e.event) : (e.event.noSnack ? 'kein Snack' : e.event.snack),
				thought: e.thought?.firstName ?? null,
				adults: e.adults.filter((a) => a.present).map((a) => a.member.firstName).join(', ') || null,
				area: areaSummary(e),
				hint: fifth ? '5. Sonntag – Klasse mit Erwachsenen?' : null
			};
		});
	if (weekday === 'wednesday') {
		for (const b of mergeRuns(listBreaks(db, range.from))) {
			if (b.kind === 'ferien' || b.fromDate < range.from || b.fromDate > range.to) continue;
			rows.push({
				date: b.fromDate, dateLabel: dayLabel(b.fromDate), kindLabel: YOUTH_BREAK_KIND_LABELS[b.kind], status: 'off', offLabel: eventText(b),
				href: `/jugend/ausfaelle/${b.id}`, isEvent: true, joint: false, jd: null, jm: null, extra: null, thought: null, adults: null, area: null, hint: null
			});
		}
		rows.sort((a, b) => a.date.localeCompare(b.date));
	}
	const years: number[] = [];
	for (let y = Number(today.slice(0, 4)) - 1; y <= Number(today.slice(0, 4)) + 1; y++) years.push(y);
	// Same cards as the public youth page, limited to this weekday.
	const next = year ? [] : youthPageItems(db, today, { big: 2, days: 0, weekday }).big;
	return { weekday, rows, years, year, today, next };
}
