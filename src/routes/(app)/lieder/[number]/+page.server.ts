import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { formatDateDe } from '$lib/dates';
import { formatDuration, parseDuration } from '$lib/duration';
import { str } from '$lib/server/forms';
import { getHymnByNumber, updateHymn } from '$lib/server/hymns';
import { SLOT_LABELS } from '$lib/server/meetings';
import { can, requireRole } from '$lib/server/permissions';
import { recordChanges } from '$lib/server/changes';
import { hymnHistory } from '$lib/server/stats';

export const load: PageServerLoad = ({ locals, params }) => {
	requireRole(locals.user, 'hymns.view');
	const hymn = getHymnByNumber(locals.db, Number(params.number));
	if (!hymn) error(404, 'Lied nicht gefunden');
	return {
		hymn: { number: hymn.number, title: hymn.title, book: hymn.book, duration: formatDuration(hymn.durationSeconds) },
		version: hymn.updatedAt,
		canEdit: can(locals.user!.role, 'hymns.edit'),
		history: hymnHistory(locals.db, hymn.id).map((h) => ({ date: h.date, dateLabel: formatDateDe(h.date), slot: SLOT_LABELS[h.slot] }))
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		requireRole(locals.user, 'hymns.edit');
		const hymn = getHymnByNumber(locals.db, Number(params.number));
		if (!hymn) error(404, 'Lied nicht gefunden');
		const fd = await request.formData();
		if (str(fd, 'version') !== hymn.updatedAt) return fail(409, { error: 'Jemand anderes hat dieses Lied inzwischen geändert. Bitte die Seite neu laden, deine letzte Änderung geht dabei verloren.' });
		const title = str(fd, 'title');
		const durationText = str(fd, 'duration');
		if (!title) return fail(400, { error: 'Der Titel darf nicht leer sein.' });
		if (durationText && parseDuration(durationText) === null) return fail(400, { error: 'Dauer bitte als m:ss angeben, z.B. 3:45.' });
		recordChanges(locals.db, locals.user!.id, [{ section: 'lied', key: String(hymn.number) }], () => updateHymn(locals.db, hymn.id, { title, durationSeconds: parseDuration(durationText) }));
		return { saved: true };
	}
};
