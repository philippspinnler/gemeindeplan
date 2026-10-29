import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { markNewsSeen } from '$lib/server/news';

/** "Verstanden" on the what's-new dialog. */
export const POST: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user) error(401, 'Bitte anmelden');
	if (request.headers.get('origin') !== url.origin) error(403, 'Ungültiger Ursprung');
	const body = (await request.json().catch(() => null)) as { count?: unknown } | null;
	markNewsSeen(locals.db, locals.user.id, Number(body?.count));
	return json({ ok: true });
};
