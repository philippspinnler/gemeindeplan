import { timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { todayIso } from '$lib/dates';
import { getSetting } from '$lib/server/settings';
import { youthPageItems, type YouthPageItem } from '$lib/server/youth-page';

const tokenMatches = (given: string, expected: string) =>
	given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

/** The public page shows no internal details; only what the template renders leaves the server. */
const publicItem = (i: YouthPageItem): YouthPageItem => ({
	...i,
	parts: i.parts.map((p) => ({ ...p, details: null, text: i.weekday === 'sunday' ? null : p.text }))
});

export const load: PageServerLoad = ({ params, locals, setHeaders }) => {
	const token = getSetting(locals.db, 'youth_page_token');
	if (!token || !tokenMatches(params.token, token)) error(404, 'Nicht gefunden');
	setHeaders({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
	const { notices, big, small } = youthPageItems(locals.db, todayIso());
	return { ward: getSetting(locals.db, 'ward_name'), notices, big: big.map(publicItem), small: small.map(publicItem) };
};
