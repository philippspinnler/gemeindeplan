import { error, fail, type ActionFailure } from '@sveltejs/kit';
import type { Action, Actions, PageServerLoad } from './$types';
import { formatDateLong, isSunday, parseIso, todayIso, toIso } from '$lib/dates';
import { YOUTH_AREAS, YOUTH_LEADER_GROUPS, type Member, type Role, type YouthPartSide } from '$lib/server/db/schema';
import { optInt, optStr, str } from '$lib/server/forms';
import { displayName } from '$lib/server/members';
import { can, requireRole } from '$lib/server/permissions';
import { memberOptions } from '$lib/server/picker';
import {
	BASEL_KINDS, ensureYouthEvents, isWednesday, loadYouthEvent, OFF_KINDS, saveYouthAdults, saveYouthCommon, saveYouthPart,
	SUNDAY_KINDS, WEDNESDAY_KINDS, YOUTH_AREA_LABELS, YOUTH_KIND_LABELS, youthSectionVersions, type YouthEventFull
} from '$lib/server/youth';
import { openIdeasFor, planIdea } from '$lib/server/youth-ideas';
import { listAdults, listYouth, YOUTH_GROUP_LABELS } from '$lib/server/youth-people';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONFLICT = 'Jemand anderes hat diesen Termin inzwischen geändert. Bitte die Seite neu laden, deine letzte Änderung geht dabei verloren.';

function checkDate(date: string) {
	if (!DATE.test(date) || toIso(parseIso(date)) !== date || !(isSunday(date) || isWednesday(date))) error(404, 'Kein gültiger Jugendtermin');
}

function canSide(role: Role, side: YouthPartSide): boolean {
	if (side === 'both') return can(role, 'youth.jd') || can(role, 'youth.jm');
	return can(role, side === 'jd' ? 'youth.jd' : 'youth.jm');
}

function requireSide(user: App.Locals['user'], side: YouthPartSide) {
	if (!user) error(401, 'Bitte anmelden');
	if (!canSide(user.role, side)) error(403, 'Dafür fehlt dir die Berechtigung');
}

const kindsFor = (date: string) => (isSunday(date) ? SUNDAY_KINDS : WEDNESDAY_KINDS);
const groupsFor = (side: YouthPartSide) => (side === 'both' ? [...new Set([...YOUTH_LEADER_GROUPS.jd, ...YOUTH_LEADER_GROUPS.jm])] : YOUTH_LEADER_GROUPS[side]);

/** Load the event and check the form still has the current version of its section. */
function eventFor(locals: App.Locals, date: string, section: keyof ReturnType<typeof youthSectionVersions>, fd: FormData): YouthEventFull | ActionFailure<{ error: string }> {
	checkDate(date);
	const full = loadYouthEvent(locals.db, date);
	if (!full) error(404, 'Termin nicht gefunden');
	if (str(fd, 'version') !== youthSectionVersions(full)[section]) return fail(409, { error: CONFLICT });
	return full;
}

function partAction(side: YouthPartSide): Action {
	return async ({ request, locals, params }) => {
		requireSide(locals.user, side);
		const fd = await request.formData();
		const full = eventFor(locals, params.date, side, fd);
		if (!('event' in full)) return full;
		// "gemeinsam" was toggled elsewhere while this form was open.
		if ((side === 'both') !== full.event.joint) return fail(409, { error: CONFLICT });
		const leaderGroup = optStr(fd, 'leaderGroup');
		if (leaderGroup !== null && !groupsFor(side).includes(leaderGroup)) return fail(400, { error: 'Ungültige Gruppe.' });
		const area = YOUTH_AREAS.find((a) => a === str(fd, 'area')) ?? null;
		if (!area && str(fd, 'area')) return fail(400, { error: 'Ungültiger Bereich.' });
		saveYouthPart(locals.db, full.event.id, side, {
			text: optStr(fd, 'text'),
			details: optStr(fd, 'details'),
			leaderMemberId: optInt(fd, 'leader'),
			leaderGroup,
			area,
			teacherMemberId: optInt(fd, 'teacher')
		});
		// An idea taken over into the text is planned together with it; foreign or closed ideas are ignored.
		const idea = openIdeasFor(locals.db, side).find((i) => i.id === optInt(fd, 'ideaId'));
		if (idea) planIdea(locals.db, idea.id, full.event.id);
		return { saved: side };
	};
}

export const load: PageServerLoad = ({ locals, params }) => {
	requireRole(locals.user, 'youth.view');
	const date = params.date;
	checkDate(date);
	ensureYouthEvents(locals.db, date, 0);
	const full = loadYouthEvent(locals.db, date)!;
	const role = locals.user!.role;
	const today = todayIso();
	const options = (side: 'jd' | 'jm') => memberOptions(listYouth(locals.db, side).map((y) => y.member), new Map(), 'plain', today);
	const name = (m: Member | null) => (m ? displayName(m) : null);
	const present = new Map(full.adults.map((a) => [a.member.id, a.present]));
	const adultMembers = [...listAdults(locals.db), ...full.adults.map((a) => a.member)].filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i);
	const groups = (side: 'jd' | 'jm') => YOUTH_LEADER_GROUPS[side].map((g) => ({ value: g, label: YOUTH_GROUP_LABELS[g] ?? g }));

	return {
		date,
		dateLabel: formatDateLong(date),
		full: {
			event: full.event,
			thoughtId: full.thought?.id ?? null,
			thoughtName: name(full.thought),
			parts: full.parts.map((p) => ({
				side: p.side,
				text: p.text,
				details: p.details,
				leaderId: p.leader?.id ?? null,
				leaderName: name(p.leader),
				leaderGroup: p.leaderGroup,
				area: p.area,
				teacherId: p.teacher?.id ?? null,
				teacherName: name(p.teacher)
			}))
		},
		versions: youthSectionVersions(full),
		canCommon: can(role, 'youth.common'),
		canJd: can(role, 'youth.jd'),
		canJm: can(role, 'youth.jm'),
		areas: YOUTH_AREAS.map((a) => ({ value: a, label: YOUTH_AREA_LABELS[a] })),
		kinds: kindsFor(date).map((k) => ({ value: k, label: YOUTH_KIND_LABELS[k] })),
		// A break only hints on a Wednesday; the event stays editable.
		off: full.status === 'off' && (OFF_KINDS.includes(full.event.kind) || !full.break),
		offNotice: full.meetingKind && full.status === 'off' ? full.offLabel : null,
		jdOptions: options('jd'),
		jmOptions: options('jm'),
		jdThoughtOptions: memberOptions([...listYouth(locals.db, 'jd').map((y) => y.member), ...adultMembers], new Map(), 'plain', today),
		jmThoughtOptions: memberOptions([...listYouth(locals.db, 'jm').map((y) => y.member), ...adultMembers], new Map(), 'plain', today),
		adults: adultMembers.map((m) => ({ id: m.id, name: displayName(m), present: present.get(m.id) ?? null })),
		groupsJd: groups('jd'),
		groupsJm: groups('jm'),
		ideasJd: openIdeasFor(locals.db, 'jd'),
		ideasJm: openIdeasFor(locals.db, 'jm'),
		ideasBoth: openIdeasFor(locals.db, 'both'),
		isSunday: isSunday(date),
		breakHint: full.break?.label ?? null
	};
};

export const actions: Actions = {
	common: async ({ request, locals, params }) => {
		requireRole(locals.user, 'youth.common');
		const fd = await request.formData();
		const full = eventFor(locals, params.date, 'common', fd);
		if (!('event' in full)) return full;
		const kind = kindsFor(params.date).find((k) => k === str(fd, 'kind'));
		if (!kind) return fail(400, { error: 'Ungültige Art.' });
		const topicUrl = optStr(fd, 'topicUrl');
		if (topicUrl && !/^https?:\/\//i.test(topicUrl)) return fail(400, { error: 'Der Link muss mit http:// oder https:// beginnen.' });
		saveYouthCommon(locals.db, full.event.id, {
			kind,
			joint: BASEL_KINDS.includes(kind) || fd.get('joint') === '1',
			details: optStr(fd, 'details'),
			topic: optStr(fd, 'topic'),
			topicUrl,
			snack: optStr(fd, 'snack'),
			thoughtMemberId: optInt(fd, 'thought')
		});
		return { saved: 'common' };
	},
	jd: partAction('jd'),
	jm: partAction('jm'),
	both: partAction('both'),
	adults: async ({ request, locals, params }) => {
		requireRole(locals.user, 'youth.common');
		const fd = await request.formData();
		const full = eventFor(locals, params.date, 'adults', fd);
		if (!('event' in full)) return full;
		const ids = new Set([...listAdults(locals.db).map((m) => m.id), ...full.adults.map((a) => a.member.id)]);
		const entries = [...ids]
			.filter((id) => fd.has(`adult_${id}`))
			.map((id) => {
				const v = str(fd, `adult_${id}`);
				return { memberId: id, present: v === '1' ? true : v === '0' ? false : null };
			});
		saveYouthAdults(locals.db, full.event.id, entries);
		return { saved: 'adults' };
	}
};
