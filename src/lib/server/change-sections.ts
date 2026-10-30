import { formatDateLong } from '../dates';
import type { Db } from './db';
import { HYMN_SLOTS, type CallingKind, type HymnSlot, type MeetingKind } from './db/schema';
import { spokenName } from './members';
import {
	KIND_LABELS, SLOT_LABELS, loadMeetingFullByDate, membersById, saveAnnouncements, saveCallings, saveConductor, saveGeneral, saveMusic, savePrayers, saveTalks, type CallingRow
} from './meetings';
import type { Action } from './permissions';

export type SectionId = 'sonntag.programm' | 'sonntag.gebete' | 'sonntag.musik' | 'sonntag.leitung';
export interface ChangeRef { section: SectionId; key: string }
export type Area = 'Sonntag' | 'Jugend' | 'Mitglieder' | 'Notizen' | 'Lieder' | 'Einstellungen';

export interface SectionDef {
	area: Area;
	label: string;
	permission: Action;
	/** Current snapshot; null = does not exist. Must be deterministic. */
	read(db: Db, key: string): unknown;
	write?(db: Db, key: string, snapshot: unknown): void;
	/** Resetting a "created" entry deletes the object. */
	deletesCreated?: boolean;
	describe(db: Db, before: unknown, after: unknown): string[];
	target(db: Db, key: string): { label: string; href: string | null };
}

type Line<S> = [label: string, value: (s: S, names: (id: number | null | undefined) => string) => string];

/** One "Label: before → after" line per field that differs; a missing snapshot reads as empty. */
function diff<S>(db: Db, lines: Line<S>[], before: unknown, after: unknown, ids: (s: S) => (number | null | undefined)[] = () => []): string[] {
	const snaps = [before, after].filter((s): s is S => s !== null && s !== undefined);
	const people = membersById(db, snaps.flatMap(ids));
	const names = (id: number | null | undefined) => {
		const m = id == null ? undefined : people.get(id);
		return m ? spokenName(m) : '';
	};
	return lines.flatMap(([label, value]) => {
		const b = before == null ? '' : value(before as S, names);
		const a = after == null ? '' : value(after as S, names);
		return a === b ? [] : [`${label}: ${b || '–'} → ${a || '–'}`];
	});
}

const yes = (v: boolean) => (v ? 'ja' : '');

interface ProgramSnap {
	kind: MeetingKind; theme: string | null; specialNote: string | null; presidingMemberId: number | null; absences: string | null;
	guestMemberId: number | null; chairMemberId: number | null; stakeChanges: boolean;
	talks: { position: number; memberId: number | null; durationMinutes: number | null; confirmed: boolean }[];
	announcements: string[];
	callings: CallingRow[];
}
type PrayerSnap = { position: number; memberId: number | null }[];
interface MusicSnap { hymns: Record<HymnSlot, { number: number | null; freeText: string | null }>; organistMemberId: number | null; musicNote: string | null }

const sunday = (date: string) => ({ label: `Sonntag, ${formatDateLong(date)}`, href: `/sonntag/${date}` });
const meetingId = (db: Db, date: string) => {
	const full = loadMeetingFullByDate(db, date);
	if (!full) throw new Error(`No Sunday ${date}`);
	return full;
};
const callingsOf = (kind: CallingKind) => (s: ProgramSnap) => s.callings.filter((c) => c.kind === kind).map((c) => `${c.personName} (${c.calling})`).join(', ');

const programm: SectionDef = {
	area: 'Sonntag',
	label: 'Programm',
	permission: 'meeting.program',
	read(db, date) {
		const full = loadMeetingFullByDate(db, date);
		if (!full) return null;
		const m = full.meeting;
		return {
			kind: m.kind, theme: m.theme, specialNote: m.specialNote, presidingMemberId: m.presidingMemberId, absences: m.absences,
			guestMemberId: m.guestMemberId, chairMemberId: m.chairMemberId, stakeChanges: m.stakeChanges,
			talks: full.talks.map((t) => ({ position: t.position, memberId: t.member?.id ?? null, durationMinutes: t.durationMinutes, confirmed: t.confirmed })),
			announcements: full.announcements,
			callings: full.callings
		} satisfies ProgramSnap;
	},
	write(db, date, snapshot) {
		const s = snapshot as ProgramSnap;
		const id = meetingId(db, date).meeting.id;
		const { talks, announcements, callings, ...general } = s;
		saveGeneral(db, id, general);
		saveTalks(db, id, talks);
		saveAnnouncements(db, id, announcements);
		saveCallings(db, id, callings);
	},
	describe: (db, before, after) =>
		diff<ProgramSnap>(db, [
			['Art', (s) => KIND_LABELS[s.kind]],
			['Thema', (s) => s.theme ?? ''],
			['Besonderes', (s) => s.specialNote ?? ''],
			['Präsidierend', (s, n) => n(s.presidingMemberId)],
			['Gast', (s, n) => n(s.guestMemberId)],
			['Leitung', (s, n) => n(s.chairMemberId)],
			['Abwesend', (s, n) => (s.absences ?? '').split(',').filter(Boolean).map((id) => n(Number(id))).join(', ')],
			['Pfahl verkündet', (s) => yes(s.stakeChanges)],
			...[1, 2, 3, 4].map((p): Line<ProgramSnap> => [`Ansprache ${p}`, (s, n) => {
				const t = s.talks.find((x) => x.position === p);
				if (!t) return '';
				return [n(t.memberId), t.durationMinutes ? `${t.durationMinutes} Min.` : '', t.confirmed ? 'bestätigt' : ''].filter(Boolean).join(', ');
			}]),
			['Ankündigungen', (s) => s.announcements.join(' / ')],
			['Entlassungen', callingsOf('entlassung')],
			['Berufungen', callingsOf('berufung')]
		], before, after, (s) => [s.presidingMemberId, s.guestMemberId, s.chairMemberId, ...s.talks.map((t) => t.memberId), ...(s.absences ?? '').split(',').filter(Boolean).map(Number)]),
	target: (_db, date) => sunday(date)
};

const gebete: SectionDef = {
	area: 'Sonntag',
	label: 'Gebete',
	permission: 'meeting.prayers',
	read: (db, date) => loadMeetingFullByDate(db, date)?.prayers.map((p) => ({ position: p.position, memberId: p.member?.id ?? null })) ?? null,
	write: (db, date, snapshot) => savePrayers(db, meetingId(db, date).meeting.id, snapshot as PrayerSnap),
	describe: (db, before, after) =>
		diff<PrayerSnap>(db, [1, 2].map((p): Line<PrayerSnap> => [p === 1 ? 'Anfangsgebet' : 'Schlussgebet', (s, n) => n(s.find((x) => x.position === p)?.memberId)]), before, after, (s) => s.map((p) => p.memberId)),
	target: (_db, date) => sunday(date)
};

const musik: SectionDef = {
	area: 'Sonntag',
	label: 'Musik',
	permission: 'meeting.music',
	read(db, date) {
		const full = loadMeetingFullByDate(db, date);
		if (!full) return null;
		const hymns = Object.fromEntries(HYMN_SLOTS.map((slot) => [slot, { number: full.hymns[slot].hymn?.number ?? null, freeText: full.hymns[slot].freeText }]));
		return { hymns, organistMemberId: full.meeting.organistMemberId, musicNote: full.meeting.musicNote } as MusicSnap;
	},
	write(db, date, snapshot) {
		const s = snapshot as MusicSnap;
		const full = meetingId(db, date);
		const hymns = Object.fromEntries(HYMN_SLOTS.map((slot) => [slot, { hymnNumber: s.hymns[slot].number, freeText: s.hymns[slot].freeText }])) as Parameters<typeof saveMusic>[2]['hymns'];
		saveMusic(db, full.meeting.id, { hymns, organistMemberId: s.organistMemberId, conductorMemberId: full.meeting.conductorMemberId, musicNote: s.musicNote });
	},
	describe: (db, before, after) =>
		diff<MusicSnap>(db, [
			...HYMN_SLOTS.map((slot): Line<MusicSnap> => [SLOT_LABELS[slot], (s) => (s.hymns[slot].number ? `Nr. ${s.hymns[slot].number}` : (s.hymns[slot].freeText ?? ''))]),
			['Orgel', (s, n) => n(s.organistMemberId)],
			['Notiz Musik', (s) => s.musicNote ?? '']
		], before, after, (s) => [s.organistMemberId]),
	target: (_db, date) => sunday(date)
};

const leitung: SectionDef = {
	area: 'Sonntag',
	label: 'Dirigent',
	permission: 'meeting.conductor',
	read(db, date) {
		const full = loadMeetingFullByDate(db, date);
		return full ? { conductorMemberId: full.meeting.conductorMemberId } : null;
	},
	write: (db, date, snapshot) => saveConductor(db, meetingId(db, date).meeting.id, (snapshot as { conductorMemberId: number | null }).conductorMemberId),
	describe: (db, before, after) =>
		diff<{ conductorMemberId: number | null }>(db, [['Dirigent', (s, n) => n(s.conductorMemberId)]], before, after, (s) => [s.conductorMemberId]),
	target: (_db, date) => sunday(date)
};

export const SECTIONS: Record<SectionId, SectionDef> = {
	'sonntag.programm': programm,
	'sonntag.gebete': gebete,
	'sonntag.musik': musik,
	'sonntag.leitung': leitung
};
