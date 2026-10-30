import type { RequestHandler } from './$types';
import { handleMcp } from '$lib/server/mcp';

export const POST: RequestHandler = ({ request, locals }) => handleMcp(locals.db, request);

const notAllowed: RequestHandler = () => new Response(null, { status: 405, headers: { allow: 'POST' } });
export const GET = notAllowed;
export const DELETE = notAllowed;
