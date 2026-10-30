import { fail } from '@sveltejs/kit';
import { inArray } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { YOUTH_PART_SIDES, youthEvents } from '$lib/server/db/schema';
import { int, optStr, str } from '$lib/server/forms';
import { requireRole } from '$lib/server/permissions';
import { recordChanges } from '$lib/server/changes';
import { createIdea, dismissIdea, listIdeas } from '$lib/server/youth-ideas';

export const load: PageServerLoad = ({ locals }) => {
	requireRole(locals.user, 'youth.common');
	const open = listIdeas(locals.db, { open: true });
	const closed = listIdeas(locals.db, { open: false });
	const ids = closed.flatMap((i) => (i.plannedEventId ? [i.plannedEventId] : []));
	const dates = new Map(
		(ids.length ? locals.db.select().from(youthEvents).where(inArray(youthEvents.id, ids)).all() : []).map((e) => [e.id, e.date])
	);
	return { open, planned: closed.map((i) => ({ ...i, date: i.plannedEventId ? (dates.get(i.plannedEventId) ?? null) : null })) };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireRole(locals.user, 'youth.common');
		const fd = await request.formData();
		const text = str(fd, 'text');
		const side = YOUTH_PART_SIDES.find((s) => s === str(fd, 'side'));
		if (!text || !side) return fail(400, { error: 'Bitte einen Text und eine Seite angeben.' });
		recordChanges(locals.db, locals.user!.id, [], (created) =>
			created({ section: 'idee', key: String(createIdea(locals.db, { text, side, note: optStr(fd, 'note'), createdBy: locals.user!.id }).id) })
		);
	},
	dismiss: async ({ request, locals }) => {
		requireRole(locals.user, 'youth.common');
		const id = int(await request.formData(), 'id');
		recordChanges(locals.db, locals.user!.id, [{ section: 'idee', key: String(id) }], () => dismissIdea(locals.db, id));
	}
};
