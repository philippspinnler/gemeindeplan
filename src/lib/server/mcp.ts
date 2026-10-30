/**
 * Minimal MCP server (Streamable HTTP, answered as plain JSON, no SSE): initialize, ping, tools/list, tools/call.
 * Every call runs as the admin the personal key belongs to, through the same permission checks and change log as the app.
 */
import { userForMcpKey } from './auth';
import type { Db } from './db';
import { UserError } from './forms';
import { live } from './live';
import { readClasses, readSundays, setClassTopics, setSundayThemes, type DateResult, type McpUser } from './mcp-topics';

const PROTOCOLS = ['2025-06-18', '2025-03-26'];

const range = {
	type: 'object',
	properties: {
		von: { type: 'string', description: 'Erstes Datum, JJJJ-MM-TT' },
		bis: { type: 'string', description: 'Letztes Datum, JJJJ-MM-TT (höchstens 12 Monate nach von)' }
	},
	required: ['von', 'bis']
};
const overwrite = { type: 'boolean', description: 'true überschreibt bereits gesetzte Felder. Standard: false, dann werden nur leere Felder gefüllt.' };

const TOOLS = [
	{
		name: 'sonntage_lesen',
		description: 'Listet die Sonntage (Abendmahlsversammlung) im Zeitraum mit Art der Versammlung und Thema. programm=false heisst: an diesem Sonntag gibt es keine Versammlung mit Programm (z. B. Generalkonferenz).',
		inputSchema: range
	},
	{
		name: 'sonntagsthemen_setzen',
		description: 'Trägt Themen für Abendmahlsversammlungen ein. Ändert nur das Thema. Bestehende Themen bleiben, ausser ueberschreiben ist true. Meldet pro Datum, was eingetragen, übersprungen oder abgelehnt wurde.',
		inputSchema: {
			type: 'object',
			properties: {
				eintraege: { type: 'array', items: { type: 'object', properties: { datum: { type: 'string', description: 'Sonntag, JJJJ-MM-TT' }, thema: { type: 'string' } }, required: ['datum', 'thema'] } },
				ueberschreiben: overwrite
			},
			required: ['eintraege']
		}
	},
	{
		name: 'klassen_lesen',
		description: 'Listet die Sonntagsklassen der Jugend (JD/JM) im Zeitraum mit Thema und Link, ob sie stattfinden und ob JD und JM gemeinsam haben. themaJm ist gesetzt, wenn JM ein eigenes Thema hat.',
		inputSchema: range
	},
	{
		name: 'klassenthemen_setzen',
		description: 'Trägt Themen und Links für die Sonntagsklassen der Jugend ein. thema/link gelten für JD und JM, ausser thema_jm/link_jm geben JM ein eigenes Thema (nicht möglich bei gemeinsamer Klasse). Bestehende Felder bleiben, ausser ueberschreiben ist true. Links müssen mit http:// oder https:// beginnen.',
		inputSchema: {
			type: 'object',
			properties: {
				eintraege: {
					type: 'array',
					items: {
						type: 'object',
						properties: { datum: { type: 'string', description: 'Sonntag, JJJJ-MM-TT' }, thema: { type: 'string' }, link: { type: 'string' }, thema_jm: { type: 'string' }, link_jm: { type: 'string' } },
						required: ['datum']
					}
				},
				ueberschreiben: overwrite
			},
			required: ['eintraege']
		}
	}
];

type Args = Record<string, unknown>;
const str = (a: Args, k: string) => {
	if (typeof a[k] !== 'string') throw new UserError(`${k} fehlt.`);
	return a[k] as string;
};
function entries(a: Args) {
	if (!Array.isArray(a.eintraege) || !a.eintraege.every((e) => e && typeof e === 'object' && typeof e.datum === 'string')) throw new UserError('eintraege muss eine Liste mit datum sein.');
	return a.eintraege as { datum: string; [k: string]: unknown }[];
}
const optStr = (v: unknown) => (typeof v === 'string' ? v : undefined);
const wrote = (results: DateResult[]) => results.some((r) => r.status === 'eingetragen' || r.status === 'teilweise');

function runTool(db: Db, user: McpUser, name: string, a: Args): unknown {
	const overwriteAll = a.ueberschreiben === true;
	switch (name) {
		case 'sonntage_lesen':
			return readSundays(db, user, str(a, 'von'), str(a, 'bis'));
		case 'klassen_lesen':
			return readClasses(db, user, str(a, 'von'), str(a, 'bis'));
		case 'sonntagsthemen_setzen': {
			const results = setSundayThemes(db, user, entries(a).map((e) => ({ datum: e.datum, thema: optStr(e.thema) ?? '' })), overwriteAll);
			if (wrote(results)) live.changed('/mcp');
			return results;
		}
		case 'klassenthemen_setzen': {
			const results = setClassTopics(
				db,
				user,
				entries(a).map((e) => ({ datum: e.datum, thema: optStr(e.thema), link: optStr(e.link), thema_jm: optStr(e.thema_jm), link_jm: optStr(e.link_jm) })),
				overwriteAll
			);
			if (wrote(results)) live.changed('/mcp');
			return results;
		}
		default:
			throw new UserError(`Unbekanntes Tool: ${name}`);
	}
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const rpcError = (id: unknown, code: number, message: string) => json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export async function handleMcp(db: Db, request: Request, now = new Date()): Promise<Response> {
	const auth = request.headers.get('authorization') ?? '';
	const user = auth.startsWith('Bearer ') ? userForMcpKey(db, auth.slice(7).trim(), now) : null;
	if (!user) return new Response(JSON.stringify({ error: 'Nicht angemeldet' }), { status: 401, headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' } });

	let msg: { id?: unknown; method?: unknown; params?: Args };
	try {
		msg = await request.json();
	} catch {
		return rpcError(null, -32700, 'Parse error');
	}
	if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid request');
	if (msg.id === undefined) return new Response(null, { status: 202 });

	const ok = (result: unknown) => json({ jsonrpc: '2.0', id: msg.id, result });
	const params = msg.params ?? {};
	switch (msg.method) {
		case 'initialize': {
			const asked = params.protocolVersion;
			return ok({
				protocolVersion: typeof asked === 'string' && PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
				capabilities: { tools: {} },
				serverInfo: { name: 'gemeindeplan', version: '1' },
				instructions: 'Gemeindeplan: Themen der Abendmahlsversammlung und der Sonntagsklassen der Jugend lesen und eintragen. Vor dem Eintragen zuerst lesen, um zu sehen, was schon gesetzt ist.'
			});
		}
		case 'ping':
			return ok({});
		case 'tools/list':
			return ok({ tools: TOOLS });
		case 'tools/call': {
			try {
				const result = runTool(db, { id: user.id, role: user.role }, String(params.name), (params.arguments as Args) ?? {});
				return ok({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
			} catch (e) {
				if (!(e instanceof UserError)) console.error(e);
				return ok({ content: [{ type: 'text', text: e instanceof UserError ? e.message : 'Interner Fehler.' }], isError: true });
			}
		}
		default:
			return rpcError(msg.id, -32601, 'Method not found');
	}
}
