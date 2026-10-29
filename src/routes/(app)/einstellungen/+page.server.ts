import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { str } from '$lib/server/forms';
import { requireRole } from '$lib/server/permissions';
import { getAllSettings, setSetting } from '$lib/server/settings';

export const load: PageServerLoad = ({ locals }) => {
	requireRole(locals.user, 'settings.edit');
	return {
		settings: getAllSettings(locals.db)
	};
};

export const actions: Actions = {
	general: async ({ request, locals }) => {
		requireRole(locals.user, 'settings.edit');
		const fd = await request.formData();
		const ward = str(fd, 'ward_name');
		if (!ward) return fail(400, { error: 'Der Gemeindename darf nicht leer sein.' });
		setSetting(locals.db, 'ward_name', ward);
		return { saved: true };
	},
	times: async ({ request, locals }) => {
		requireRole(locals.user, 'settings.edit');
		const fd = await request.formData();
		const keys = ['youth_wed_start', 'youth_wed_end', 'youth_sun_start', 'youth_sun_end'] as const;
		const values = keys.map((k) => str(fd, k));
		if (values.some((v) => v && !/^\d{2}:\d{2}$/.test(v))) return fail(400, { error: 'Ungültige Zeit.' });
		if ((values[0] && values[1] && values[0] >= values[1]) || (values[2] && values[3] && values[2] >= values[3])) return fail(400, { error: 'Das Ende muss nach dem Beginn liegen.' });
		keys.forEach((k, i) => setSetting(locals.db, k, values[i]));
		return { saved: true };
	}
};
