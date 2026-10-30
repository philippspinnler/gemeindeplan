import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { addDays, formatDateShort, todayIso } from '$lib/dates';
import { optInt, optStr } from '$lib/server/forms';
import { askTables } from '$lib/server/ask';
import { getMember, updateMember } from '$lib/server/members';
import { assignOpenSlot, openSundays } from '$lib/server/meetings';
import { live } from '$lib/server/live';
import { can, requireRole } from '$lib/server/permissions';
import { recordChanges } from '$lib/server/changes';

const KINDS = {
	ansprachen: { title: 'Ansprachen', column: 'Letzte Ansprache', hint: 'Mitglieder, die keine Ansprache halten möchten, und Pfahlbeamte sind ausgeblendet.', action: 'ask.talks' as const, noteAction: 'notes.talk' as const, noteField: 'noteTalk' as const, askKind: 'talk' as const, editAction: 'meeting.program' as const },
	gebete: { title: 'Gebete', column: 'Letztes Gebet', hint: 'Mitglieder, die kein Gebet sprechen möchten, und Pfahlbeamte sind ausgeblendet.', action: 'ask.prayers' as const, noteAction: 'notes.prayer' as const, noteField: 'notePrayer' as const, askKind: 'prayer' as const, editAction: 'meeting.prayers' as const }
} as const;

function kindOf(param: string) {
	if (!(param in KINDS)) error(404, 'Seite nicht gefunden');
	return KINDS[param as keyof typeof KINDS];
}

export const load: PageServerLoad = ({ locals, params }) => {
	const k = kindOf(params.kind);
	requireRole(locals.user, k.action);
	const today = todayIso();
	const tables = askTables(locals.db, today);
	const canAsk = can(locals.user!.role, k.editAction);
	const sundays = canAsk
		? openSundays(locals.db, today, addDays(today, 12 * 7), k.askKind).map((s) => ({ ...s, label: formatDateShort(s.date) }))
		: [];
	return {
		title: k.title, column: k.column, hint: k.hint, askKind: k.askKind, canAsk, sundays, sender: locals.user!.name,
		canNote: can(locals.user!.role, k.noteAction), rows: params.kind === 'ansprachen' ? tables.talks : tables.prayers
	};
};

export const actions: Actions = {
	note: async ({ request, locals, params }) => {
		const k = kindOf(params.kind);
		requireRole(locals.user, k.noteAction);
		const fd = await request.formData();
		const id = Number(fd.get('id'));
		if (!getMember(locals.db, id)) return fail(404, { error: 'Mitglied nicht gefunden' });
		const section = k.noteField === 'noteTalk' ? 'notiz.ansprache' : 'notiz.gebet';
		recordChanges(locals.db, locals.user!.id, [{ section, key: String(id) }], () => updateMember(locals.db, id, { [k.noteField]: optStr(fd, 'note') }));
		return { saved: true };
	},
	ask: async ({ request, locals, params }) => {
		const k = kindOf(params.kind);
		requireRole(locals.user, k.editAction);
		const fd = await request.formData();
		const id = Number(fd.get('id'));
		const date = String(fd.get('date') ?? '');
		if (!getMember(locals.db, id)) return fail(404, { error: 'Mitglied nicht gefunden' });
		const section = k.askKind === 'talk' ? 'sonntag.programm' : 'sonntag.gebete';
		const assigned = recordChanges(locals.db, locals.user!.id, [{ section, key: date }], () => assignOpenSlot(locals.db, date, k.askKind, id, optInt(fd, 'minutes')));
		if (!assigned) return fail(409, { error: 'Dieser Sonntag ist inzwischen voll. Bitte einen anderen wählen.' });
		live.changed(`/sonntag/${date}`);
		return { saved: true };
	}
};
