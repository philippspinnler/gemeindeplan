import { desc, eq, inArray } from 'drizzle-orm';
import { addDays, weeksBetween } from '../dates';
import type { Db } from './db';
import { FAST_LIKE_KINDS, MEETING_KINDS, isFastLike, meetingHymns, meetingPrayers, meetingTalks, meetings, type HymnSlot, type MeetingKind } from './db/schema';
import { SLOT_LABELS, hasProgram, type MeetingFull } from './meetings';

const COUNTED = MEETING_KINDS.filter(hasProgram);
const RATED: MeetingKind[] = ['normal', ...FAST_LIKE_KINDS, 'ostern', 'weihnachten'];

export function isRated(kind: MeetingKind): boolean {
	return RATED.includes(kind);
}

export interface MemberActivity { lastTalk: string | null; lastPrayer: string | null; nextTalk: string | null; nextPrayer: string | null }

export function memberActivity(db: Db, today: string): Map<number, MemberActivity> {
	const out = new Map<number, MemberActivity>();
	const get = (id: number) => {
		let a = out.get(id);
		if (!a) out.set(id, (a = { lastTalk: null, lastPrayer: null, nextTalk: null, nextPrayer: null }));
		return a;
	};
	const talks = db
		.select({ memberId: meetingTalks.memberId, date: meetings.date })
		.from(meetingTalks).innerJoin(meetings, eq(meetings.id, meetingTalks.meetingId))
		.where(inArray(meetings.kind, COUNTED)).all();
	const prayers = db
		.select({ memberId: meetingPrayers.memberId, date: meetings.date })
		.from(meetingPrayers).innerJoin(meetings, eq(meetings.id, meetingPrayers.meetingId))
		.where(inArray(meetings.kind, COUNTED)).all();
	for (const t of talks) {
		if (t.memberId === null) continue;
		const a = get(t.memberId);
		if (t.date <= today) a.lastTalk = a.lastTalk && a.lastTalk > t.date ? a.lastTalk : t.date;
		else a.nextTalk = a.nextTalk && a.nextTalk < t.date ? a.nextTalk : t.date;
	}
	for (const p of prayers) {
		if (p.memberId === null) continue;
		const a = get(p.memberId);
		if (p.date <= today) a.lastPrayer = a.lastPrayer && a.lastPrayer > p.date ? a.lastPrayer : p.date;
		else a.nextPrayer = a.nextPrayer && a.nextPrayer < p.date ? a.nextPrayer : p.date;
	}
	return out;
}

export function weeksAgoLabel(lastDate: string | null, today: string): string {
	if (!lastDate) return 'nie';
	const w = weeksBetween(lastDate, today);
	if (w <= 0) return 'diese Woche';
	if (w === 1) return 'vor 1 Woche';
	return `vor ${w} Wochen`;
}

/** Label for a scheduled date: "diese Woche", "nächste Woche", "in N Wochen". */
export function weeksAheadLabel(nextDate: string, today: string): string {
	const w = weeksBetween(today, nextDate);
	if (w <= 0) return 'diese Woche';
	if (w === 1) return 'nächste Woche';
	return `in ${w} Wochen`;
}

export function memberHistory(db: Db, memberId: number): { date: string; kind: 'talk' | 'prayer'; position: number }[] {
	const talks = db
		.select({ date: meetings.date, position: meetingTalks.position })
		.from(meetingTalks).innerJoin(meetings, eq(meetings.id, meetingTalks.meetingId))
		.where(eq(meetingTalks.memberId, memberId)).all()
		.map((r) => ({ ...r, kind: 'talk' as const }));
	const prayers = db
		.select({ date: meetings.date, position: meetingPrayers.position })
		.from(meetingPrayers).innerJoin(meetings, eq(meetings.id, meetingPrayers.meetingId))
		.where(eq(meetingPrayers.memberId, memberId)).all()
		.map((r) => ({ ...r, kind: 'prayer' as const }));
	return [...talks, ...prayers].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export interface HymnUsage { lastSung: string | null; count52: number; countTotal: number }

export function hymnUsage(db: Db, today: string): Map<number, HymnUsage> {
	const since = addDays(today, -364);
	const rows = db
		.select({ hymnId: meetingHymns.hymnId, date: meetings.date })
		.from(meetingHymns).innerJoin(meetings, eq(meetings.id, meetingHymns.meetingId)).all();
	const out = new Map<number, HymnUsage>();
	for (const r of rows) {
		if (r.hymnId === null || r.date > today) continue;
		let u = out.get(r.hymnId);
		if (!u) out.set(r.hymnId, (u = { lastSung: null, count52: 0, countTotal: 0 }));
		u.countTotal++;
		if (r.date >= since) u.count52++;
		if (!u.lastSung || u.lastSung < r.date) u.lastSung = r.date;
	}
	return out;
}

export function hymnHistory(db: Db, hymnId: number): { date: string; slot: HymnSlot }[] {
	return db
		.select({ date: meetings.date, slot: meetingHymns.slot })
		.from(meetingHymns).innerJoin(meetings, eq(meetings.id, meetingHymns.meetingId))
		.where(eq(meetingHymns.hymnId, hymnId))
		.orderBy(desc(meetings.date)).all();
}

export function readiness(m: MeetingFull): { program: string[]; music: string[] } {
	const kind = m.meeting.kind;
	if (!isRated(kind)) return { program: [], music: [] };
	const program: string[] = [];
	const music: string[] = [];
	if (!m.presiding) program.push('Leitung');
	const prayer = (pos: number) => m.prayers.find((p) => p.position === pos);
	if (!prayer(1)?.member) program.push('Anfangsgebet');
	if (!prayer(2)?.member) program.push('Schlussgebet');
	if (!isFastLike(kind)) {
		const confirmed = m.talks.filter((t) => t.member && t.confirmed).length;
		if (confirmed < 2) program.push(`Ansprachen (${confirmed} von 2 bestätigt)`);
	}
	for (const slot of ['anfang', 'abendmahl', 'schluss'] as const) {
		const h = m.hymns[slot];
		if (!h.hymn && !h.freeText) music.push(SLOT_LABELS[slot]);
	}
	if (!m.organist) music.push('Orgel');
	if (!m.conductor) music.push('Dirigieren');
	return { program, music };
}
