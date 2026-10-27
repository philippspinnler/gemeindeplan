import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { formatDateDe, isSunday } from '$lib/dates';
import { programOrder } from '$lib/schedule';
import { hymnLabel } from '$lib/server/hymns';
import { spokenName } from '$lib/server/members';
import { KIND_LABELS, hasProgram, loadMeetingFullByDate } from '$lib/server/meetings';
import { isFastLike } from '$lib/server/db/schema';
import { requireRole } from '$lib/server/permissions';
import { chairFor, getBishopric, parseAbsences } from '$lib/server/bishopric';
import { listMembers } from '$lib/server/members';
import { listStakeCallings } from '$lib/server/stake-callings';
import { getAllSettings } from '$lib/server/settings';
import { PRINT_TEXTS } from '$lib/print/texts';

export const load: PageServerLoad = ({ locals, params }) => {
	requireRole(locals.user, 'program.view');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date) || !isSunday(params.date)) error(404, 'Kein gültiges Sonntagsdatum');
	const full = loadMeetingFullByDate(locals.db, params.date);
	if (!full) error(404, 'Sonntag nicht gefunden');
	const settings = getAllSettings(locals.db);
	const m = full.meeting;
	let chair = full.chair;
	if (!chair) {
		const callingsById = new Map(listStakeCallings(locals.db).map((c) => [c.id, c]));
		const g = full.guest;
		const id = chairFor({
			bishopric: getBishopric(locals.db),
			absentIds: parseAbsences(m.absences),
			guest: g ? { id: g.id, presides: !!(g.stakeCallingId && callingsById.get(g.stakeCallingId)?.presides) } : null
		});
		chair = id ? (listMembers(locals.db).find((x) => x.id === id) ?? null) : null;
	}
	const talks = full.talks.filter((t) => t.member);
	const order = programOrder(talks.map((t) => t.position));
	const hymn = (slot: 'anfang' | 'abendmahl' | 'zwischen' | 'schluss') => {
		const h = full.hymns[slot];
		return h.hymn ? hymnLabel(h.hymn) : (h.freeText ?? '');
	};
	const prayer = (pos: number) => {
		const p = full.prayers.find((x) => x.position === pos);
		return p?.member ? spokenName(p.member) : '';
	};
	return {
		date: params.date,
		dateLabel: formatDateDe(params.date),
		kindLabel: KIND_LABELS[m.kind],
		isFast: isFastLike(m.kind),
		hasProgram: hasProgram(m.kind),
		wardName: settings.ward_name,
		presiding: full.presiding ? spokenName(full.presiding) : '',
		chair: chair ? spokenName(chair) : '',
		guest: full.guest ? spokenName(full.guest) : '',
		theme: m.theme ?? '',
		specialNote: m.specialNote ?? '',
		announcements: full.announcements,
		stakeChanges: m.stakeChanges,
		releases: full.callings.filter((c) => c.kind === 'entlassung'),
		sustainings: full.callings.filter((c) => c.kind === 'berufung'),
		hymns: { anfang: hymn('anfang'), abendmahl: hymn('abendmahl'), zwischen: hymn('zwischen'), schluss: hymn('schluss') },
		prayers: { opening: prayer(1), closing: prayer(2) },
		program: order.map((item) => {
			if (item.type === 'zwischenlied') return { label: 'Zwischenlied', detail: hymn('zwischen'), time: '' };
			const position = item.position;
			const t = talks.find((tt) => tt.position === position)!;
			return {
				label: `Ansprache ${t.position}`,
				detail: t.member ? spokenName(t.member) : '',
				time: t.durationMinutes ? `${t.durationMinutes} Min.` : ''
			};
		}),
		organist: full.organist ? spokenName(full.organist) : '',
		conductor: full.conductor ? spokenName(full.conductor) : '',
		texts: PRINT_TEXTS
	};
};
