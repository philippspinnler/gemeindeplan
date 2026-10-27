import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { failMessage, int, optInt, str } from '$lib/server/forms';
import { createMember, isStakeOfficer, listMembers } from '$lib/server/members';
import { createStakeCalling, deleteStakeCalling, listStakeCallings, moveStakeCalling, renameStakeCalling, setStakeCallingPresides } from '$lib/server/stake-callings';
import { can, requireRole } from '$lib/server/permissions';

export const load: PageServerLoad = ({ locals, url }) => {
	requireRole(locals.user, 'settings.edit');
	const showAll = url.searchParams.get('alle') === '1';
	const officers = listMembers(locals.db, { activeOnly: !showAll }).filter(isStakeOfficer).map((m) => ({
		id: m.id,
		name: `${m.firstName} ${m.lastName}`.trim(),
		calling: m.calling ?? '',
		active: m.active
	}));
	return { officers, showAll, canCreate: can(locals.user!.role, 'members.create'), callings: listStakeCallings(locals.db).map((c) => ({ id: c.id, name: c.name, presides: c.presides })) };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireRole(locals.user, 'members.create');
		const fd = await request.formData();
		const firstName = str(fd, 'firstName');
		const lastName = str(fd, 'lastName');
		if (!firstName) return fail(400, { error: 'Bitte mindestens einen Vornamen angeben.' });
		const m = createMember(locals.db, { firstName, lastName, kind: 'pfahl', stakeCallingId: optInt(fd, 'stakeCallingId') });
		redirect(303, `/mitglieder/${m.id}`);
	},
	presidesCalling: async ({ request, locals }) => {
		requireRole(locals.user, 'settings.edit');
		const fd = await request.formData();
		setStakeCallingPresides(locals.db, int(fd, 'id'), fd.get('presides') === '1');
		return { saved: true };
	},
	addCalling: async ({ request, locals }) => {
		requireRole(locals.user, 'settings.edit');
		const fd = await request.formData();
		try {
			createStakeCalling(locals.db, str(fd, 'name'));
		} catch (e) {
			return fail(400, { error: failMessage(e) });
		}
		return { saved: true };
	},
	renameCalling: async ({ request, locals }) => {
		requireRole(locals.user, 'settings.edit');
		const fd = await request.formData();
		try {
			renameStakeCalling(locals.db, int(fd, 'id'), str(fd, 'name'));
		} catch (e) {
			return fail(400, { error: failMessage(e) });
		}
		return { saved: true };
	},
	deleteCalling: async ({ request, locals }) => {
		requireRole(locals.user, 'settings.edit');
		const fd = await request.formData();
		if (!deleteStakeCalling(locals.db, int(fd, 'id'))) return fail(400, { error: 'Diese Berufung wird noch bei Pfahlbeamten verwendet.' });
		return { saved: true };
	},
	moveCalling: async ({ request, locals }) => {
		requireRole(locals.user, 'settings.edit');
		const fd = await request.formData();
		moveStakeCalling(locals.db, int(fd, 'id'), str(fd, 'dir') === 'up' ? -1 : 1);
		return { saved: true };
	}
};
