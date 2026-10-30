import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { addDays, addMonths, isSunday, parseIso } from '../dates';
import type { Db } from './db';
import {
	meetings, youthEventAdults, youthEventParts, youthEvents,
	YOUTH_PART_SIDES, type Member, type YouthArea, type MeetingKind, type YouthBreak, type YouthEvent, type YouthEventKind, type YouthPartSide
} from './db/schema';
import { hasProgram, KIND_LABELS, membersById, versionHash } from './meetings';
import { breakFor, listBreaks, YOUTH_BREAK_KIND_LABELS } from './youth-breaks';
import { UserError } from './forms';
import { assertRecording } from './recording';

export const YOUTH_KIND_LABELS: Record<YouthEventKind, string> = {
	klasse: 'Klasse',
	erwachsene: 'Klasse mit den Erwachsenen',
	aktivitaet: 'Aktivität',
	gemeinsam_jd: 'Gemeinsam – JD leiten',
	gemeinsam_jm: 'Gemeinsam – JM leiten',
	basel: 'Mit Basel – Basel leitet',
	basel_jd: 'Mit Basel – JD leiten',
	basel_jm: 'Mit Basel – JM leiten'
};
export const YOUTH_AREA_LABELS: Record<YouthArea, string> = { geistig: 'Geistig', sozial: 'Sozial', koerperlich: 'Körperlich', intellektuell: 'Intellektuell' };
export const SUNDAY_KINDS: YouthEventKind[] = ['klasse', 'erwachsene'];
export const WEDNESDAY_KINDS: YouthEventKind[] = ['aktivitaet', 'gemeinsam_jd', 'gemeinsam_jm', 'basel', 'basel_jd', 'basel_jm'];
/** Every Wednesday kind but the plain activity is joint; with Basel leading nobody from the ward is needed. */
export const JOINT_KINDS: YouthEventKind[] = WEDNESDAY_KINDS.filter((k) => k !== 'aktivitaet');
/** The side that runs a joint Wednesday and provides its leader. */
export const leadSide = (kind: YouthEventKind): 'jd' | 'jm' | null => (kind.endsWith('_jd') ? 'jd' : kind.endsWith('_jm') ? 'jm' : null);
export const OFF_KINDS: YouthEventKind[] = ['erwachsene'];

export interface YouthPartFull { side: YouthPartSide; text: string | null; details: string | null; leader: Member | null; leaderGroup: string | null; area: YouthArea | null; teacher: Member | null }
/** Dates without a stored row are synthesized with `event.id = 0` and the weekday default kind. */
export interface YouthEventFull {
	event: YouthEvent;
	thought: Member | null;
	weekday: 'sunday' | 'wednesday';
	parts: YouthPartFull[];
	adults: { member: Member; present: boolean }[];
	meetingKind: MeetingKind | null;
	break: YouthBreak | null;
	status: 'off' | 'open' | 'planned';
	offLabel: string | null;
	/** The holiday or event that cancels this date, if that is why it is off. */
	offBreak: YouthBreak | null;
}
export interface YouthCommonInput { kind: YouthEventKind; joint: boolean; details: string | null; topic: string | null; topicUrl: string | null; topicJm?: string | null; topicUrlJm?: string | null; snack: string | null; noSnack?: boolean; noSeminar?: boolean; thoughtMemberId?: number | null }
export interface YouthPartInput { text: string | null; details?: string | null; leaderMemberId: number | null; leaderGroup: string | null; area?: YouthArea | null; teacherMemberId?: number | null }

const nowIso = () => new Date().toISOString();

/** A separate class gives JM its own lesson only when one is entered; otherwise the topic is shared. */
export const hasJmTopic = (e: Pick<YouthEvent, 'joint' | 'topicJm' | 'topicUrlJm'>) => !e.joint && !!(e.topicJm || e.topicUrlJm);

/** The class topic as one line: shared, or "JD: … / JM: …". */
export const topicLine = (e: Pick<YouthEvent, 'joint' | 'topic' | 'topicJm' | 'topicUrlJm'>) =>
	hasJmTopic(e) ? `JD: ${e.topic ?? '–'} / JM: ${e.topicJm ?? '–'}` : e.topic;

export const isWednesday = (iso: string) => parseIso(iso).getUTCDay() === 3;
const defaultKind = (iso: string): YouthEventKind => (isSunday(iso) ? 'klasse' : 'aktivitaet');

export function youthDatesBetween(from: string, to: string): string[] {
	const out: string[] = [];
	for (let d = from; d <= to; d = addDays(d, 1)) if (isSunday(d) || isWednesday(d)) out.push(d);
	return out;
}

export function isFifthSunday(iso: string): boolean {
	return isSunday(iso) && parseIso(iso).getUTCDate() >= 29;
}

export function classHeld(kind: MeetingKind): boolean {
	return hasProgram(kind) && kind !== 'ostern' && kind !== 'weihnachten';
}

export function ensureYouthEvents(db: Db, fromIso: string, months = 6): number {
	const wanted = youthDatesBetween(fromIso, addMonths(fromIso, months));
	if (!wanted.length) return 0;
	return db.insert(youthEvents).values(wanted.map((date) => ({ date, kind: defaultKind(date) }))).onConflictDoNothing().run().changes;
}

const hasContent = (p: { text: string | null; details: string | null; leader: unknown; leaderGroup: string | null; teacher: unknown }) =>
	Boolean(p.text || p.details || p.leader || p.leaderGroup || p.teacher);

function assemble(db: Db, from: string, to: string, rows: YouthEvent[]): YouthEventFull[] {
	const ids = rows.map((r) => r.id);
	const partRows = ids.length ? db.select().from(youthEventParts).where(inArray(youthEventParts.eventId, ids)).all() : [];
	const adultRows = ids.length ? db.select().from(youthEventAdults).where(inArray(youthEventAdults.eventId, ids)).orderBy(asc(youthEventAdults.id)).all() : [];
	const people = membersById(db, [...partRows.flatMap((p) => [p.leaderMemberId, p.teacherMemberId]), ...rows.map((r) => r.thoughtMemberId), ...adultRows.map((a) => a.memberId)]);
	const pick = (id: number | null) => (id === null ? null : (people.get(id) ?? null));
	const meetingKinds = new Map(db.select({ date: meetings.date, kind: meetings.kind }).from(meetings).where(and(gte(meetings.date, from), lte(meetings.date, to))).all().map((m) => [m.date, m.kind]));
	const breaks = listBreaks(db, from);
	const byDate = new Map(rows.map((r) => [r.date, r]));

	return youthDatesBetween(from, to).map((date) => {
		const event: YouthEvent = byDate.get(date) ?? { id: 0, date, kind: defaultKind(date), joint: false, details: null, topic: null, topicUrl: null, topicJm: null, topicUrlJm: null, snack: null, noSnack: false, noSeminar: false, thoughtMemberId: null, createdAt: '', updatedAt: '' };
		const weekday = isSunday(date) ? 'sunday' : 'wednesday';
		const parts: YouthPartFull[] = partRows
			.filter((p) => p.eventId === event.id)
			.sort((a, b) => YOUTH_PART_SIDES.indexOf(a.side) - YOUTH_PART_SIDES.indexOf(b.side))
			.map((p) => ({ side: p.side, text: p.text, details: p.details, leader: pick(p.leaderMemberId), leaderGroup: p.leaderGroup, area: p.area, teacher: pick(p.teacherMemberId) }));
		const adults = adultRows.filter((a) => a.eventId === event.id).flatMap((a) => (people.has(a.memberId) ? [{ member: people.get(a.memberId)!, present: a.present }] : []));
		const meetingKind = weekday === 'sunday' ? (meetingKinds.get(date) ?? null) : null;
		const brk = weekday === 'wednesday' ? breakFor(breaks, date) : null;
		// A Sunday topic or Basel leading is a plan of its own.
		const planned = parts.some(hasContent) || !!event.thoughtMemberId || (weekday === 'sunday' && !!event.topic) || event.kind === 'basel';
		const isOpen = event.kind === defaultKind(date) && !planned;

		let status: YouthEventFull['status'] = planned ? 'planned' : 'open';
		let offLabel: string | null = null;
		let offBreak: YouthBreak | null = null;
		if (meetingKind && !classHeld(meetingKind)) {
			status = 'off';
			offLabel = KIND_LABELS[meetingKind];
		} else if (OFF_KINDS.includes(event.kind)) {
			status = 'off';
			offLabel = YOUTH_KIND_LABELS[event.kind] + (event.details ? `: ${event.details}` : '');
		} else if (brk && isOpen) {
			status = 'off';
			offLabel = brk.label ?? YOUTH_BREAK_KIND_LABELS[brk.kind];
			offBreak = brk;
		}
		return { event, thought: pick(event.thoughtMemberId), weekday, parts, adults, meetingKind, break: brk, status, offLabel, offBreak };
	});
}

export function loadYouthEvent(db: Db, date: string): YouthEventFull | null {
	const row = db.select().from(youthEvents).where(eq(youthEvents.date, date)).get();
	return row ? assemble(db, date, date, [row])[0] : null;
}

export function listYouthEvents(db: Db, from: string, to: string): YouthEventFull[] {
	const rows = db.select().from(youthEvents).where(and(gte(youthEvents.date, from), lte(youthEvents.date, to))).all();
	return assemble(db, from, to, rows);
}

type Reader = Pick<Db, 'select' | 'update'>;
const touch = (tx: Reader, eventId: number) => tx.update(youthEvents).set({ updatedAt: nowIso() }).where(eq(youthEvents.id, eventId)).run();

function getEvent(db: Reader, eventId: number): YouthEvent {
	const ev = db.select().from(youthEvents).where(eq(youthEvents.id, eventId)).get();
	if (!ev) throw new UserError('Termin nicht gefunden');
	return ev;
}

export function saveYouthCommon(db: Db, eventId: number, input: YouthCommonInput): void {
	assertRecording();
	db.transaction((tx) => {
		const ev = getEvent(tx, eventId);
		tx.update(youthEvents)
			.set({ kind: input.kind, joint: input.joint, details: input.details, topic: input.topic, topicUrl: input.topicUrl, topicJm: input.topicJm ?? null, topicUrlJm: input.topicUrlJm ?? null, snack: input.snack, noSnack: input.noSnack ?? false, noSeminar: input.noSeminar ?? false, thoughtMemberId: input.thoughtMemberId, updatedAt: nowIso() })
			.where(eq(youthEvents.id, eventId))
			.run();
		if (ev.joint === input.joint) return;
		const parts = tx.select().from(youthEventParts).where(eq(youthEventParts.eventId, eventId)).all();
		const bySide = (s: YouthPartSide) => parts.find((p) => p.side === s);
		tx.delete(youthEventParts).where(eq(youthEventParts.eventId, eventId)).run();
		const row = (side: YouthPartSide, p: YouthPartInput) =>
			tx.insert(youthEventParts).values({ eventId, side, text: p.text, details: p.details ?? null, leaderMemberId: p.leaderMemberId, leaderGroup: p.leaderGroup, area: p.area ?? null, teacherMemberId: p.teacherMemberId ?? null }).run();
		if (input.joint) {
			const jd = bySide('jd');
			const jm = bySide('jm');
			if (!jd && !jm) return;
			row('both', {
				text: [jd?.text, jm?.text].filter(Boolean).join('\n') || null,
				details: [jd?.details, jm?.details].filter(Boolean).join('\n') || null,
				leaderMemberId: jd?.leaderMemberId ?? jm?.leaderMemberId ?? null,
				leaderGroup: jd?.leaderGroup ?? jm?.leaderGroup ?? null,
				area: jd?.area ?? jm?.area ?? null,
				teacherMemberId: jd?.teacherMemberId ?? jm?.teacherMemberId ?? null
			});
		} else {
			const both = bySide('both');
			if (!both) return;
			row('jd', both);
			row('jm', both);
		}
	});
}

export type ClassTopics = Partial<Pick<YouthEvent, 'topic' | 'topicUrl' | 'topicJm' | 'topicUrlJm'>>;

/** Only topics and links of a Sunday class; joint and the parts stay as they are. */
export function setClassTopics(db: Db, eventId: number, patch: ClassTopics): void {
	assertRecording();
	db.update(youthEvents).set({ ...patch, updatedAt: nowIso() }).where(eq(youthEvents.id, eventId)).run();
}

export function saveYouthPart(db: Db, eventId: number, side: YouthPartSide, input: YouthPartInput): void {
	assertRecording();
	const ev = getEvent(db, eventId);
	if ((side === 'both') !== ev.joint) throw new UserError('Seite passt nicht zum Termin');
	db.transaction((tx) => {
		tx.insert(youthEventParts).values({ eventId, side, ...input })
			.onConflictDoUpdate({ target: [youthEventParts.eventId, youthEventParts.side], set: input })
			.run();
		touch(tx, eventId);
	});
}

export function saveYouthAdults(db: Db, eventId: number, entries: { memberId: number; present: boolean | null }[]): void {
	assertRecording();
	db.transaction((tx) => {
		for (const e of entries) {
			if (e.present === null) {
				tx.delete(youthEventAdults).where(and(eq(youthEventAdults.eventId, eventId), eq(youthEventAdults.memberId, e.memberId))).run();
			} else {
				tx.insert(youthEventAdults).values({ eventId, memberId: e.memberId, present: e.present })
					.onConflictDoUpdate({ target: [youthEventAdults.eventId, youthEventAdults.memberId], set: { present: e.present } })
					.run();
			}
		}
		touch(tx, eventId);
	});
}

export function youthSectionVersions(full: YouthEventFull): Record<'common' | 'jd' | 'jm' | 'both' | 'adults', string> {
	const e = full.event;
	const part = (side: YouthPartSide) => {
		const p = full.parts.find((x) => x.side === side);
		return versionHash(p ? [p.text, p.details, p.leader?.id ?? null, p.leaderGroup, p.area, p.teacher?.id ?? null] : null);
	};
	return {
		common: versionHash([e.kind, e.joint, e.details, e.topic, e.topicUrl, e.topicJm, e.topicUrlJm, e.snack, e.noSnack, e.noSeminar, full.thought?.id ?? null]),
		jd: part('jd'),
		jm: part('jm'),
		both: part('both'),
		adults: versionHash(full.adults.map((a) => [a.member.id, a.present]))
	};
}
