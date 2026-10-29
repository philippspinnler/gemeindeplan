import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createInvite, deleteInvite, findUserByEmail, listOpenInvites, listUsers, setUserActive, setUserMember, updateUserRole } from '$lib/server/auth';
import { getMember, listMembers } from '$lib/server/members';
import { int, str } from '$lib/server/forms';
import { inviteText, resetText } from '$lib/server/invite-text';
import { requireRole } from '$lib/server/permissions';
import { isRole } from '$lib/server/role-view';

export const load: PageServerLoad = ({ locals }) => {
	requireRole(locals.user, 'users.manage');
	return {
		users: listUsers(locals.db).map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, memberId: u.memberId })),
		members: listMembers(locals.db, { activeOnly: true, kind: 'gemeinde' }).map((m) => ({ id: m.id, name: `${m.lastName} ${m.firstName}` })),
		invites: listOpenInvites(locals.db).map((i) => ({ id: i.id, name: i.name, email: i.email, role: i.role, expiresAt: i.expiresAt}))
	};
};

export const actions: Actions = {
	invite: async ({ request, locals, url }) => {
		requireRole(locals.user, 'users.manage');
		const fd = await request.formData();
		const name = str(fd, 'name');
		const email = str(fd, 'email');
		const role = str(fd, 'role');
		if (!name || !email.includes('@') || !isRole(role)) return fail(400, { error: 'Bitte Name, gültige E-Mail und Rolle angeben.' });
		if (findUserByEmail(locals.db, email)) return fail(400, { error: 'Für diese E-Mail gibt es schon ein Konto.' });
		const inv = createInvite(locals.db, { name, email, role, createdBy: locals.user!.id });
		const link = `${url.origin}/einladung/${inv.token}`;
		return { invited: { link, text: inviteText(name, link, role) } };
	},
	resetPassword: async ({ request, locals, url }) => {
		requireRole(locals.user, 'users.manage');
		const fd = await request.formData();
		const target = listUsers(locals.db).find((u) => u.id === int(fd, 'id'));
		if (!target || target.id === locals.user!.id) return fail(400, { error: 'Das eigene Passwort änderst du unter Konto.' });
		const inv = createInvite(locals.db, { name: target.name, email: target.email, role: target.role, createdBy: locals.user!.id });
		const link = `${url.origin}/einladung/${inv.token}`;
		return { invited: { link, text: resetText(target.name, link) } };
	},
	setRole: async ({ request, locals }) => {
		requireRole(locals.user, 'users.manage');
		const fd = await request.formData();
		const id = int(fd, 'id');
		const role = str(fd, 'role');
		if (id === locals.user!.id) return fail(400, { error: 'Die eigene Rolle kann nicht geändert werden.' });
		if (!isRole(role)) return fail(400, { error: 'Ungültige Rolle.' });
		updateUserRole(locals.db, id, role);
		return { ok: true };
	},
	setActive: async ({ request, locals }) => {
		requireRole(locals.user, 'users.manage');
		const fd = await request.formData();
		const id = int(fd, 'id');
		const active = str(fd, 'active') === '1';
		if (id === locals.user!.id) return fail(400, { error: 'Das eigene Konto kann nicht deaktiviert werden.' });
		setUserActive(locals.db, id, active);
		return { ok: true };
	},
	setMember: async ({ request, locals }) => {
		requireRole(locals.user, 'users.manage');
		const fd = await request.formData();
		const memberId = int(fd, 'memberId') || null;
		if (memberId && !getMember(locals.db, memberId)) return fail(400, { error: 'Unbekanntes Mitglied.' });
		setUserMember(locals.db, int(fd, 'id'), memberId);
		return { ok: true };
	},
	deleteInvite: async ({ request, locals }) => {
		requireRole(locals.user, 'users.manage');
		const fd = await request.formData();
		deleteInvite(locals.db, int(fd, 'id'));
		return { ok: true };
	}
};
