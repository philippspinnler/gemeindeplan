import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { todayIso } from '$lib/dates';
import { optStr, str } from '$lib/server/forms';
import { createMember, displayName, listMembers } from '$lib/server/members';
import { can, requireRole } from '$lib/server/permissions';
import { recordChanges } from '$lib/server/changes';
import { memberActivity, weeksAgoLabel, type MemberActivity } from '$lib/server/stats';

export const load: PageServerLoad = ({ locals, url }) => {
	requireRole(locals.user, 'settings.edit');
	const role = locals.user!.role;
	const showAll = url.searchParams.get('alle') === '1';
	const today = todayIso();
	const stats = can(role, 'members.stats');
	const activity = stats ? memberActivity(locals.db, today) : new Map<number, MemberActivity>();
	const members = listMembers(locals.db, { activeOnly: !showAll, kind: 'gemeinde' }).map((m) => {
		const a = activity.get(m.id);
		return {
			id: m.id,
			name: displayName(m),
			sortName: `${m.lastName} ${m.firstName}`.trim(),
			active: m.active,
			lastTalk: stats ? (m.noTalk ? 'möchte nicht' : weeksAgoLabel(a?.lastTalk ?? null, today)) : '',
			lastPrayer: stats ? (m.noPrayer ? 'möchte nicht' : weeksAgoLabel(a?.lastPrayer ?? null, today)) : '',
			noTalk: m.noTalk,
			noPrayer: m.noPrayer,
			lastTalkDate: stats ? (a?.lastTalk ?? null) : null,
			lastPrayerDate: stats ? (a?.lastPrayer ?? null) : null,
			noteTalk: stats ? (m.noteTalk ?? '') : '',
			notePrayer: stats ? (m.notePrayer ?? '') : ''
		};
	});
	return { members, showAll, stats, canCreate: can(role, 'members.create') };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireRole(locals.user, 'members.create');
		const fd = await request.formData();
		const firstName = str(fd, 'firstName');
		const lastName = str(fd, 'lastName');
		if (!firstName) return fail(400, { error: 'Bitte mindestens einen Vornamen angeben.' });
		const m = recordChanges(locals.db, locals.user!.id, [], (created) => {
			const m = createMember(locals.db, { firstName, lastName, kind: 'gemeinde', affiliation: optStr(fd, 'affiliation') });
			created({ section: 'mitglied', key: String(m.id) });
			return m;
		});
		redirect(303, `/mitglieder/${m.id}`);
	}
};
