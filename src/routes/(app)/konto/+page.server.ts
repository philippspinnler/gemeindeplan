import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { MIN_PASSWORD_LENGTH, changePassword, createMcpKey, mcpKeyInfo, revokeMcpKey } from '$lib/server/auth';
import { SESSION_COOKIE } from '$lib/server/cookies';
import { rawStr } from '$lib/server/forms';
import { roleLabel } from '$lib/server/permissions';

const isAdmin = (locals: App.Locals) => locals.accountRole === 'admin';

export const load: PageServerLoad = ({ locals, url }) => {
	const u = locals.user!;
	return {
		account: { name: u.name, email: u.email, role: roleLabel(locals.accountRole ?? u.role) },
		minLength: MIN_PASSWORD_LENGTH,
		mcp: isAdmin(locals) ? { ...mcpKeyInfo(locals.db, u.id), endpoint: `${url.origin}/mcp` } : null
	};
};

export const actions: Actions = {
	password: async ({ request, locals, cookies }) => {
		const fd = await request.formData();
		const current = rawStr(fd, 'current');
		const next = rawStr(fd, 'next');
		const repeat = rawStr(fd, 'repeat');
		if (next !== repeat) return fail(400, { error: 'Die Wiederholung stimmt nicht mit dem neuen Passwort überein.' });
		const result = await changePassword(locals.db, locals.user!.id, current, next, cookies.get(SESSION_COOKIE) ?? null);
		if (result === 'wrong') return fail(400, { error: 'Das bisherige Passwort ist falsch.' });
		if (result === 'weak') return fail(400, { error: `Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.` });
		return { changed: true };
	},
	mcpKey: ({ locals }) => {
		if (!isAdmin(locals)) error(403, 'Dafür fehlt dir die Berechtigung');
		return { mcpKey: createMcpKey(locals.db, locals.user!.id) };
	},
	mcpRevoke: ({ locals }) => {
		if (!isAdmin(locals)) error(403, 'Dafür fehlt dir die Berechtigung');
		revokeMcpKey(locals.db, locals.user!.id);
		return { mcpRevoked: true };
	}
};
