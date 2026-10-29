import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { todayIso } from '$lib/dates';
import { getSetting } from '$lib/server/settings';
import { publicItem, tokenMatches, youthPageItems } from '$lib/server/youth-page';

export const load: PageServerLoad = ({ params, locals, setHeaders }) => {
	const token = getSetting(locals.db, 'youth_page_token');
	if (!token || !tokenMatches(params.token, token)) error(404, 'Nicht gefunden');
	setHeaders({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
	const { notices, big, small } = youthPageItems(locals.db, todayIso());
	return { ward: getSetting(locals.db, 'ward_name'), notices, big: big.map(publicItem), small: small.map(publicItem) };
};
