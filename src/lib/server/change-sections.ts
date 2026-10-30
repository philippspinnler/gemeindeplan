import { and, asc, eq } from 'drizzle-orm';
import { formatDateLong } from '../dates';
import { UserError } from './forms';
import type { Db } from './db';
import {
	HYMN_SLOTS, YOUTH_LEADER_ROLES, hymns, members, stakeCallings, youth, youthBreaks, youthLeaders, youthEventAdults, youthEventParts, youthEvents, youthIdeas,
	type CallingKind, type HymnSlot, type MeetingKind, type MemberKind, type YouthArea, type YouthSide, type YouthBreak, type YouthEventKind, type YouthPartSide
} from './db/schema';
import { BISHOPRIC_ROLE_LABELS, BISHOPRIC_ROLES, getBishopric, setBishopric, type BishopricEntry } from './bishopric';
import { spokenName, updateMember } from './members';
import { getMusicCallings, MUSIC_ROLE_LABELS, MUSIC_ROLES, type MusicRole } from './music-callings';
import { getAllSettings, getSetting, setSetting } from './settings';
import { deleteStakeCalling } from './stake-callings';
import { removeYouth, setLeaders, setYouth, YOUTH_GROUP_LABELS, YOUTH_LEADER_ROLE_LABELS } from './youth-people';
import {
	KIND_LABELS, SLOT_LABELS, loadMeetingFullByDate, versionHash, membersById, saveAnnouncements, saveCallings, saveConductor, saveGeneral, saveMusic, savePrayers, saveTalks, type CallingRow
} from './meetings';
import type { Action } from './permissions';
import { saveYouthPart, YOUTH_AREA_LABELS, YOUTH_KIND_LABELS } from './youth';
import { YOUTH_BREAK_KIND_LABELS } from './youth-breaks';

export type SectionId =
	| 'sonntag.programm' | 'sonntag.gebete' | 'sonntag.musik' | 'sonntag.leitung'
	| 'jugend.gemeinsam' | 'jugend.jd' | 'jugend.jm' | 'jugend.beide' | 'jugend.erwachsene' | 'idee' | 'ausfall'
	| 'mitglied' | 'notiz.ansprache' | 'notiz.gebet' | 'berufungen' | 'jugendliche' | 'pfahlbeamte' | 'lied' | 'einstellungen' | 'jugendseite' | 'import';
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

const sunday = (date: string) => ({ label: formatDateLong(date), href: `/sonntag/${date}` });
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

interface PartSnap { text: string | null; details: string | null; leaderMemberId: number | null; leaderGroup: string | null; area: YouthArea | null; teacherMemberId: number | null }
interface CommonSnap {
	kind: YouthEventKind; joint: boolean; details: string | null; topic: string | null; topicUrl: string | null; topicJm: string | null; topicUrlJm: string | null;
	snack: string | null; noSnack: boolean; noSeminar: boolean; thoughtMemberId: number | null;
	parts: (PartSnap & { side: YouthPartSide })[];
}
type AdultsSnap = { memberId: number; present: boolean }[];
type IdeaSnap = { text: string; side: YouthPartSide; note: string | null; plannedEventId: number | null; dismissedAt: string | null };
type BreakSnap = Omit<YouthBreak, 'id'>;

const SIDE_LABELS: Record<YouthPartSide, string> = { jd: 'JD', jm: 'JM', both: 'Gemeinsam' };
const youthDate = (date: string) => ({ label: `Jugend, ${formatDateLong(date)}`, href: `/jugend/${date}` });
const eventOf = (db: Db, date: string) => db.select().from(youthEvents).where(eq(youthEvents.date, date)).get();
const eventIdOf = (db: Db, date: string) => {
	const ev = eventOf(db, date);
	if (!ev) throw new Error(`No youth event ${date}`);
	return ev.id;
};
const partSnap = (p: typeof youthEventParts.$inferSelect): PartSnap => ({
	text: p.text, details: p.details, leaderMemberId: p.leaderMemberId, leaderGroup: p.leaderGroup, area: p.area, teacherMemberId: p.teacherMemberId
});
const partsOf = (db: Db, eventId: number) => db.select().from(youthEventParts).where(eq(youthEventParts.eventId, eventId)).orderBy(asc(youthEventParts.side)).all();

const partLines: Line<PartSnap>[] = [
	['Aktivität', (s) => s.text ?? ''],
	['Details', (s) => s.details ?? ''],
	['Leitung', (s, n) => n(s.leaderMemberId) || (s.leaderGroup ?? '')],
	['Bereich', (s) => (s.area ? YOUTH_AREA_LABELS[s.area] : '')],
	['Lehrer', (s, n) => n(s.teacherMemberId)]
];

const gemeinsam: SectionDef = {
	area: 'Jugend',
	label: 'Allgemein',
	permission: 'youth.common',
	read(db, date) {
		const e = eventOf(db, date);
		if (!e) return null;
		return {
			kind: e.kind, joint: e.joint, details: e.details, topic: e.topic, topicUrl: e.topicUrl, topicJm: e.topicJm, topicUrlJm: e.topicUrlJm,
			snack: e.snack, noSnack: e.noSnack, noSeminar: e.noSeminar, thoughtMemberId: e.thoughtMemberId,
			parts: partsOf(db, e.id).map((p) => ({ side: p.side, ...partSnap(p) }))
		} satisfies CommonSnap;
	},
	// Writes the parts directly: saveYouthCommon would merge or split them again on a joint change.
	write(db, date, snapshot) {
		const { parts, ...fields } = snapshot as CommonSnap;
		const eventId = eventIdOf(db, date);
		db.update(youthEvents).set({ ...fields, updatedAt: new Date().toISOString() }).where(eq(youthEvents.id, eventId)).run();
		db.delete(youthEventParts).where(eq(youthEventParts.eventId, eventId)).run();
		for (const p of parts) db.insert(youthEventParts).values({ eventId, ...p }).run();
	},
	describe: (db, before, after) =>
		diff<CommonSnap>(db, [
			['Art', (s) => YOUTH_KIND_LABELS[s.kind]],
			['Gemeinsam', (s) => yes(s.joint)],
			['Details', (s) => s.details ?? ''],
			['Thema', (s) => s.topic ?? ''],
			['Link', (s) => s.topicUrl ?? ''],
			['Thema JM', (s) => s.topicJm ?? ''],
			['Link JM', (s) => s.topicUrlJm ?? ''],
			['Snack', (s) => (s.noSnack ? 'kein Snack' : (s.snack ?? ''))],
			['Kein Seminar', (s) => yes(s.noSeminar)],
			['Gedanke', (s, n) => n(s.thoughtMemberId)],
			...(['jd', 'jm', 'both'] as const).map((side): Line<CommonSnap> => [SIDE_LABELS[side], (s) => s.parts.find((p) => p.side === side)?.text ?? ''])
		], before, after, (s) => [s.thoughtMemberId]),
	target: (_db, date) => youthDate(date)
};

function part(side: YouthPartSide, permission: Action): SectionDef {
	return {
		area: 'Jugend',
		label: SIDE_LABELS[side],
		permission,
		read(db, date) {
			const e = eventOf(db, date);
			if (!e) return null;
			const p = partsOf(db, e.id).find((x) => x.side === side);
			return { part: p ? partSnap(p) : null };
		},
		write(db, date, snapshot) {
			const p = (snapshot as { part: PartSnap | null }).part;
			const eventId = eventIdOf(db, date);
			if (p) saveYouthPart(db, eventId, side, p);
			else db.delete(youthEventParts).where(and(eq(youthEventParts.eventId, eventId), eq(youthEventParts.side, side))).run();
		},
		describe: (db, before, after) =>
			diff<PartSnap>(db, partLines, (before as { part: PartSnap | null } | null)?.part ?? null, (after as { part: PartSnap | null } | null)?.part ?? null, (s) => [s.leaderMemberId, s.teacherMemberId]),
		target: (_db, date) => youthDate(date)
	};
}

const erwachsene: SectionDef = {
	area: 'Jugend',
	label: 'Erwachsene',
	permission: 'youth.common',
	read(db, date) {
		const e = eventOf(db, date);
		if (!e) return null;
		return db.select({ memberId: youthEventAdults.memberId, present: youthEventAdults.present }).from(youthEventAdults)
			.where(eq(youthEventAdults.eventId, e.id)).orderBy(asc(youthEventAdults.memberId)).all() satisfies AdultsSnap;
	},
	write(db, date, snapshot) {
		const eventId = eventIdOf(db, date);
		db.delete(youthEventAdults).where(eq(youthEventAdults.eventId, eventId)).run();
		for (const a of snapshot as AdultsSnap) db.insert(youthEventAdults).values({ eventId, ...a }).run();
	},
	describe(db, before, after) {
		const ids = [...new Set([...((before as AdultsSnap | null) ?? []), ...((after as AdultsSnap | null) ?? [])].map((a) => a.memberId))];
		const people = membersById(db, ids);
		const lines = ids.map((id): Line<AdultsSnap> => [people.has(id) ? spokenName(people.get(id)!) : 'Unbekannt', (s) => {
			const a = s.find((x) => x.memberId === id);
			return a ? (a.present ? 'anwesend' : 'abwesend') : '';
		}]);
		return diff<AdultsSnap>(db, lines, before, after);
	},
	target: (_db, date) => youthDate(date)
};

const idee: SectionDef = {
	area: 'Jugend',
	label: 'Idee',
	permission: 'youth.common',
	read(db, id) {
		const i = db.select().from(youthIdeas).where(eq(youthIdeas.id, Number(id))).get();
		return i ? ({ text: i.text, side: i.side, note: i.note, plannedEventId: i.plannedEventId, dismissedAt: i.dismissedAt } satisfies IdeaSnap) : null;
	},
	write(db, id, snapshot) {
		const { plannedEventId, dismissedAt } = snapshot as IdeaSnap;
		db.update(youthIdeas).set({ plannedEventId, dismissedAt }).where(eq(youthIdeas.id, Number(id))).run();
	},
	describe(db, before, after) {
		const status = (s: IdeaSnap) => {
			if (s.dismissedAt) return 'verworfen';
			if (s.plannedEventId === null) return 'offen';
			const e = db.select({ date: youthEvents.date }).from(youthEvents).where(eq(youthEvents.id, s.plannedEventId)).get();
			return e ? `eingeplant am ${formatDateLong(e.date)}` : 'eingeplant';
		};
		return diff<IdeaSnap>(db, [['Idee', (s) => s.text], ['Notiz', (s) => s.note ?? ''], ['Status', status]], before, after);
	},
	target(db, id) {
		const i = db.select({ text: youthIdeas.text }).from(youthIdeas).where(eq(youthIdeas.id, Number(id))).get();
		return { label: i ? `Idee: ${i.text}` : 'Idee', href: '/jugend/ideen' };
	}
};

const ausfall: SectionDef = {
	area: 'Jugend',
	label: 'Ausfall',
	permission: 'youth.common',
	deletesCreated: true,
	read(db, id) {
		const b = db.select().from(youthBreaks).where(eq(youthBreaks.id, Number(id))).get();
		if (!b) return null;
		const { id: _, ...snap } = b;
		return snap satisfies BreakSnap;
	},
	write(db, id, snapshot) {
		const b = snapshot as BreakSnap | null;
		if (!b) db.delete(youthBreaks).where(eq(youthBreaks.id, Number(id))).run();
		else db.insert(youthBreaks).values({ id: Number(id), ...b }).onConflictDoUpdate({ target: youthBreaks.id, set: b }).run();
	},
	describe: (db, before, after) =>
		diff<BreakSnap>(db, [
			['Art', (s) => YOUTH_BREAK_KIND_LABELS[s.kind]],
			['Bezeichnung', (s) => s.label ?? ''],
			['Von', (s) => formatDateLong(s.fromDate)],
			['Bis', (s) => formatDateLong(s.toDate)],
			['Sagt Aktivität ab', (s) => yes(s.cancels)]
		], before, after),
	target(db, id) {
		const b = db.select().from(youthBreaks).where(eq(youthBreaks.id, Number(id))).get();
		return b ? { label: `Ausfall: ${b.label ?? YOUTH_BREAK_KIND_LABELS[b.kind]}`, href: `/jugend/ausfaelle/${id}` } : { label: 'Ausfall (gelöscht)', href: null };
	}
};

interface MemberSnap { firstName: string; lastName: string; affiliation: string | null; kind: MemberKind; stakeCallingId: number | null; active: boolean; noTalk: boolean; noPrayer: boolean }
interface CallingsSnap { bishopric: BishopricEntry[]; music: Record<MusicRole, number[]>; leaders: { role: string; memberId: number }[] }

const memberRow = (db: Db, id: string) => db.select().from(members).where(eq(members.id, Number(id))).get();
function memberTarget(db: Db, id: string) {
	const m = memberRow(db, id);
	return { label: m ? spokenName(m) : 'Mitglied', href: `/mitglieder/${id}` };
}
const settingsTarget = { label: 'Einstellungen', href: '/einstellungen' };

const mitglied: SectionDef = {
	area: 'Mitglieder',
	label: 'Mitglied',
	permission: 'members.edit',
	read(db, id) {
		const m = memberRow(db, id);
		return m ? ({ firstName: m.firstName, lastName: m.lastName, affiliation: m.affiliation, kind: m.kind, stakeCallingId: m.stakeCallingId, active: m.active, noTalk: m.noTalk, noPrayer: m.noPrayer } satisfies MemberSnap) : null;
	},
	write: (db, id, snapshot) => updateMember(db, Number(id), snapshot as MemberSnap),
	describe: (db, before, after) =>
		diff<MemberSnap>(db, [
			['Vorname', (s) => s.firstName],
			['Nachname', (s) => s.lastName],
			['Zusatz', (s) => s.affiliation ?? ''],
			['Art', (s) => (s.kind === 'pfahl' ? 'Pfahl' : 'Gemeinde')],
			['Pfahlberufung', (s) => (s.stakeCallingId === null ? '' : (db.select({ name: stakeCallings.name }).from(stakeCallings).where(eq(stakeCallings.id, s.stakeCallingId)).get()?.name ?? ''))],
			['Ausgeblendet', (s) => yes(!s.active)],
			['Keine Ansprache', (s) => yes(s.noTalk)],
			['Kein Gebet', (s) => yes(s.noPrayer)]
		], before, after),
	target: memberTarget
};

function notiz(field: 'noteTalk' | 'notePrayer', label: string, permission: Action): SectionDef {
	return {
		area: 'Notizen',
		label,
		permission,
		read: (db, id) => {
			const m = memberRow(db, id);
			return m ? { note: m[field] } : null;
		},
		write: (db, id, snapshot) => updateMember(db, Number(id), { [field]: (snapshot as { note: string | null }).note }),
		describe: (db, before, after) => diff<{ note: string | null }>(db, [[label, (s) => s.note ?? '']], before, after),
		target: memberTarget
	};
}

const berufungen: SectionDef = {
	area: 'Einstellungen',
	label: 'Berufungen',
	permission: 'settings.edit',
	read: (db) => ({
		bishopric: getBishopric(db),
		music: getMusicCallings(db),
		leaders: db.select({ role: youthLeaders.role, memberId: youthLeaders.memberId }).from(youthLeaders).orderBy(asc(youthLeaders.role), asc(youthLeaders.memberId)).all()
	}) satisfies CallingsSnap,
	write(db, _key, snapshot) {
		const s = snapshot as CallingsSnap;
		setBishopric(db, s.bishopric);
		setSetting(db, 'music_callings', JSON.stringify(s.music));
		for (const role of YOUTH_LEADER_ROLES) setLeaders(db, role, s.leaders.filter((l) => l.role === role).map((l) => l.memberId));
	},
	describe: (db, before, after) =>
		diff<CallingsSnap>(db, [
			...BISHOPRIC_ROLES.map((role): Line<CallingsSnap> => [BISHOPRIC_ROLE_LABELS[role], (s, n) => n(s.bishopric.find((e) => e.role === role)?.id)]),
			...MUSIC_ROLES.map((role): Line<CallingsSnap> => [MUSIC_ROLE_LABELS[role], (s, n) => s.music[role].map(n).join(', ')]),
			...YOUTH_LEADER_ROLES.map((role): Line<CallingsSnap> => [YOUTH_LEADER_ROLE_LABELS[role], (s, n) => s.leaders.filter((l) => l.role === role).map((l) => n(l.memberId)).join(', ')])
		], before, after, (s) => [...s.bishopric.map((e) => e.id), ...MUSIC_ROLES.flatMap((r) => s.music[r]), ...s.leaders.map((l) => l.memberId)]),
	target: () => ({ label: 'Berufungen', href: '/einstellungen/berufungen' })
};

const jugendliche: SectionDef = {
	area: 'Einstellungen',
	label: 'Jugendliche',
	permission: 'settings.edit',
	deletesCreated: true,
	read: (db, id) => db.select({ side: youth.side, group: youth.group }).from(youth).where(eq(youth.memberId, Number(id))).get() ?? null,
	write(db, id, snapshot) {
		const s = snapshot as { side: YouthSide; group: string | null } | null;
		if (s) setYouth(db, Number(id), s.side, s.group);
		else removeYouth(db, Number(id));
	},
	describe: (db, before, after) =>
		diff<{ side: YouthSide; group: string | null }>(db, [
			['Jugend', (s) => s.side.toUpperCase()],
			['Gruppe', (s) => (s.group ? (YOUTH_GROUP_LABELS[s.group] ?? s.group) : '')]
		], before, after),
	target: (db, id) => ({ label: memberTarget(db, id).label, href: '/einstellungen/jugendliche' })
};

type StakeSnap = { name: string; presides: boolean; position: number };
const pfahlbeamte: SectionDef = {
	area: 'Einstellungen',
	label: 'Pfahlberufung',
	permission: 'settings.edit',
	deletesCreated: true,
	read(db, id) {
		const c = db.select().from(stakeCallings).where(eq(stakeCallings.id, Number(id))).get();
		return c ? ({ name: c.name, presides: c.presides, position: c.position } satisfies StakeSnap) : null;
	},
	write(db, id, snapshot) {
		const s = snapshot as StakeSnap | null;
		if (!s) {
			if (!deleteStakeCalling(db, Number(id))) throw new UserError('Die Pfahlberufung wird noch verwendet.');
		} else db.insert(stakeCallings).values({ id: Number(id), ...s }).onConflictDoUpdate({ target: stakeCallings.id, set: s }).run();
	},
	describe: (db, before, after) =>
		diff<StakeSnap>(db, [['Name', (s) => s.name], ['Präsidiert', (s) => yes(s.presides)], ['Position', (s) => String(s.position)]], before, after),
	target: () => ({ label: 'Pfahlbeamte', href: '/einstellungen/pfahlbeamte' })
};

type HymnSnap = { title: string; durationSeconds: number | null };
const lied: SectionDef = {
	area: 'Lieder',
	label: 'Lied',
	permission: 'hymns.edit',
	read(db, number) {
		const h = db.select().from(hymns).where(eq(hymns.number, Number(number))).get();
		return h ? ({ title: h.title, durationSeconds: h.durationSeconds } satisfies HymnSnap) : null;
	},
	write(db, number, snapshot) {
		db.update(hymns).set({ ...(snapshot as HymnSnap), updatedAt: new Date().toISOString() }).where(eq(hymns.number, Number(number))).run();
	},
	describe: (db, before, after) =>
		diff<HymnSnap>(db, [['Titel', (s) => s.title], ['Dauer', (s) => (s.durationSeconds ? `${s.durationSeconds} s` : '')]], before, after),
	target: (_db, number) => ({ label: `Lied ${number}`, href: `/lieder/${number}` })
};

const SETTING_LABELS = {
	ward_name: 'Gemeindename',
	youth_wed_start: 'Mittwoch von',
	youth_wed_end: 'Mittwoch bis',
	youth_sun_start: 'Sonntag von',
	youth_sun_end: 'Sonntag bis'
} as const;
type SettingsSnap = Record<keyof typeof SETTING_LABELS, string>;
const SETTING_KEYS = Object.keys(SETTING_LABELS) as (keyof typeof SETTING_LABELS)[];

const einstellungen: SectionDef = {
	area: 'Einstellungen',
	label: 'Allgemein',
	permission: 'settings.edit',
	read(db) {
		const all = getAllSettings(db);
		return Object.fromEntries(SETTING_KEYS.map((k) => [k, all[k]])) as SettingsSnap;
	},
	write(db, _key, snapshot) {
		for (const k of SETTING_KEYS) setSetting(db, k, (snapshot as SettingsSnap)[k]);
	},
	describe: (db, before, after) => diff<SettingsSnap>(db, SETTING_KEYS.map((k): Line<SettingsSnap> => [SETTING_LABELS[k], (s) => s[k]]), before, after),
	target: () => settingsTarget
};

const jugendseite: SectionDef = {
	area: 'Einstellungen',
	label: 'Jugendseiten-Link',
	permission: 'settings.edit',
	// Only a fingerprint: the token itself must not end up in the log.
	read: (db) => ({ token: versionHash(getSetting(db, 'youth_page_token')) }),
	describe: () => ['Link neu erzeugt'],
	target: () => ({ label: 'Jugendseite', href: '/einstellungen/jugendliche' })
};

const importSection: SectionDef = {
	area: 'Einstellungen',
	label: 'Import',
	permission: 'settings.edit',
	read: () => null,
	describe: (_db, _before, after) => [(after as { summary: string }).summary],
	target: () => ({ label: 'Import', href: null })
};

export const SECTIONS: Record<SectionId, SectionDef> = {
	mitglied,
	'notiz.ansprache': notiz('noteTalk', 'Notiz Ansprache', 'notes.talk'),
	'notiz.gebet': notiz('notePrayer', 'Notiz Gebet', 'notes.prayer'),
	berufungen,
	jugendliche,
	pfahlbeamte,
	lied,
	einstellungen,
	jugendseite,
	import: importSection,
	'jugend.gemeinsam': gemeinsam,
	'jugend.jd': part('jd', 'youth.jd'),
	'jugend.jm': part('jm', 'youth.jm'),
	'jugend.beide': part('both', 'youth.common'),
	'jugend.erwachsene': erwachsene,
	idee,
	ausfall,
	'sonntag.programm': programm,
	'sonntag.gebete': gebete,
	'sonntag.musik': musik,
	'sonntag.leitung': leitung
};
