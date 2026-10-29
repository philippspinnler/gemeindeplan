import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { todayIso } from '$lib/dates';
import type { Db } from '$lib/server/db';
import { getSetting, youthTimes } from '$lib/server/settings';
import { eq } from 'drizzle-orm';
import { users } from '$lib/server/db/schema';
import { calendarSelf } from '$lib/server/youth-calendar';
import { publicItem, tokenMatches, youthPageItems } from '$lib/server/youth-page';

export const load: PageServerLoad = ({ params, locals, setHeaders }) => {
	const token = getSetting(locals.db, 'youth_page_token');
	if (!token || !tokenMatches(params.token, token)) error(404, 'Nicht gefunden');
	setHeaders({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
	const { notices, big, small } = youthPageItems(locals.db, todayIso());
	return { ward: getSetting(locals.db, 'ward_name'), notices, big: big.map(publicItem), small: small.map(publicItem), calendar: calendarOptions(locals.db, locals.user?.id ?? null) };
};

/** The subscribe button stays hidden until the default times are set; only a logged-in, linked user may pick "Nur meine Termine". */
function calendarOptions(db: Db, userId: number | null) {
	if (!youthTimes(db)) return null;
	const memberId = userId ? (db.select({ memberId: users.memberId }).from(users).where(eq(users.id, userId)).get()?.memberId ?? null) : null;
	return { self: calendarSelf(db, memberId) };
}
