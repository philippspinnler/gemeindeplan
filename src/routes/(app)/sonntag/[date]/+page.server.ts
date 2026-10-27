import { error, fail, type ActionFailure } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { formatDateLong, isSunday, todayIso } from '$lib/dates';
import { HYMN_SLOTS, MEETING_KINDS, isFastLike, type HymnSlot, type MeetingKind } from '$lib/server/db/schema';
import { optInt, optStr, str, strList } from '$lib/server/forms';
import { hymnLabel, listHymns } from '$lib/server/hymns';
import { displayName, listMembers } from '$lib/server/members';
import { listStakeCallings } from '$lib/server/stake-callings';
import {
	KIND_LABELS, SLOT_LABELS, createMeeting, getMeetingByDate, hasProgram, loadMeetingFullByDate,
	saveAnnouncements, saveCallings, saveConductor, saveGeneral, saveMusic, savePrayers, saveTalks, sectionVersions, type Section, type TalkInput
} from '$lib/server/meetings';
import { can, requireRole } from '$lib/server/permissions';
import { chairFor, formatAbsences, getBishopric, parseAbsences } from '$lib/server/bishopric';
import { memberOptions } from '$lib/server/picker';
import { memberActivity, readiness } from '$lib/server/stats';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isKind = (k: string): k is MeetingKind => (MEETING_KINDS as readonly string[]).includes(k);

function checkDate(date: string) {
	if (!DATE.test(date) || !isSunday(date)) error(404, 'Kein gültiges Sonntagsdatum');
}

const CONFLICT = 'Jemand anderes hat diesen Sonntag inzwischen geändert. Bitte die Seite neu laden, deine letzte Änderung geht dabei verloren.';

/** Load the Sunday and check the form still has the current version of its section. */
function meetingIdFor(locals: App.Locals, date: string, section: Section, fd: FormData): number | ActionFailure<{ error: string }> {
	checkDate(date);
	const full = loadMeetingFullByDate(locals.db, date);
	if (!full) error(404, 'Sonntag nicht gefunden');
	if (str(fd, 'version') !== sectionVersions(full)[section]) return fail(409, { error: CONFLICT });
	return full.meeting.id;
}

export const load: PageServerLoad = ({ locals, params }) => {
	requireRole(locals.user, 'meeting.view');
	const date = params.date;
	checkDate(date);
	const role = locals.user!.role;
	const showProgram = can(role, 'program.view');
	const canMusic = can(role, 'meeting.music');
	const canConductor = can(role, 'meeting.conductor');
	const canPrayers = can(role, 'meeting.prayers');
	const showHymns = can(role, 'hymns.view');
	const base = {
		date,
		dateLabel: formatDateLong(date),
		showProgram,
		canPrayers,
		showHymns,
		canMusic,
		canConductor,
		canPrint: showProgram,
		canCreate: can(role, 'meetings.create')
	};
	const full = loadMeetingFullByDate(locals.db, date);
	if (!full) return { ...base, missing: true as const };

	const today = todayIso();
	const all = listMembers(locals.db);
	const stats = can(role, 'members.stats');
	const activity = stats || canPrayers ? memberActivity(locals.db, today) : new Map();
	const showFourth = full.talks.some((t) => t.position === 4);
	const emptyTalk = (position: number) => ({ position, member: null, durationMinutes: null, confirmed: false });
	const kind = full.meeting.kind;
	const fastLike = isFastLike(kind);
	const hymnSlots = HYMN_SLOTS.filter((slot) => slot !== 'zwischen' || !fastLike);

	const ward = all.filter((m) => m.kind === 'gemeinde');
	const stake = all.filter((m) => m.kind === 'pfahl');
	const bishopricEntries = getBishopric(locals.db);
	const bishopricIds = bishopricEntries.map((e) => e.id);
	const bishopric = ward.filter((m) => bishopricIds.includes(m.id));
	const presidingPool = bishopric.length ? ward.filter((m) => bishopricIds.includes(m.id) || m.id === full.meeting.presidingMemberId) : ward;
	const absences = parseAbsences(full.meeting.absences);
	const callingsById = new Map(listStakeCallings(locals.db).map((c) => [c.id, c]));
	const guest = full.guest;
	const chairAutoId = chairFor({
		bishopric: bishopricEntries,
		absentIds: absences.ids,
		guest: guest ? { id: guest.id, presides: !!(guest.stakeCallingId && callingsById.get(guest.stakeCallingId)?.presides) } : null
	});
	const chairAuto = chairAutoId ? (all.find((m) => m.id === chairAutoId) ?? null) : null;
	const chairPool = [...bishopric, ...stake].filter((m) => m.active || m.id === full.meeting.chairMemberId);
	const r = readiness(full);
	/** Open items per tab, only for roles that can edit them. */
	const open = {
		allgemein: showProgram ? r.program.filter((x) => x === 'Leitung') : [],
		gebete: canPrayers ? r.program.filter((x) => x === 'Anfangsgebet' || x === 'Schlussgebet') : [],
		ansprachen: showProgram ? r.program.filter((x) => x.startsWith('Ansprachen')) : [],
		musik: canMusic ? r.music : canConductor ? r.music.filter((x) => x === 'Dirigieren') : []
	};
	const idByName = new Map(all.map((m) => [displayName(m), m.id]));
	const withMemberId = (c: { personName: string; calling: string }) => ({ personName: c.personName, calling: c.calling, memberId: idByName.get(c.personName) ?? null });

	return {
		...base,
		missing: false as const,
		meeting: {
			kind: full.meeting.kind,
			theme: full.meeting.theme,
			specialNote: full.meeting.specialNote,
			musicNote: full.meeting.musicNote,
			organistMemberId: full.meeting.organistMemberId,
			conductorMemberId: full.meeting.conductorMemberId,
			...(showProgram
				? {
						absenceIds: absences.ids,
						absencesLegacy: absences.legacy,
						presidingMemberId: full.meeting.presidingMemberId,
						guestMemberId: full.meeting.guestMemberId,
						chairMemberId: full.meeting.chairMemberId,
						stakeChanges: full.meeting.stakeChanges
					}
				: {})
		},
		hasProgram: hasProgram(full.meeting.kind),
		versions: sectionVersions(full),
		open,
		fastLike,
		kinds: MEETING_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })),
		organistName: full.organist ? displayName(full.organist) : null,
		conductorName: full.conductor ? displayName(full.conductor) : null,
		presidingOptions: showProgram ? memberOptions(presidingPool, activity, 'plain', today, full.meeting.presidingMemberId) : [],
		guestOptions: showProgram ? memberOptions(stake, activity, 'plain', today, full.meeting.guestMemberId) : [],
		chairOptions: showProgram ? chairPool.map((m) => ({ id: m.id, label: displayName(m) })) : [],
		chairAutoName: showProgram && chairAuto ? displayName(chairAuto) : null,
		absenceOptions: showProgram ? bishopric.map((m) => ({ id: m.id, label: displayName(m) })) : [],
		organistOptions: memberOptions(ward, activity, 'plain', today, full.meeting.organistMemberId),
		conductorOptions: memberOptions(ward, activity, 'plain', today, full.meeting.conductorMemberId),
		prayers: showProgram || canPrayers
			? [1, 2].map((position) => {
					const memberId = full.prayers.find((x) => x.position === position)?.member?.id ?? null;
					return {
						position,
						label: position === 1 ? 'Anfangsgebet' : 'Schlussgebet',
						memberId,
						options: memberOptions(ward, activity, canPrayers ? 'prayer' : 'plain', today, memberId)
					};
				})
			: [],
		talks: showProgram
			? [1, 2, 3, 4].map((position) => {
					const t = full.talks.find((x) => x.position === position) ?? emptyTalk(position);
					return {
						position,
						memberId: t.member?.id ?? null,
						durationMinutes: t.durationMinutes,
						confirmed: t.confirmed,
						options: memberOptions(all, activity, stats ? 'talk' : 'plain', today, t.member?.id ?? null)
					};
				})
			: [],
		showFourth,
		hymns: hymnSlots.map((slot) => {
			const h = full.hymns[slot];
			return { slot, label: SLOT_LABELS[slot], value: h.hymn ? hymnLabel(h.hymn) : '', number: h.hymn?.number ?? null, freeText: h.freeText };
		}),
		hymnList: listHymns(locals.db).map((h) => ({ id: h.number, label: hymnLabel(h), hint: '' })),
		announcements: showProgram ? full.announcements : [],
		releases: showProgram ? full.callings.filter((c) => c.kind === 'entlassung').map(withMemberId) : [],
		sustainings: showProgram ? full.callings.filter((c) => c.kind === 'berufung').map(withMemberId) : [],
		callingOptions: showProgram ? memberOptions(ward, activity, 'plain', today) : []
	};
};

export const actions: Actions = {
	create: ({ locals, params }) => {
		requireRole(locals.user, 'meetings.create');
		checkDate(params.date);
		if (!getMeetingByDate(locals.db, params.date)) createMeeting(locals.db, params.date);
		return { saved: 'create' };
	},
	program: async ({ request, locals, params }) => {
		requireRole(locals.user, 'meeting.program');
		const fd = await request.formData();
		const id = meetingIdFor(locals, params.date, 'program', fd);
		if (typeof id !== 'number') return id;
		const kind = str(fd, 'kind');
		if (!isKind(kind)) return fail(400, { error: 'Ungültiger Typ.' });

		saveGeneral(locals.db, id, {
			kind,
			theme: optStr(fd, 'theme'),
			specialNote: optStr(fd, 'specialNote'),
			presidingMemberId: optInt(fd, 'presiding'),
			absences: formatAbsences(fd.getAll('absent').map((v) => Number(v))),
			guestMemberId: optInt(fd, 'guest'),
			chairMemberId: optInt(fd, 'chair'),
			stakeChanges: fd.get('stakeChanges') === '1'
		});
		savePrayers(
			locals.db,
			id,
			[1, 2].map((position) => ({ position, memberId: optInt(fd, `prayer${position}_member`) }))
		);
		const talks: TalkInput[] = [];
		for (const position of [1, 2, 3, 4]) {
			if (!fd.has(`talk${position}_duration`)) continue;
			const t: TalkInput = {
				position,
				memberId: optInt(fd, `talk${position}_member`),
				durationMinutes: optInt(fd, `talk${position}_duration`),
				confirmed: fd.get(`talk${position}_confirmed`) === '1'
			};
			if (t.memberId === null && t.durationMinutes === null && !t.confirmed) continue;
			talks.push(t);
		}
		saveTalks(locals.db, id, talks);
		saveAnnouncements(locals.db, id, strList(fd, 'announcement'));
		const membersById = new Map(listMembers(locals.db).map((m) => [String(m.id), displayName(m)]));
		const personFrom = (v: string) => (v.startsWith('name:') ? v.slice(5).trim() : (membersById.get(v) ?? ''));
		const pairs = (kind: 'entlassung' | 'berufung', prefix: string) => {
			const persons = fd.getAll(`${prefix}_person`).map((v) => personFrom(String(v).trim()));
			const callings = fd.getAll(`${prefix}_calling`).map((v) => String(v).trim());
			return persons.map((personName, i) => ({ kind, personName, calling: callings[i] ?? '' })).filter((c) => c.personName || c.calling);
		};
		saveCallings(locals.db, id, [...pairs('entlassung', 'release'), ...pairs('berufung', 'sustain')]);

		return { saved: 'program' };
	},
	prayers: async ({ request, locals, params }) => {
		requireRole(locals.user, 'meeting.prayers');
		const fd = await request.formData();
		const id = meetingIdFor(locals, params.date, 'prayers', fd);
		if (typeof id !== 'number') return id;
		savePrayers(
			locals.db,
			id,
			[1, 2].map((position) => ({ position, memberId: optInt(fd, `prayer${position}_member`) }))
		);
		return { saved: 'prayers' };
	},
	music: async ({ request, locals, params }) => {
		requireRole(locals.user, 'meeting.music');
		const fd = await request.formData();
		const id = meetingIdFor(locals, params.date, 'music', fd);
		if (typeof id !== 'number') return id;
		const hymns = {} as Record<HymnSlot, { hymnNumber: number | null; freeText: string | null }>;
		for (const slot of HYMN_SLOTS) {
			const text = str(fd, `hymn_${slot}`);
			const hymnNumber = parseInt(text, 10) || null;
			if (text && hymnNumber === null) return fail(400, { error: `${SLOT_LABELS[slot]}: bitte ein Lied aus der Liste wählen oder die Nummer eingeben.` });
			hymns[slot] = { hymnNumber, freeText: slot === 'zwischen' ? optStr(fd, 'zwischen_text') : null };
		}
		const result = saveMusic(locals.db, id, {
			hymns,
			organistMemberId: optInt(fd, 'organist'),
			conductorMemberId: optInt(fd, 'conductor'),
			musicNote: optStr(fd, 'musicNote')
		});
		if (result.unknownNumbers.length) {
			return fail(400, { error: `Lied Nr. ${result.unknownNumbers.join(', ')} gibt es noch nicht. Bitte zuerst unter "Lieder" anlegen. Die übrigen Angaben wurden gespeichert.` });
		}
		return { saved: 'music' };
	},
	conductor: async ({ request, locals, params }) => {
		requireRole(locals.user, 'meeting.conductor');
		const fd = await request.formData();
		const id = meetingIdFor(locals, params.date, 'conductor', fd);
		if (typeof id !== 'number') return id;
		saveConductor(locals.db, id, optInt(fd, 'conductor'));
		return { saved: 'conductor' };
	}

};
