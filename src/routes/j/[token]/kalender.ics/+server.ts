import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { todayIso } from '$lib/dates';
import { youthFeed } from '$lib/server/youth-calendar';

export const GET: RequestHandler = ({ params, url, locals }) => {
	const ics = youthFeed(locals.db, params.token, url.searchParams, todayIso());
	if (ics === null) error(404, 'Nicht gefunden');
	return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
};
