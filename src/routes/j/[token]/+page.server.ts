import { timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { todayIso } from '$lib/dates';
import { getSetting } from '$lib/server/settings';
import { youthPageItems, type YouthPageItem } from '$lib/server/youth-page';

const tokenMatches = (given: string, expected: string) =>
	given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

/** Only what the template renders leaves the server; Wednesday details (meeting point, what to bring) are meant for the youth. */
const publicItem = (i: YouthPageItem): YouthPageItem => {
	const sunday = i.weekday === 'sunday';
	return { ...i, parts: i.parts.map((p) => ({ ...p, details: sunday ? null : p.details, text: sunday ? null : p.text })) };
};

export const load: PageServerLoad = ({ params, locals, setHeaders }) => {
	const token = getSetting(locals.db, 'youth_page_token');
	if (!token || !tokenMatches(params.token, token)) error(404, 'Nicht gefunden');
	setHeaders({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
	const { notices, big, small } = youthPageItems(locals.db, todayIso());
	return { ward: getSetting(locals.db, 'ward_name'), notices, big: big.map(publicItem), small: small.map(publicItem) };
};
