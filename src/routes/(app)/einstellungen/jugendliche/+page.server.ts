import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { todayIso } from '$lib/dates';
import { YOUTH_GROUPS, YOUTH_SIDES, type YouthSide } from '$lib/server/db/schema';
import { failMessage, int, str } from '$lib/server/forms';
import { fullName, listMembers } from '$lib/server/members';
import { requireRole } from '$lib/server/permissions';
import { recordChanges } from '$lib/server/changes';
import { memberOptions } from '$lib/server/picker';
import { getSetting, setSetting } from '$lib/server/settings';
import { newYouthPageToken } from '$lib/server/youth-page';
import { listYouth, removeYouth, setYouth, YOUTH_GROUP_LABELS } from '$lib/server/youth-people';

export const load: PageServerLoad = ({ locals }) => {
	requireRole(locals.user, 'settings.edit');
	const entries = listYouth(locals.db);
	const taken = new Set(entries.map((e) => e.member.id));
	const sideRank = (s: YouthSide) => YOUTH_SIDES.indexOf(s);
	return {
		youthToken: getSetting(locals.db, 'youth_page_token'),
		groups: Object.fromEntries(YOUTH_SIDES.map((s) => [s, YOUTH_GROUPS[s].map((g) => ({ id: g, label: YOUTH_GROUP_LABELS[g] }))])) as Record<YouthSide, { id: string; label: string }[]>,
		youth: entries
			.sort((a, b) => sideRank(a.side) - sideRank(b.side))
			.map((e) => ({ memberId: e.member.id, name: fullName(e.member), side: e.side, group: e.group })),
		candidates: memberOptions(listMembers(locals.db).filter((m) => m.kind === 'gemeinde' && !taken.has(m.id)), new Map(), 'plain', todayIso())
	};
};

export const actions: Actions = {
	youthToken: ({ locals }) => {
		requireRole(locals.user, 'settings.edit');
		recordChanges(locals.db, locals.user!.id, [{ section: 'jugendseite', key: '' }], () => setSetting(locals.db, 'youth_page_token', newYouthPageToken()));
		return { saved: true };
	},
	set: async ({ request, locals }) => {
		requireRole(locals.user, 'settings.edit');
		const fd = await request.formData();
		const side = str(fd, 'side');
		if (!(YOUTH_SIDES as readonly string[]).includes(side)) return fail(400, { error: 'Ungültige Seite.' });
		try {
			const memberId = int(fd, 'memberId');
			const group = (YOUTH_GROUPS[side as YouthSide] as readonly string[]).includes(str(fd, 'group')) ? str(fd, 'group') : null;
			recordChanges(locals.db, locals.user!.id, [{ section: 'jugendliche', key: String(memberId) }], () => setYouth(locals.db, memberId, side as YouthSide, group));
		} catch (e) {
			return fail(400, { error: failMessage(e) });
		}
		return { saved: true };
	},
	remove: async ({ request, locals }) => {
		requireRole(locals.user, 'settings.edit');
		const memberId = int(await request.formData(), 'memberId');
		recordChanges(locals.db, locals.user!.id, [{ section: 'jugendliche', key: String(memberId) }], () => removeYouth(locals.db, memberId));
		return { saved: true };
	}
};
