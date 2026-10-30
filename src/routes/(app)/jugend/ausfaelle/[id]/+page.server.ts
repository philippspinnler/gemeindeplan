import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { failMessage, str } from '$lib/server/forms';
import { requireRole } from '$lib/server/permissions';
import { recordChanges } from '$lib/server/changes';
import { YOUTH_BREAK_KIND_LABELS, breakInput, breakVersion, deleteBreak, getBreak, updateBreak } from '$lib/server/youth-breaks';

function breakOr404(locals: App.Locals, id: string) {
	requireRole(locals.user, 'youth.common');
	const b = getBreak(locals.db, Number(id));
	if (!b) error(404, 'Eintrag nicht gefunden');
	return b;
}

export const load: PageServerLoad = ({ locals, params }) => {
	const b = breakOr404(locals, params.id);
	return { brk: b, version: breakVersion(b), kinds: YOUTH_BREAK_KIND_LABELS };
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const current = breakOr404(locals, params.id);
		const fd = await request.formData();
		if (str(fd, 'version') !== breakVersion(current)) return fail(409, { error: 'Jemand anderes hat diesen Eintrag inzwischen geändert. Bitte die Seite neu laden, deine letzte Änderung geht dabei verloren.' });
		const input = breakInput(fd);
		if (!input) return fail(400, { error: 'Bitte Datum und Art angeben.' });
		try {
			recordChanges(locals.db, locals.user!.id, [{ section: 'ausfall', key: String(current.id) }], () => updateBreak(locals.db, current.id, input));
		} catch (e) {
			return fail(400, { error: failMessage(e) });
		}
		return { saved: true };
	},
	delete: async ({ locals, params }) => {
		const id = breakOr404(locals, params.id).id;
		recordChanges(locals.db, locals.user!.id, [{ section: 'ausfall', key: String(id) }], () => deleteBreak(locals.db, id));
		redirect(303, '/jugend/ausfaelle');
	}
};
