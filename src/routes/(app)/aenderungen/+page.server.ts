import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listUsers } from '$lib/server/auth';
import { changeAreas, listChanges, resetChange } from '$lib/server/changes';
import { failMessage, int } from '$lib/server/forms';

export const load: PageServerLoad = ({ locals, url }) => {
	const role = locals.user!.role;
	const areas = changeAreas(role);
	if (!areas.length) error(403, 'Dafür fehlt dir die Berechtigung');
	const person = Number(url.searchParams.get('person')) || undefined;
	const area = areas.find((a) => a === url.searchParams.get('bereich'));
	return {
		changes: listChanges(locals.db, role, { userId: person, area }),
		areas,
		area: area ?? '',
		person: person ?? null,
		people: listUsers(locals.db).map((u) => ({ id: u.id, name: u.name }))
	};
};

export const actions: Actions = {
	reset: async ({ request, locals }) => {
		if (!locals.user) error(401, 'Bitte anmelden');
		const fd = await request.formData();
		try {
			const result = resetChange(locals.db, locals.user, int(fd, 'id'), fd.get('force') === '1');
			if ('conflict' in result) return fail(409, { conflict: result.conflict });
		} catch (e) {
			return fail(400, { error: failMessage(e) });
		}
		return { reset: true };
	}
};
