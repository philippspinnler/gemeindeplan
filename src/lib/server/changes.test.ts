import { beforeEach, describe, expect, it } from 'vitest';
import type { ChangeRef } from './change-sections';
import { listChanges, recordChanges, resetChange } from './changes';
import { createDb, type Db } from './db';
import { changes, users, type Role } from './db/schema';
import { UserError } from './forms';
import { createMember } from './members';
import { createMeeting, loadMeetingFullByDate, saveConductor, saveGeneral, savePrayers } from './meetings';
import { requestScope } from './recording';

let db: Db;
let meetingId: number;
let anna: number;
let max: number;
const date = '2026-11-01';
const t0 = new Date('2026-10-30T18:00:00Z');
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);
const programm: ChangeRef = { section: 'sonntag.programm', key: date };
const gebete: ChangeRef = { section: 'sonntag.gebete', key: date };

const addUser = (name: string, role: Role) =>
	db.insert(users).values({ email: `${name.toLowerCase()}@example.test`, name, role, passwordHash: 'x' }).returning().get();
const general = (theme: string | null) =>
	saveGeneral(db, meetingId, { kind: 'normal', theme, specialNote: null, presidingMemberId: null, absences: null });
const setTheme = (userId: number, theme: string, at: Date) => recordChanges(db, userId, [programm], () => general(theme), at);
const setPrayer = (userId: number, memberId: number | null, at: Date) =>
	recordChanges(db, userId, [gebete], () => savePrayers(db, meetingId, [{ position: 2, memberId }]), at);
const rows = () => db.select().from(changes).all();
const theme = () => loadMeetingFullByDate(db, date)!.meeting.theme;

let u1: number;
let u2: number;

beforeEach(() => {
	db = createDb(':memory:');
	meetingId = createMeeting(db, date).id;
	anna = createMember(db, { firstName: 'Anna', lastName: 'Muster' }).id;
	max = createMember(db, { firstName: 'Max', lastName: 'Test' }).id;
	u1 = addUser('Eva', 'admin').id;
	u2 = addUser('Tim', 'bischofschaft').id;
});

describe('recording', () => {
	it('logs one entry per changed section', () => {
		recordChanges(db, u1, [programm, gebete], () => {
			general('Glaube');
			savePrayers(db, meetingId, []);
		}, t0);
		expect(rows().map((r) => r.section)).toEqual(['sonntag.programm']);
	});

	it('writes nothing when nothing changed', () => {
		recordChanges(db, u1, [programm, gebete], () => general(null), t0);
		expect(rows()).toEqual([]);
	});

	it('rolls back data and entry when the save throws', () => {
		expect(() =>
			recordChanges(db, u1, [programm], () => {
				general('Glaube');
				throw new UserError('kaputt');
			}, t0)
		).toThrow('kaputt');
		expect(theme()).toBeNull();
		expect(rows()).toEqual([]);
	});

	it("merges the same user's saves within 5 minutes", () => {
		setTheme(u1, 'A', t0);
		setTheme(u1, 'B', minutes(4));
		expect(rows()).toHaveLength(1);
		expect(JSON.parse(rows()[0].before!).theme).toBeNull();
		expect(JSON.parse(rows()[0].after!).theme).toBe('B');
		setTheme(u1, 'C', minutes(10));
		expect(rows()).toHaveLength(2);
	});

	it("does not merge across another user's save", () => {
		setTheme(u1, 'A', t0);
		setTheme(u2, 'B', minutes(1));
		setTheme(u1, 'C', minutes(2));
		expect(rows()).toHaveLength(3);
	});

	it('drops a merged entry that ends where it started', () => {
		general('A');
		setTheme(u1, 'B', t0);
		setTheme(u1, 'A', minutes(1));
		expect(rows()).toEqual([]);
	});

	it('prunes entries older than 90 days', () => {
		setTheme(u1, 'A', new Date(t0.getTime() - 91 * 86_400_000));
		setTheme(u1, 'B', t0);
		expect(rows()).toHaveLength(1);
		expect(rows()[0].at).toBe(t0.toISOString());
	});
});

describe('listing', () => {
	it('describes changes with names', () => {
		setPrayer(u1, max, t0);
		expect(listChanges(db, 'admin')[0].lines).toEqual(['Schlussgebet: – → Max Test']);
	});

	it("shows entries only to roles with the section's permission", () => {
		setPrayer(u1, max, t0);
		recordChanges(db, u1, [{ section: 'sonntag.leitung', key: date }], () => saveConductor(db, meetingId, anna), t0);
		expect(listChanges(db, 'dirigent').map((c) => c.section)).toEqual(['sonntag.leitung']);
		expect(listChanges(db, 'gebete').map((c) => c.section)).toEqual(['sonntag.gebete']);
	});

	it('lists the newest entry first with a readable user name and target link', () => {
		setPrayer(u1, max, t0);
		setTheme(u2, 'Glaube', minutes(1));
		const [first, second] = listChanges(db, 'admin');
		expect(first.section).toBe('sonntag.programm');
		expect(first.userName).toBe('Tim');
		expect(first.target.href).toBe('/sonntag/2026-11-01');
		expect(second.userName).toBe('Eva');
	});
});

describe('reset', () => {
	it('resets a section to the state before the entry', () => {
		setPrayer(u1, max, t0);
		const [entry] = listChanges(db, 'admin');
		expect(resetChange(db, { id: u2, role: 'bischofschaft' }, entry.id, false, minutes(1))).toEqual({ ok: true });
		expect(loadMeetingFullByDate(db, date)!.prayers.find((p) => p.position === 2)?.member ?? null).toBeNull();
		expect(rows()).toHaveLength(2);
	});

	it('asks before overwriting a newer change', () => {
		setPrayer(u1, max, t0);
		const [entry] = listChanges(db, 'admin');
		setPrayer(u2, anna, minutes(1));
		const result = resetChange(db, { id: u1, role: 'admin' }, entry.id, false, minutes(2));
		expect(result).toEqual({ conflict: { name: 'Tim', at: minutes(1).toISOString() } });
		expect(loadMeetingFullByDate(db, date)!.prayers.find((p) => p.position === 2)?.member?.id).toBe(anna);
		expect(resetChange(db, { id: u1, role: 'admin' }, entry.id, true, minutes(3))).toEqual({ ok: true });
		expect(loadMeetingFullByDate(db, date)!.prayers.find((p) => p.position === 2)?.member ?? null).toBeNull();
	});

	it('refuses reset without permission', () => {
		setPrayer(u1, max, t0);
		const [entry] = listChanges(db, 'admin');
		expect(() => resetChange(db, { id: u2, role: 'musik' }, entry.id, false, minutes(1))).toThrow(UserError);
	});
});

describe('guard', () => {
	it('throws for a write in a request scope outside recordChanges', () => {
		expect(() => requestScope(() => savePrayers(db, meetingId, []))).toThrow();
		expect(() => requestScope(() => recordChanges(db, u1, [gebete], () => savePrayers(db, meetingId, [])))).not.toThrow();
		expect(() => savePrayers(db, meetingId, [])).not.toThrow();
	});
});
