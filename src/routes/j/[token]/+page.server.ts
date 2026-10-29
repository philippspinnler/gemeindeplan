import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { todayIso } from '$lib/dates';
import type { Db } from '$lib/server/db';
import { getSetting, youthTimes } from '$lib/server/settings';
import { publicItem, tokenMatches, youthPageItems, youthPageNames } from '$lib/server/youth-page';
import { listAdults, listYouth } from '$lib/server/youth-people';

export const load: PageServerLoad = ({ params, locals, setHeaders }) => {
	const token = getSetting(locals.db, 'youth_page_token');
	if (!token || !tokenMatches(params.token, token)) error(404, 'Nicht gefunden');
	setHeaders({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
	const { notices, big, small } = youthPageItems(locals.db, todayIso());
	return { ward: getSetting(locals.db, 'ward_name'), notices, big: big.map(publicItem), small: small.map(publicItem), calendar: calendarPeople(locals.db) };
};

/** Names for the "Nur meine" picker; the subscribe button stays hidden until the default times are set. */
function calendarPeople(db: Db) {
	if (!youthTimes(db)) return null;
	const names = youthPageNames(db);
	const people = (ids: number[]) => ids.map((id) => ({ id, name: names.get(id) ?? '' })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
	return { youth: people(listYouth(db).map((y) => y.member.id)), adults: people(listAdults(db).map((m) => m.id)) };
}
