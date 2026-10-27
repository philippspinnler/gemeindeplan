import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { todayIso } from '$lib/dates';
import { BISHOPRIC_ROLES, BISHOPRIC_ROLE_LABELS, getBishopric, setBishopricMember, type BishopricRole } from '$lib/server/bishopric';
import { YOUTH_LEADER_ROLES } from '$lib/server/db/schema';
import { optInt, str, strList } from '$lib/server/forms';
import { fullName, getMember, listMembers } from '$lib/server/members';
import { requireRole } from '$lib/server/permissions';
import { memberOptions } from '$lib/server/picker';
import { listLeaders, setLeaders, YOUTH_LEADER_ROLE_LABELS } from '$lib/server/youth-people';

const isBishopricRole = (r: string): r is BishopricRole => (BISHOPRIC_ROLES as readonly string[]).includes(r);
const isLeaderRole = (r: string): r is (typeof YOUTH_LEADER_ROLES)[number] => (YOUTH_LEADER_ROLES as readonly string[]).includes(r);

export const load: PageServerLoad = ({ locals }) => {
	requireRole(locals.user, 'settings.edit');
	const entries = getBishopric(locals.db);
	const leaders = listLeaders(locals.db);
	return {
		bishopric: BISHOPRIC_ROLES.map((role) => ({ role, label: BISHOPRIC_ROLE_LABELS[role], memberId: entries.find((e) => e.role === role)?.id ?? null })),
		leaders: YOUTH_LEADER_ROLES.map((role) => ({
			role,
			label: YOUTH_LEADER_ROLE_LABELS[role],
			members: leaders.filter((l) => l.role === role).map((l) => ({ id: l.member.id, name: fullName(l.member) }))
		})),
		candidates: memberOptions(listMembers(locals.db).filter((m) => m.kind === 'gemeinde'), new Map(), 'plain', todayIso())
	};
};

export const actions: Actions = {
	bishopric: async ({ request, locals }) => {
		requireRole(locals.user, 'settings.edit');
		const fd = await request.formData();
		const role = str(fd, 'role');
		if (!isBishopricRole(role)) return fail(400, { error: 'Ungültige Rolle.' });
		const id = optInt(fd, 'memberId');
		if (id && getMember(locals.db, id)?.kind !== 'gemeinde') return fail(400, { error: 'Bitte ein Gemeindemitglied auswählen.' });
		setBishopricMember(locals.db, role, id);
		return { saved: true };
	},
	leaders: async ({ request, locals }) => {
		requireRole(locals.user, 'settings.edit');
		const fd = await request.formData();
		const role = str(fd, 'role');
		if (!isLeaderRole(role)) return fail(400, { error: 'Ungültige Berufung.' });
		const ids = strList(fd, 'memberId').map(Number).filter((n) => Number.isInteger(n) && n > 0);
		if (ids.some((id) => getMember(locals.db, id)?.kind !== 'gemeinde')) return fail(400, { error: 'Bitte ein Gemeindemitglied auswählen.' });
		setLeaders(locals.db, role, ids);
		return { saved: true };
	}
};
