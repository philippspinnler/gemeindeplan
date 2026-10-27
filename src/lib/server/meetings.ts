import { createHash } from 'node:crypto';
import { and, asc, desc, eq, gt, gte, inArray, lt, lte } from 'drizzle-orm';
import { addMonths, isSunday, sundaysBetween } from '../dates';
import type { Db } from './db';
import {
	announcements, callings, hymns, meetingHymns, meetingPrayers, meetingTalks, meetings, members,
	HYMN_SLOTS, isFastLike, type CallingKind, type Hymn, type HymnSlot, type Meeting, type MeetingKind, type Member
} from './db/schema';
import { getHymnByNumber } from './hymns';
import { memberQuery } from './members';
import { UserError } from './forms';

export const KIND_LABELS: Record<MeetingKind, string> = {
	normal: 'Normal',
	fastsonntag: 'Fastsonntag',
	dka: 'DKA',
	fhv: 'FHV',
	aek: 'ÄK',
	jd: 'JD',
	jm: 'JM',
	ostern: 'Ostersonntag',
	weihnachten: 'Weihnachtssonntag',
	generalkonferenz: 'Generalkonferenz',
	pfahlkonferenz: 'Pfahlkonferenz',
	gemeindekonferenz: 'Gemeindekonferenz',
	keine: 'Keine Versammlung'
};
export const SLOT_LABELS: Record<HymnSlot, string> = {
	anfang: 'Anfangslied',
	abendmahl: 'Abendmahlslied',
	zwischen: 'Zwischenlied',
	schluss: 'Schlusslied'
};

export function hasProgram(kind: MeetingKind): boolean {
	return kind === 'normal' || isFastLike(kind) || kind === 'ostern' || kind === 'weihnachten' || kind === 'gemeindekonferenz';
}

export interface PrayerRow { position: number; member: Member | null }
export interface TalkRow { position: number; member: Member | null; durationMinutes: number | null; confirmed: boolean }
export interface CallingRow { kind: CallingKind; personName: string; calling: string }
export interface MeetingFull {
	meeting: Meeting;
	presiding: Member | null;
	guest: Member | null;
	chair: Member | null;
	organist: Member | null;
	conductor: Member | null;
	prayers: PrayerRow[];
	talks: TalkRow[];
	hymns: Record<HymnSlot, { hymn: Hymn | null; freeText: string | null }>;
	announcements: string[];
	callings: CallingRow[];
}
export interface PrayerInput { position: number; memberId: number | null }
export interface TalkInput { position: number; memberId: number | null; durationMinutes: number | null; confirmed: boolean }

const nowIso = () => new Date().toISOString();

export function createMeeting(db: Db, date: string): Meeting {
	if (!isSunday(date)) throw new UserError('Datum ist kein Sonntag');
	return db.insert(meetings).values({ date }).returning().get();
}

export function getMeetingByDate(db: Db, date: string): Meeting | undefined {
	return db.select().from(meetings).where(eq(meetings.date, date)).get();
}

export function ensureSundays(db: Db, fromIso: string, months = 12): number {
	const wanted = sundaysBetween(fromIso, addMonths(fromIso, months));
	if (!wanted.length) return 0;
	return db.insert(meetings).values(wanted.map((date) => ({ date }))).onConflictDoNothing().run().changes;
}

export const versionHash = (x: unknown) => createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 12);

export function membersById(db: Db, ids: (number | null | undefined)[]): Map<number, Member> {
	const wanted = [...new Set(ids.filter((x): x is number => typeof x === 'number'))];
	const map = new Map<number, Member>();
	if (wanted.length === 0) return map;
	for (const m of memberQuery(db, inArray(members.id, wanted)).all()) map.set(m.id, m);
	return map;
}

function assemble(db: Db, meeting: Meeting): MeetingFull {
	const prayerRows = db.select().from(meetingPrayers).where(eq(meetingPrayers.meetingId, meeting.id)).orderBy(asc(meetingPrayers.position)).all();
	const talkRows = db.select().from(meetingTalks).where(eq(meetingTalks.meetingId, meeting.id)).orderBy(asc(meetingTalks.position)).all();
	const hymnRows = db
		.select({ slot: meetingHymns.slot, freeText: meetingHymns.freeText, hymn: hymns })
		.from(meetingHymns)
		.leftJoin(hymns, eq(hymns.id, meetingHymns.hymnId))
		.where(eq(meetingHymns.meetingId, meeting.id))
		.all();
	const annRows = db.select().from(announcements).where(eq(announcements.meetingId, meeting.id)).orderBy(asc(announcements.position)).all();
	const callRows = db.select().from(callings).where(eq(callings.meetingId, meeting.id)).orderBy(asc(callings.position)).all();
	const people = membersById(db, [
		meeting.presidingMemberId, meeting.guestMemberId, meeting.chairMemberId, meeting.organistMemberId, meeting.conductorMemberId,
		...prayerRows.map((p) => p.memberId), ...talkRows.map((t) => t.memberId)
	]);
	const pick = (id: number | null) => (id === null ? null : (people.get(id) ?? null));
	const hymnMap = Object.fromEntries(HYMN_SLOTS.map((s) => [s, { hymn: null, freeText: null }])) as MeetingFull['hymns'];
	for (const r of hymnRows) hymnMap[r.slot] = { hymn: r.hymn ?? null, freeText: r.freeText };
	return {
		meeting,
		presiding: pick(meeting.presidingMemberId),
		guest: pick(meeting.guestMemberId),
		chair: pick(meeting.chairMemberId),
		organist: pick(meeting.organistMemberId),
		conductor: pick(meeting.conductorMemberId),
		prayers: prayerRows.map((p) => ({ position: p.position, member: pick(p.memberId) })),
		talks: talkRows.map((t) => ({ position: t.position, member: pick(t.memberId), durationMinutes: t.durationMinutes, confirmed: t.confirmed })),
		hymns: hymnMap,
		announcements: annRows.map((a) => a.text),
		callings: callRows.map((c) => ({ kind: c.kind, personName: c.personName, calling: c.calling }))
	};
}

export function listMeetings(db: Db, from: string, to: string): MeetingFull[] {
	return db
		.select().from(meetings)
		.where(and(gte(meetings.date, from), lte(meetings.date, to)))
		.orderBy(asc(meetings.date))
		.all()
		.map((m) => assemble(db, m));
}

/** Dates of the previous and next existing Sunday around `date`. */
export function adjacentMeetingDates(db: Db, date: string): { prev: string | null; next: string | null } {
	const prev = db.select({ date: meetings.date }).from(meetings).where(lt(meetings.date, date)).orderBy(desc(meetings.date)).limit(1).get();
	const next = db.select({ date: meetings.date }).from(meetings).where(gt(meetings.date, date)).orderBy(asc(meetings.date)).limit(1).get();
	return { prev: prev?.date ?? null, next: next?.date ?? null };
}

export function loadMeetingFullByDate(db: Db, date: string): MeetingFull | null {
	const m = getMeetingByDate(db, date);
	return m ? assemble(db, m) : null;
}

export function saveGeneral(
	db: Db,
	meetingId: number,
	input: {
		kind: MeetingKind; theme: string | null; specialNote: string | null; presidingMemberId: number | null; absences: string | null;
		guestMemberId?: number | null; chairMemberId?: number | null; stakeChanges?: boolean;
	}
): void {
	db.update(meetings).set({ ...input, updatedAt: nowIso() }).where(eq(meetings.id, meetingId)).run();
}

export function savePrayers(db: Db, meetingId: number, prayers: PrayerInput[]): void {
	db.transaction((tx) => {
		tx.delete(meetingPrayers).where(eq(meetingPrayers.meetingId, meetingId)).run();
		for (const p of prayers) tx.insert(meetingPrayers).values({ meetingId, ...p }).run();
		tx.update(meetings).set({ updatedAt: nowIso() }).where(eq(meetings.id, meetingId)).run();
	});
}

export function saveTalks(db: Db, meetingId: number, talks: TalkInput[]): void {
	db.transaction((tx) => {
		tx.delete(meetingTalks).where(eq(meetingTalks.meetingId, meetingId)).run();
		for (const t of talks) tx.insert(meetingTalks).values({ meetingId, ...t }).run();
		tx.update(meetings).set({ updatedAt: nowIso() }).where(eq(meetings.id, meetingId)).run();
	});
}

export type AskKind = 'talk' | 'prayer';
/** `free` is minutes left for talks, open slots for prayers; `suggest` the talk length to propose. */
export interface OpenSunday { date: string; theme: string | null; free: number; suggest: number | null; position: number; memberIds: number[] }

// 30 minutes for talks, 5 of them kept back because members usually run over.
const TALK_BUDGET = 25;
const MIN_TALK = 5;
const DEFAULT_TALK = 12;
const ASK_POSITIONS: Record<AskKind, number[]> = { talk: [1, 2, 3, 4], prayer: [1, 2] };
const askRows = (full: MeetingFull, kind: AskKind) => (kind === 'talk' ? full.talks : full.prayers);
const freePositions = (full: MeetingFull, kind: AskKind) =>
	ASK_POSITIONS[kind].filter((p) => !askRows(full, kind).some((r) => r.position === p && r.member));
const talkMinutesLeft = (full: MeetingFull) =>
	TALK_BUDGET - full.talks.reduce((sum, t) => sum + (t.member ? (t.durationMinutes ?? DEFAULT_TALK) : 0), 0);

function openFor(full: MeetingFull, kind: AskKind): Omit<OpenSunday, 'date' | 'theme' | 'memberIds'> | null {
	const kindOk = hasProgram(full.meeting.kind) && !(kind === 'talk' && isFastLike(full.meeting.kind));
	const positions = freePositions(full, kind);
	if (!kindOk || positions.length === 0) return null;
	if (kind === 'prayer') return { free: positions.length, suggest: null, position: positions[0] };
	const left = talkMinutesLeft(full);
	return left < MIN_TALK ? null : { free: left, suggest: Math.min(DEFAULT_TALK, left), position: positions[0] };
}

/** Sundays in the range that still have room for a talk or a prayer. */
export function openSundays(db: Db, from: string, to: string, kind: AskKind): OpenSunday[] {
	return listMeetings(db, from, to).flatMap((f) => {
		const open = openFor(f, kind);
		if (!open) return [];
		return [{ date: f.meeting.date, theme: f.meeting.theme, ...open, memberIds: askRows(f, kind).flatMap((r) => (r.member ? [r.member.id] : [])) }];
	});
}

/** Puts the member unconfirmed into the first free slot; false when the Sunday has no room left. */
export function assignOpenSlot(db: Db, date: string, kind: AskKind, memberId: number, minutes: number | null = null): boolean {
	const full = loadMeetingFullByDate(db, date);
	const open = full && openFor(full, kind);
	if (!full || !open) return false;
	const { position } = open;
	if (kind === 'prayer') {
		const rest = full.prayers.filter((p) => p.position !== position).map((p) => ({ position: p.position, memberId: p.member?.id ?? null }));
		savePrayers(db, full.meeting.id, [...rest, { position, memberId }]);
	} else {
		const rest = full.talks.filter((t) => t.position !== position).map((t) => ({ position: t.position, memberId: t.member?.id ?? null, durationMinutes: t.durationMinutes, confirmed: t.confirmed }));
		saveTalks(db, full.meeting.id, [...rest, { position, memberId, durationMinutes: minutes, confirmed: false }]);
	}
	return true;
}

export function saveAnnouncements(db: Db, meetingId: number, texts: string[]): void {
	db.transaction((tx) => {
		tx.delete(announcements).where(eq(announcements.meetingId, meetingId)).run();
		texts.forEach((text, i) => tx.insert(announcements).values({ meetingId, position: i + 1, text }).run());
	});
}

export function saveCallings(db: Db, meetingId: number, items: CallingRow[]): void {
	db.transaction((tx) => {
		tx.delete(callings).where(eq(callings.meetingId, meetingId)).run();
		items.forEach((c, i) => tx.insert(callings).values({ meetingId, position: i + 1, ...c }).run());
	});
}

export function saveMusic(
	db: Db,
	meetingId: number,
	input: {
		hymns: Record<HymnSlot, { hymnNumber: number | null; freeText: string | null }>;
		organistMemberId: number | null;
		conductorMemberId: number | null;
		musicNote: string | null;
	}
): { unknownNumbers: number[] } {
	const meeting = db.select().from(meetings).where(eq(meetings.id, meetingId)).get();
	const isFastSunday = !!meeting && isFastLike(meeting.kind);
	const unknownNumbers: number[] = [];
	db.transaction((tx) => {
		tx.delete(meetingHymns).where(eq(meetingHymns.meetingId, meetingId)).run();
		for (const slot of HYMN_SLOTS) {
			if (slot === 'zwischen' && isFastSunday) continue;
			const { hymnNumber, freeText } = input.hymns[slot];
			let hymnId: number | null = null;
			if (hymnNumber !== null) {
				const h = getHymnByNumber(db, hymnNumber);
				if (h) hymnId = h.id;
				else unknownNumbers.push(hymnNumber);
			}
			if (hymnId !== null || freeText) {
				tx.insert(meetingHymns).values({ meetingId, slot, hymnId, freeText: hymnId !== null ? null : freeText }).run();
			}
		}
		tx.update(meetings)
			.set({ organistMemberId: input.organistMemberId, conductorMemberId: input.conductorMemberId, musicNote: input.musicNote, updatedAt: nowIso() })
			.where(eq(meetings.id, meetingId))
			.run();
	});
	return { unknownNumbers };
}

export function saveConductor(db: Db, meetingId: number, conductorMemberId: number | null): void {
	db.update(meetings).set({ conductorMemberId, updatedAt: nowIso() }).where(eq(meetings.id, meetingId)).run();
}

export type Section = 'program' | 'prayers' | 'music' | 'conductor';

/**
 * Fingerprint per form section of the Sunday page. The form sends it along when saving;
 * if it differs from the current state, someone else changed that section in the meantime.
 */
export function sectionVersions(full: MeetingFull): Record<Section, string> {
	const m = full.meeting;
	const prayers = full.prayers.map((p) => [p.position, p.member?.id ?? null]);
	const music = [Object.values(full.hymns).map((h) => [h.hymn?.number ?? null, h.freeText]), m.organistMemberId, m.conductorMemberId, m.musicNote];
	return {
		program: versionHash([
			m.kind, m.theme, m.specialNote, m.presidingMemberId, m.absences, m.guestMemberId, m.chairMemberId, m.stakeChanges,
			prayers,
			full.talks.map((t) => [t.position, t.member?.id ?? null, t.durationMinutes, t.confirmed]),
			full.announcements,
			full.callings
		]),
		prayers: versionHash(prayers),
		music: versionHash(music),
		conductor: versionHash(m.conductorMemberId)
	};
}
