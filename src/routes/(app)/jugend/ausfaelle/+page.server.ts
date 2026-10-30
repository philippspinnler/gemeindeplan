import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { failMessage } from '$lib/server/forms';
import { requireRole } from '$lib/server/permissions';
import { recordChanges } from '$lib/server/changes';
import { YOUTH_BREAK_KIND_LABELS, breakInput, createBreak, listBreaks } from '$lib/server/youth-breaks';
import { todayIso } from '$lib/dates';

export const load: PageServerLoad = ({ locals, url }) => {
	requireRole(locals.user, 'youth.common');
	const showAll = url.searchParams.get('alle') === '1';
	return { breaks: listBreaks(locals.db, showAll ? undefined : todayIso()), showAll, kinds: YOUTH_BREAK_KIND_LABELS };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireRole(locals.user, 'youth.common');
		const fd = await request.formData();
		const input = breakInput(fd);
		if (!input) return fail(400, { error: 'Bitte Datum und Art angeben.' });
		try {
			recordChanges(locals.db, locals.user!.id, [], (created) => created({ section: 'ausfall', key: String(createBreak(locals.db, input).id) }));
		} catch (e) {
			return fail(400, { error: failMessage(e) });
		}
	}
};
