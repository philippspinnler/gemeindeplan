import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './db';
import { invites, loginAttempts, sessions } from './db/schema';
import {
	acceptInvite, changePassword, createInvite, createSession, createUser, deleteSession, findUserByEmail, getValidInvite,
	hashPassword, listOpenInvites, loginWithPassword, setUserMember, userCount, validateSession, verifyPassword
} from './auth';
import { createMember } from './members';

let db: Db;
beforeEach(() => {
	db = createDb(':memory:');
});

describe('passwords', () => {
	it('hashes and verifies', async () => {
		const h = await hashPassword('geheim123');
		expect(h).not.toContain('geheim123');
		expect(await verifyPassword(h, 'geheim123')).toBe(true);
		expect(await verifyPassword(h, 'falsch')).toBe(false);
	});
});

describe('change password', () => {
	it('checks the old password, requires 8 characters and ends other sessions', async () => {
		const u = await createUser(db, { email: 'a@b.ch', name: 'A', role: 'musik', password: 'geheim123' });
		const keep = createSession(db, u.id);
		const other = createSession(db, u.id);
		expect(await changePassword(db, u.id, 'falsch', 'neuesPasswort', keep.id)).toBe('wrong');
		expect(await changePassword(db, u.id, 'geheim123', 'kurz', keep.id)).toBe('weak');
		expect(await changePassword(db, u.id, 'geheim123', 'neuesPasswort', keep.id)).toBe('ok');
		expect((await loginWithPassword(db, 'a@b.ch', 'neuesPasswort')).ok).toBe(true);
		expect((await loginWithPassword(db, 'a@b.ch', 'geheim123')).ok).toBe(false);
		expect(validateSession(db, keep.id)).not.toBeNull();
		expect(validateSession(db, other.id)).toBeNull();
	});
});

describe('login', () => {
	it('logs users in and rejects wrong passwords', async () => {
		expect(userCount(db)).toBe(0);
		await createUser(db, { email: 'Admin@Example.ch', name: 'Admin', role: 'admin', password: 'geheim123' });
		expect(userCount(db)).toBe(1);
		const ok = await loginWithPassword(db, 'admin@example.ch', 'geheim123');
		expect(ok.ok).toBe(true);
		const bad = await loginWithPassword(db, 'admin@example.ch', 'nein');
		expect(bad).toEqual({ ok: false, reason: 'invalid' });
	});
	it('throttles after five failed attempts', async () => {
		await createUser(db, { email: 'a@b.ch', name: 'A', role: 'admin', password: 'geheim123' });
		const t0 = new Date('2026-09-07T10:00:00Z');
		for (let i = 0; i < 5; i++) {
			await loginWithPassword(db, 'a@b.ch', 'nein', new Date(t0.getTime() + i * 1000));
		}
		const throttled = await loginWithPassword(db, 'a@b.ch', 'geheim123', new Date(t0.getTime() + 10_000));
		expect(throttled).toEqual({ ok: false, reason: 'throttled' });
		const later = await loginWithPassword(db, 'a@b.ch', 'geheim123', new Date(t0.getTime() + 70_000));
		expect(later.ok).toBe(true);
	});
	it('does not record over-long emails', async () => {
		const r = await loginWithPassword(db, 'x'.repeat(300) + '@a.test', 'p');
		expect(r).toEqual({ ok: false, reason: 'invalid' });
		expect(db.select().from(loginAttempts).all()).toHaveLength(0);
	});
	it('rejects inactive users', async () => {
		const u = await createUser(db, { email: 'a@b.ch', name: 'A', role: 'musik', password: 'geheim123' });
		const { setUserActive } = await import('./auth');
		setUserActive(db, u.id, false);
		expect(await loginWithPassword(db, 'a@b.ch', 'geheim123')).toEqual({ ok: false, reason: 'invalid' });
	});
});

describe('sessions', () => {
	it('creates, validates, extends and deletes', async () => {
		const u = await createUser(db, { email: 'a@b.ch', name: 'A', role: 'musik', password: 'geheim123' });
		const t0 = new Date('2026-09-07T10:00:00Z');
		const s = createSession(db, u.id, t0);
		const v = validateSession(db, s.id, t0);
		expect(v?.user).toEqual({ id: u.id, email: 'a@b.ch', name: 'A', role: 'musik' });
		const t20 = new Date(t0.getTime() + 20 * 86_400_000);
		const v2 = validateSession(db, s.id, t20);
		expect(v2).not.toBeNull();
		expect(v2!.expiresAt > s.expiresAt).toBe(true);
		const t40 = new Date(t0.getTime() + 60 * 86_400_000);
		expect(validateSession(db, s.id, t40)).toBeNull();
		deleteSession(db, s.id);
		expect(validateSession(db, s.id, t0)).toBeNull();
	});
	it('stores only a hash of the session id', async () => {
		const u = await createUser(db, { email: 'a@b.ch', name: 'A', role: 'musik', password: 'geheim123' });
		const s = createSession(db, u.id);
		const rows = db.select().from(sessions).all();
		expect(rows).toHaveLength(1);
		expect(rows[0].id).not.toBe(s.id);
		expect(validateSession(db, rows[0].id)).toBeNull();
		expect(validateSession(db, s.id)).not.toBeNull();
	});
	it('deletes sessions on deactivation', async () => {
		const u = await createUser(db, { email: 'a@b.ch', name: 'A', role: 'musik', password: 'geheim123' });
		const t0 = new Date('2026-09-07T10:00:00Z');
		const s = createSession(db, u.id, t0);
		const v = validateSession(db, s.id, t0);
		expect(v?.user).not.toBeNull();
		const { setUserActive } = await import('./auth');
		setUserActive(db, u.id, false);
		expect(validateSession(db, s.id, t0)).toBeNull();
	});
});

describe('invites', () => {
	it('creates and redeems an invite', async () => {
		const admin = await createUser(db, { email: 'a@b.ch', name: 'A', role: 'admin', password: 'geheim123' });
		const t0 = new Date('2026-09-07T10:00:00Z');
		const inv = createInvite(db, { email: 'M@b.ch', name: 'Musik', role: 'musik', createdBy: admin.id }, t0);
		expect(inv.token).toHaveLength(64);
		expect(listOpenInvites(db, t0)).toHaveLength(1);
		expect(getValidInvite(db, inv.token, t0)?.email).toBe('m@b.ch');
		expect(db.select().from(invites).all()[0].token).not.toBe(inv.token);
		const user = await acceptInvite(db, inv.token, 'passwort1', t0);
		expect(user?.role).toBe('musik');
		expect(getValidInvite(db, inv.token, t0)).toBeNull();
		expect(listOpenInvites(db, t0)).toHaveLength(0);
	});
	it('an invite for a member links the new account and takes its name', async () => {
		const admin = await createUser(db, { email: 'a@b.ch', name: 'A', role: 'admin', password: 'geheim123' });
		const eva = createMember(db, { firstName: 'Eva', lastName: 'Probe' });
		const inv = createInvite(db, { email: 'e@b.ch', memberId: eva.id, role: 'jd_leitung', createdBy: admin.id });
		const user = await acceptInvite(db, inv.token, 'passwort1');
		expect([user?.name, user?.memberId]).toEqual(['Eva Probe', eva.id]);
	});
	it('linking an existing account to a member takes its name', async () => {
		const u = await createUser(db, { email: 'a@b.ch', name: 'A', role: 'admin', password: 'geheim123' });
		const max = createMember(db, { firstName: 'Max', lastName: 'Test' });
		setUserMember(db, u.id, max.id);
		expect(findUserByEmail(db, 'a@b.ch')).toMatchObject({ name: 'Max Test', memberId: max.id });
		setUserMember(db, u.id, null);
		expect(findUserByEmail(db, 'a@b.ch')).toMatchObject({ name: 'Max Test', memberId: null });
	});
	it('rejects expired invites', async () => {
		const admin = await createUser(db, { email: 'a@b.ch', name: 'A', role: 'admin', password: 'geheim123' });
		const t0 = new Date('2026-09-07T10:00:00Z');
		const inv = createInvite(db, { email: 'm@b.ch', name: 'M', role: 'musik', createdBy: admin.id }, t0);
		const t8 = new Date(t0.getTime() + 8 * 86_400_000);
		expect(getValidInvite(db, inv.token, t8)).toBeNull();
		expect(await acceptInvite(db, inv.token, 'passwort1', t8)).toBeNull();
	});
	it('single-use invite can be accepted only once', async () => {
		const admin = await createUser(db, { email: 'a@b.ch', name: 'A', role: 'admin', password: 'geheim123' });
		const t0 = new Date('2026-09-07T10:00:00Z');
		const inv = createInvite(db, { email: 'm@b.ch', name: 'M', role: 'musik', createdBy: admin.id }, t0);
		expect(userCount(db)).toBe(1);
		const user1 = await acceptInvite(db, inv.token, 'passwort1', t0);
		expect(user1).not.toBeNull();
		expect(userCount(db)).toBe(2);
		const user2 = await acceptInvite(db, inv.token, 'passwort2', t0);
		expect(user2).toBeNull();
		expect(userCount(db)).toBe(2);
	});
});

describe('findUserByEmail', () => {
	it('finds users case-insensitively', async () => {
		await createUser(db, { email: 'A@B.ch', name: 'A', role: 'admin', password: 'geheim123' });
		expect(findUserByEmail(db, ' a@b.ch ')?.name).toBe('A');
		expect(findUserByEmail(db, 'nichts@da.ch')).toBeUndefined();
	});
});

describe('password reset via invite', () => {
	it('an invite for an existing e-mail sets a new password and ends old sessions', async () => {
		const db = createDb(':memory:');
		const admin = await createUser(db, { email: 'a@b.ch', name: 'Admin', role: 'admin', password: 'geheim123' });
		const user = await createUser(db, { email: 'm@b.ch', name: 'Mia Muster', role: 'musik', password: 'altesPasswort' });
		const session = createSession(db, user.id);
		const inv = createInvite(db, { email: 'M@b.ch', name: 'Mia Muster', role: 'musik', createdBy: admin.id });
		const back = await acceptInvite(db, inv.token, 'neuesPasswort');
		expect(back?.id).toBe(user.id);
		expect(validateSession(db, session.id)).toBeNull();
		expect((await loginWithPassword(db, 'm@b.ch', 'neuesPasswort')).ok).toBe(true);
		expect((await loginWithPassword(db, 'm@b.ch', 'altesPasswort')).ok).toBe(false);
		expect(getValidInvite(db, inv.token)).toBeNull();
	});
});
