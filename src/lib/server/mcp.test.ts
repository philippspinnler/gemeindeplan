import { beforeEach, describe, expect, it } from 'vitest';
import { createMcpKey } from './auth';
import { createDb, type Db } from './db';
import { users } from './db/schema';
import { live } from './live';
import { handleMcp } from './mcp';
import { createMeeting } from './meetings';

let db: Db;
let key: string;

const rpc = (body: unknown, auth: string | null = `Bearer ${key}`) =>
	handleMcp(db, new Request('http://localhost/mcp', { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) }));
const call = async (name: string, args: unknown) => (await (await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } })).json()).result;

beforeEach(() => {
	db = createDb(':memory:');
	const u = db.insert(users).values({ email: 'eva@example.test', name: 'Eva Muster', role: 'admin', passwordHash: 'x' }).returning().get();
	key = createMcpKey(db, u.id);
	createMeeting(db, '2026-11-01');
});

describe('mcp endpoint', () => {
	it('rejects a request without a valid key with 401', async () => {
		for (const auth of [null, 'Bearer gp_falsch', key]) {
			const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, auth);
			expect(res.status).toBe(401);
			expect(res.headers.get('www-authenticate')).toBe('Bearer');
		}
	});

	it('initializes with the requested protocol version and lists four tools', async () => {
		const init = await (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).json();
		expect(init).toMatchObject({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'gemeindeplan' } } });
		const unknown = await (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } })).json();
		expect(unknown.result.protocolVersion).toBe('2025-06-18');
		const list = await (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
		expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(['sonntage_lesen', 'sonntagsthemen_setzen', 'klassen_lesen', 'klassenthemen_setzen']);
		expect(list.result.tools.every((t: { inputSchema: { type: string } }) => t.inputSchema.type === 'object')).toBe(true);
	});

	it('answers a notification with 202 and no body', async () => {
		const res = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
		expect(res.status).toBe(202);
		expect(await res.text()).toBe('');
	});

	it('calls a tool and returns its result as text content', async () => {
		const result = await call('sonntagsthemen_setzen', { eintraege: [{ datum: '2026-11-01', thema: 'Glaube' }] });
		expect(result.content[0].type).toBe('text');
		expect(JSON.parse(result.content[0].text)).toEqual([{ datum: '2026-11-01', status: 'eingetragen', eingetragen: ['Thema'] }]);
		const read = await call('sonntage_lesen', { von: '2026-11-01', bis: '2026-11-01' });
		expect(JSON.parse(read.content[0].text)[0].thema).toBe('Glaube');
	});

	it('reports tool errors as isError results, unknown methods as JSON-RPC -32601', async () => {
		const bad = await call('sonntage_lesen', { von: '2026-01-01', bis: '2028-01-01' });
		expect(bad).toMatchObject({ isError: true, content: [{ type: 'text', text: 'Höchstens 12 Monate auf einmal.' }] });
		expect((await call('gibts_nicht', {})).isError).toBe(true);
		const missing = await call('sonntagsthemen_setzen', {});
		expect(missing.isError).toBe(true);
		const res = await (await rpc({ jsonrpc: '2.0', id: 9, method: 'resources/list' })).json();
		expect(res).toMatchObject({ id: 9, error: { code: -32601 } });
		const parse = await handleMcp(db, new Request('http://localhost/mcp', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: '{' }));
		expect((await parse.json()).error.code).toBe(-32700);
	});

	it('publishes a live change only when something was written', async () => {
		const events: unknown[] = [];
		const stop = live.subscribe((e) => events.push(e));
		await call('sonntage_lesen', { von: '2026-11-01', bis: '2026-11-01' });
		expect(events).toEqual([]);
		await call('sonntagsthemen_setzen', { eintraege: [{ datum: '2026-11-01', thema: 'Glaube' }] });
		await call('sonntagsthemen_setzen', { eintraege: [{ datum: '2026-11-01', thema: 'Anders' }] });
		stop();
		expect(events).toEqual([{ kind: 'change', page: '/mcp' }]);
	});
});
