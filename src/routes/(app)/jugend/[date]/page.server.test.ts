import { describe, expect, it } from 'vitest';
import { createDb } from '$lib/server/db';
import type { Role } from '$lib/server/db/schema';
import { createUser } from '$lib/server/auth';
import { listIdeas, createIdea } from '$lib/server/youth-ideas';
import { ensureYouthEvents, loadYouthEvent, saveYouthCommon, saveYouthPart, youthSectionVersions } from '$lib/server/youth';
import { createMember } from '$lib/server/members';
import { setYouth } from '$lib/server/youth-people';
import { youthPageItems } from '$lib/server/youth-page';
import { createMeeting, saveGeneral } from '$lib/server/meetings';
import { users } from '$lib/server/db/schema';
import { actions, load } from './+page.server';

const WED = '2026-10-21';

function setup(role: Role) {
	const db = createDb(':memory:');
	ensureYouthEvents(db, WED, 0);
	const user = db.insert(users).values({ email: 'test@example.org', name: 'Tina Test', role, passwordHash: 'x' }).returning().get();
	return { db, locals: { db, user } };
}

function call(action: keyof typeof actions, locals: unknown, fields: Record<string, string>) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	const request = new Request('http://x', { method: 'POST', body: fd });
	return actions[action]({ request, locals, params: { date: WED } } as never);
}

describe('youth event actions', () => {
	it('rejects jd for jm_berater', async () => {
		const { locals } = setup('jm_berater');
		await expect(call('jd', locals, {})).rejects.toMatchObject({ status: 403 });
	});

	it('rejects jm for jd_leitung', async () => {
		const { locals } = setup('jd_leitung');
		await expect(call('jm', locals, {})).rejects.toMatchObject({ status: 403 });
	});

	it('lets jm_berater save the joint part', async () => {
		const { db, locals } = setup('jm_berater');
		const id = loadYouthEvent(db, WED)!.event.id;
		saveYouthCommon(db, id, { kind: 'aktivitaet', joint: true, details: null, topic: null, topicUrl: null, snack: null });
		const version = youthSectionVersions(loadYouthEvent(db, WED)!).both;
		const result = await call('both', locals, { version, text: 'Bowling' });
		expect(result).toEqual({ saved: 'both' });
		expect(loadYouthEvent(db, WED)!.parts[0]).toMatchObject({ side: 'both', text: 'Bowling' });
	});

	it('saves common details with the current version', async () => {
		const { db, locals } = setup('jd_leitung');
		const version = youthSectionVersions(loadYouthEvent(db, WED)!).common;
		const result = await call('common', locals, { version, kind: 'aktivitaet', details: 'Treffpunkt Kirche' });
		expect(result).toEqual({ saved: 'common' });
		expect(loadYouthEvent(db, WED)!.event.details).toBe('Treffpunkt Kirche');
	});

	it('rejects a non-calendar date', () => {
		const { locals } = setup('admin');
		expect(() => load({ locals, params: { date: '2026-06-31' } } as never)).toThrow(expect.objectContaining({ status: 404 }));
	});

	it('on a Wednesday the kind alone decides whether it is joint', async () => {
		const { db, locals } = setup('jd_leitung');
		const save = (kind: string, joint?: string) => call('common', locals, { version: youthSectionVersions(loadYouthEvent(db, WED)!).common, kind, ...(joint ? { joint } : {}) });
		await save('gemeinsam_jm');
		expect(loadYouthEvent(db, WED)!.event).toMatchObject({ kind: 'gemeinsam_jm', joint: true });
		await save('aktivitaet', '1');
		expect(loadYouthEvent(db, WED)!.event).toMatchObject({ kind: 'aktivitaet', joint: false });
		await save('basel');
		expect(loadYouthEvent(db, WED)!.event).toMatchObject({ kind: 'basel', joint: true });
	});

	it('"kein Snack nötig" drops a typed snack; a cancelled seminar shows on the youth page', async () => {
		const { db, locals } = setup('jd_leitung');
		const version = youthSectionVersions(loadYouthEvent(db, WED)!).common;
		await call('common', locals, { version, kind: 'aktivitaet', snack: 'Kuchen', noSnack: '1', noSeminar: '1' });
		expect(loadYouthEvent(db, WED)!.event).toMatchObject({ snack: null, noSnack: true, noSeminar: true });
		expect(youthPageItems(db, WED).big[0]).toMatchObject({ snack: 'keiner', noSeminar: true });
	});

	it('plans only open ideas of the saved side', async () => {
		const { db, locals } = setup('jd_leitung');
		const user = await createUser(db, { email: 'ida@example.org', name: 'Ida Idee', role: 'admin', password: 'geheim123' });
		const jmIdea = createIdea(db, { text: 'Grillen', side: 'jm', note: null, createdBy: user.id });
		const jdIdea = createIdea(db, { text: 'Bowling', side: 'jd', note: null, createdBy: user.id });
		const versions = () => youthSectionVersions(loadYouthEvent(db, WED)!);
		const planned = () => listIdeas(db, { open: false }).map((i) => i.id);

		const both = await call('both', locals, { version: versions().both, text: 'Grillen', ideaId: String(jmIdea.id) });
		expect(both).toMatchObject({ status: 409 });
		await call('jd', locals, { version: versions().jd, text: 'Grillen', ideaId: String(jmIdea.id) });
		expect(planned()).toEqual([]);

		await call('jd', locals, { version: versions().jd, text: 'Bowling', ideaId: String(jdIdea.id) });
		expect(planned()).toEqual([jdIdea.id]);
	});

	it('treats a Sunday without class as off', () => {
		const { db, locals } = setup('admin');
		const m = createMeeting(db, '2026-10-25');
		saveGeneral(db, m.id, { kind: 'generalkonferenz' } as Parameters<typeof saveGeneral>[2]);
		const data = load({ locals, params: { date: '2026-10-25' } } as never) as { off: boolean; offNotice: string | null };
		expect(data.off).toBe(true);
		expect(data.offNotice).toBe('Generalkonferenz');
	});

	it('keeps an assigned teacher from the other side selectable', () => {
		const { db, locals } = setup('admin');
		const boy = createMember(db, { firstName: 'Urs', lastName: 'Koller' });
		setYouth(db, boy.id, 'jm', 'priester');
		saveYouthPart(db, loadYouthEvent(db, WED)!.event.id, 'jd', { text: null, leaderMemberId: null, leaderGroup: null, teacherMemberId: boy.id });
		const data = load({ locals, params: { date: WED } } as never) as { jdTeacherOptions: { id: number }[] };
		expect(data.jdTeacherOptions.map((o) => o.id)).toContain(boy.id);
	});
});
