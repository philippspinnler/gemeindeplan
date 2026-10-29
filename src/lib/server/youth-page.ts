import { randomBytes } from 'node:crypto';
import { addDays, MONTHS_LONG, MONTHS_SHORT, parseIso, WEEKDAYS, WEEKDAYS_LONG } from '../dates';
import type { Db } from './db';
import type { Member, YouthPartSide } from './db/schema';
import { JOINT_KINDS, hasJmTopic, listYouthEvents, YOUTH_KIND_LABELS, type YouthEventFull } from './youth';
import { listBreaks, mergeRuns, YOUTH_BREAK_KIND_LABELS } from './youth-breaks';
import { listAdults, listYouth, YOUTH_GROUP_LABELS } from './youth-people';

export interface YouthPageItem {
	date: string;
	weekday: 'sunday' | 'wednesday' | 'other';
	weekdayLabel: string;
	dateLabel: string;
	shortDate: string;
	/** Last day of a stake or temple date spanning several days. */
	untilLabel: string | null;
	kindLabel: string;
	status: 'off' | 'open' | 'planned';
	offLabel: string | null;
	topic: string | null;
	topicUrl: string | null;
	snack: string | null;
	thoughtName: string | null;
	noSeminar: boolean;
	/** First names of the adults marked present. */
	adults: string | null;
	joint: boolean;
	/** Set when JD and JM have different lessons; the shared topic above is then empty. */
	parts: { side: YouthPartSide; label: 'Junge Damen' | 'Junge Männer' | null; planned: boolean; text: string | null; details: string | null; leaderName: string | null; teacherName: string | null; topic: string | null; topicUrl: string | null }[];
}

const SIDE_LABELS = { jd: 'Junge Damen', jm: 'Junge Männer', both: null } as const;

export const newYouthPageToken = () => randomBytes(18).toString('base64url');

export function shortNames(youth: Member[]): Map<number, string> {
	const count = new Map<string, number>();
	for (const m of youth) count.set(m.firstName, (count.get(m.firstName) ?? 0) + 1);
	return new Map(youth.map((m) => [m.id, (count.get(m.firstName) ?? 0) > 1 ? `${m.firstName} ${m.lastName.charAt(0)}.` : m.firstName]));
}

function labels(date: string) {
	const d = parseIso(date);
	return {
		weekdayLabel: WEEKDAYS_LONG[d.getUTCDay()],
		dateLabel: `${d.getUTCDate()}. ${MONTHS_LONG[d.getUTCMonth()]}`,
		shortDate: `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}. ${MONTHS_SHORT[d.getUTCMonth()]}`
	};
}

function toItem(e: YouthEventFull, names: Map<number, string>): YouthPageItem {
	const date = e.event.date;
	const name = (m: Member | null) => (m ? (names.get(m.id) ?? null) : null);
	const kindLabel = e.status === 'off' ? 'Kein JD/JM' : e.event.joint && !JOINT_KINDS.includes(e.event.kind) ? 'Gemeinsam' : YOUTH_KIND_LABELS[e.event.kind];
	// Both sides are always listed, so an unplanned side is visible as such; with Basel leading there is nothing left to plan.
	const sides: YouthPartSide[] = e.event.joint ? ['both'] : ['jd', 'jm'];
	const split = hasJmTopic(e.event);
	const sideTopic = (side: YouthPartSide) =>
		!split ? { topic: null, topicUrl: null } : side === 'jm' ? { topic: e.event.topicJm, topicUrl: e.event.topicUrlJm } : { topic: e.event.topic, topicUrl: e.event.topicUrl };
	return {
		date, weekday: e.weekday, ...labels(date), untilLabel: null, kindLabel, status: e.status, offLabel: e.offLabel,
		topic: split ? null : e.event.topic, topicUrl: split ? null : e.event.topicUrl, snack: e.event.noSnack ? 'keiner' : e.event.snack, noSeminar: e.event.noSeminar && e.status !== 'off', thoughtName: name(e.thought), adults: e.adults.filter((a) => a.present).map((a) => name(a.member)).filter(Boolean).join(', ') || null, joint: e.event.joint,
		parts: sides.map((side) => {
			const p = e.parts.find((x) => x.side === side);
			const leaderName = p ? (name(p.leader) ?? (p.leaderGroup ? (YOUTH_GROUP_LABELS[p.leaderGroup] ?? p.leaderGroup) : null)) : null;
			const teacherName = name(p?.teacher ?? null);
			const text = p?.text ?? null;
			const topic = sideTopic(side);
			return { side, label: SIDE_LABELS[side], planned: e.event.kind === 'basel' || Boolean(text || leaderName || teacherName || topic.topic || topic.topicUrl), text, details: p?.details ?? null, leaderName, teacherName, ...topic };
		})
	};
}

/**
 * The next `big` dates as cards, then everything up to `days` after the last card as the "Danach" list.
 * Stake and temple dates running before or between the cards become `notices` above them.
 */
export function youthPageItems(db: Db, today: string, opts: { big: number; days: number; weekday?: 'sunday' | 'wednesday' } = { big: 2, days: 31 }): { notices: YouthPageItem[]; big: YouthPageItem[]; small: YouthPageItem[] } {
	// Leaders may give the thought, so their first names are allowed here too (still no last names).
	const names = shortNames([...listYouth(db).map((y) => y.member), ...listAdults(db)]);
	const upcoming = listYouthEvents(db, today, addDays(today, 7 * opts.big + opts.days)).filter((e) => !opts.weekday || e.weekday === opts.weekday);
	const big = upcoming.slice(0, opts.big).map((e) => toItem(e, names));
	const last = addDays(big[big.length - 1]?.date ?? today, opts.days);
	const small = upcoming.slice(opts.big).filter((e) => e.event.date <= last).map((e) => toItem(e, names));
	const events = [...big, ...small];
	const notices: YouthPageItem[] = [];
	const lastBig = big[big.length - 1]?.date ?? today;
	for (const b of mergeRuns(listBreaks(db, today))) {
		const date = b.fromDate < today ? today : b.fromDate;
		const offLabel = b.label ?? YOUTH_BREAK_KIND_LABELS[b.kind];
		if (b.kind === 'ferien' || date > last || events.some((e) => e.date === date && e.status === 'off' && e.offLabel === offLabel)) continue;
		(date <= lastBig ? notices : small).push({
			date, weekday: 'other', ...labels(date), untilLabel: b.toDate > date ? labels(b.toDate).shortDate : null, kindLabel: YOUTH_BREAK_KIND_LABELS[b.kind], status: 'off',
			offLabel, topic: null, topicUrl: null, snack: null, noSeminar: false, thoughtName: null, adults: null, joint: false, parts: []
		});
	}
	small.sort((a, b) => a.date.localeCompare(b.date));
	return { notices, big, small };
}
