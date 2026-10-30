import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { formatDateDe } from '$lib/dates';
import { optInt, optStr, str } from '$lib/server/forms';
import { displayName, getMember, updateMember } from '$lib/server/members';
import { listStakeCallings } from '$lib/server/stake-callings';
import { can, requireRole } from '$lib/server/permissions';
import { recordChanges } from '$lib/server/changes';
import { memberHistory } from '$lib/server/stats';

export const load: PageServerLoad = ({ locals, params }) => {
	requireRole(locals.user, 'members.view');
	const member = getMember(locals.db, Number(params.id));
	if (!member) error(404, 'Mitglied nicht gefunden');
	const role = locals.user!.role;
	const stats = can(role, 'members.stats');
	const canEdit = can(role, 'members.edit');
	const settingsList = member.kind === 'pfahl' ? 'pfahlbeamte' : 'mitglieder';
	return {
		backHref: canEdit ? `/einstellungen/${settingsList}` : '/fragen',
		backLabel: canEdit ? (member.kind === 'pfahl' ? 'Pfahlbeamte' : 'Mitglieder') : 'Anfragen',
		member: { ...member, noteTalk: stats ? member.noteTalk : null, notePrayer: stats ? member.notePrayer : null },
		title: displayName(member),
		callings: listStakeCallings(locals.db).map((c) => ({ id: c.id, name: c.name })),
		canEdit,
		version: member.updatedAt,
		stats,
		history: stats
			? memberHistory(locals.db, member.id).map((h) => ({
					date: h.date,
					dateLabel: formatDateDe(h.date),
					what: h.kind === 'talk' ? `Ansprache ${h.position}` : h.position === 1 ? 'Anfangsgebet' : 'Schlussgebet'
				}))
			: []
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		requireRole(locals.user, 'members.edit');
		const fd = await request.formData();
		const current = getMember(locals.db, Number(params.id));
		if (!current) error(404, 'Mitglied nicht gefunden');
		if (str(fd, 'version') !== current.updatedAt) return fail(409, { error: 'Jemand anderes hat dieses Mitglied inzwischen geändert. Bitte die Seite neu laden, deine letzte Änderung geht dabei verloren.' });
		const firstName = str(fd, 'firstName');
		if (!firstName) return fail(400, { error: 'Der Vorname darf nicht leer sein.' });
		const kind = str(fd, 'kind') === 'pfahl' ? 'pfahl' : 'gemeinde';
		const key = String(current.id);
		const refs = [{ section: 'mitglied', key }, { section: 'notiz.ansprache', key }, { section: 'notiz.gebet', key }] as const;
		recordChanges(locals.db, locals.user!.id, [...refs], () => updateMember(locals.db, current.id, {
			firstName,
			lastName: str(fd, 'lastName'),
			kind,
			stakeCallingId: optInt(fd, 'stakeCallingId'),
			affiliation: kind === 'gemeinde' ? optStr(fd, 'affiliation') : null,
			active: str(fd, 'hidden') !== '1',
			noteTalk: optStr(fd, 'noteTalk'),
			notePrayer: optStr(fd, 'notePrayer'),
			noTalk: kind === 'gemeinde' && fd.get('noTalk') === '1',
			noPrayer: kind === 'gemeinde' && fd.get('noPrayer') === '1'
		}));
		return { saved: true };
	}
};
