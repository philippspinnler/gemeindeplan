import { hash, verify } from '@node-rs/argon2';
import { and, desc, eq, gt, gte, isNull, lt, ne } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { collator } from '../table-sort';
import type { Db } from './db';
import { invites, loginAttempts, sessions, users, type Invite, type Role, type User } from './db/schema';

const SESSION_DAYS = 30;
const SESSION_RENEW_BELOW_DAYS = 15;
const INVITE_DAYS = 7;
const MAX_FAILED = 5;
const FAIL_WINDOW_MS = 15 * 60_000;
const THROTTLE_MS = 60_000;
const DAY_MS = 86_400_000;

export type SessionUser = Pick<User, 'id' | 'email' | 'name' | 'role'>;

const iso = (d: Date) => d.toISOString();
const token = () => randomBytes(32).toString('hex');
/** Cookies and invite links carry the raw token; the tables store only its hash, so a DB export yields no usable sessions or invites. */
const tokenKey = (raw: string) => createHash('sha256').update(raw).digest('hex');
const normEmail = (e: string) => e.trim().toLowerCase();
const MAX_EMAIL_LENGTH = 254;

export function hashPassword(pw: string): Promise<string> {
	return hash(pw);
}

export function verifyPassword(hashed: string, pw: string): Promise<boolean> {
	return verify(hashed, pw).catch(() => false);
}

export function userCount(db: Db): number {
	return db.select({ id: users.id }).from(users).all().length;
}

export function findUserByEmail(db: Db, email: string): User | undefined {
	return db.select().from(users).where(eq(users.email, normEmail(email))).get();
}

export async function createUser(
	db: Db,
	input: { email: string; name: string; role: Role; password: string }
): Promise<User> {
	const passwordHash = await hashPassword(input.password);
	return db
		.insert(users)
		.values({ email: normEmail(input.email), name: input.name.trim(), role: input.role, passwordHash })
		.returning()
		.get();
}

function isThrottled(db: Db, email: string, now: Date): boolean {
	const since = iso(new Date(now.getTime() - FAIL_WINDOW_MS));
	const failed = db
		.select({ at: loginAttempts.attemptedAt })
		.from(loginAttempts)
		.where(and(eq(loginAttempts.email, email), eq(loginAttempts.success, false), gte(loginAttempts.attemptedAt, since)))
		.orderBy(desc(loginAttempts.attemptedAt))
		.all();
	if (failed.length < MAX_FAILED) return false;
	const last = new Date(failed[0].at).getTime();
	return now.getTime() - last < THROTTLE_MS;
}

export async function loginWithPassword(
	db: Db,
	email: string,
	password: string,
	now: Date = new Date()
): Promise<{ ok: true; user: User } | { ok: false; reason: 'invalid' | 'throttled' }> {
	const e = normEmail(email);
	if (e.length > MAX_EMAIL_LENGTH) return { ok: false, reason: 'invalid' };
	if (isThrottled(db, e, now)) return { ok: false, reason: 'throttled' };
	const user = db.select().from(users).where(eq(users.email, e)).get();
	const valid = !!user && user.active && (await verifyPassword(user.passwordHash, password));
	db.insert(loginAttempts).values({ email: e, attemptedAt: iso(now), success: valid }).run();
	if (!valid || !user) return { ok: false, reason: 'invalid' };
	return { ok: true, user };
}

export function pruneLoginAttempts(db: Db, now: Date = new Date()): void {
	const cutoff = iso(new Date(now.getTime() - DAY_MS));
	db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, cutoff)).run();
}

export function createSession(db: Db, userId: number, now: Date = new Date()): { id: string; expiresAt: string } {
	const id = token();
	const expiresAt = iso(new Date(now.getTime() + SESSION_DAYS * DAY_MS));
	db.insert(sessions).values({ id: tokenKey(id), userId, expiresAt }).run();
	return { id, expiresAt };
}

export function validateSession(
	db: Db,
	rawSessionId: string,
	now: Date = new Date()
): { user: SessionUser; expiresAt: string } | null {
	const sessionId = tokenKey(rawSessionId);
	const row = db
		.select({ expiresAt: sessions.expiresAt, id: users.id, email: users.email, name: users.name, role: users.role, active: users.active })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, sessionId))
		.get();
	if (!row || !row.active) return null;
	let expiresAt = row.expiresAt;
	if (new Date(expiresAt).getTime() <= now.getTime()) {
		db.delete(sessions).where(eq(sessions.id, sessionId)).run();
		return null;
	}
	if (new Date(expiresAt).getTime() - now.getTime() < SESSION_RENEW_BELOW_DAYS * DAY_MS) {
		expiresAt = iso(new Date(now.getTime() + SESSION_DAYS * DAY_MS));
		db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId)).run();
	}
	return { user: { id: row.id, email: row.email, name: row.name, role: row.role }, expiresAt };
}

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Changes the own password after checking the old one. All other sessions of the person
 * are ended; the current one (keepSessionId) stays.
 */
export async function changePassword(
	db: Db,
	userId: number,
	currentPassword: string,
	newPassword: string,
	keepSessionId: string | null = null
): Promise<'ok' | 'wrong' | 'weak'> {
	if (newPassword.length < MIN_PASSWORD_LENGTH) return 'weak';
	const user = db.select().from(users).where(eq(users.id, userId)).get();
	if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) return 'wrong';
	const passwordHash = await hashPassword(newPassword);
	db.update(users).set({ passwordHash, updatedAt: iso(new Date()) }).where(eq(users.id, userId)).run();
	const others = keepSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, tokenKey(keepSessionId))) : eq(sessions.userId, userId);
	db.delete(sessions).where(others).run();
	return 'ok';
}

export function deleteSession(db: Db, rawSessionId: string): void {
	db.delete(sessions).where(eq(sessions.id, tokenKey(rawSessionId))).run();
}

export function createInvite(
	db: Db,
	input: { email: string; name: string; role: Role; createdBy: number },
	now: Date = new Date()
): Invite {
	const raw = token();
	const inv = db
		.insert(invites)
		.values({
			token: tokenKey(raw),
			email: normEmail(input.email),
			name: input.name.trim(),
			role: input.role,
			createdBy: input.createdBy,
			expiresAt: iso(new Date(now.getTime() + INVITE_DAYS * DAY_MS))
		})
		.returning()
		.get();
	return { ...inv, token: raw };
}

export function getValidInvite(db: Db, tok: string, now: Date = new Date()): Invite | null {
	const inv = db.select().from(invites).where(eq(invites.token, tokenKey(tok))).get();
	if (!inv || inv.usedAt || new Date(inv.expiresAt).getTime() <= now.getTime()) return null;
	return inv;
}

/** Creates the account, or, if one exists for the invited e-mail, sets its new password (admin-issued reset). */
export async function acceptInvite(db: Db, tok: string, password: string, now: Date = new Date()): Promise<User | null> {
	const inv = getValidInvite(db, tok, now);
	if (!inv) return null;
	const result = db.update(invites).set({ usedAt: iso(now) }).where(and(eq(invites.id, inv.id), isNull(invites.usedAt))).run();
	if (result.changes === 0) return null;
	const existing = findUserByEmail(db, inv.email);
	if (!existing) return createUser(db, { email: inv.email, name: inv.name, role: inv.role, password });
	const passwordHash = await hashPassword(password);
	db.update(users).set({ passwordHash, updatedAt: iso(now) }).where(eq(users.id, existing.id)).run();
	db.delete(sessions).where(eq(sessions.userId, existing.id)).run();
	return { ...existing, passwordHash };
}

export function listUsers(db: Db): User[] {
	return db.select().from(users).all().sort((a, b) => collator.compare(a.name, b.name));
}

export function listOpenInvites(db: Db, now: Date = new Date()): Invite[] {
	return db
		.select()
		.from(invites)
		.where(and(isNull(invites.usedAt), gt(invites.expiresAt, iso(now))))
		.orderBy(desc(invites.createdAt))
		.all();
}

export function deleteInvite(db: Db, id: number): void {
	db.delete(invites).where(eq(invites.id, id)).run();
}

export function updateUserRole(db: Db, id: number, role: Role): void {
	db.update(users).set({ role, updatedAt: iso(new Date()) }).where(eq(users.id, id)).run();
}

export function setUserMember(db: Db, id: number, memberId: number | null): void {
	db.update(users).set({ memberId, updatedAt: iso(new Date()) }).where(eq(users.id, id)).run();
}

export function setUserActive(db: Db, id: number, active: boolean): void {
	db.update(users).set({ active, updatedAt: iso(new Date()) }).where(eq(users.id, id)).run();
	if (!active) db.delete(sessions).where(eq(sessions.userId, id)).run();
}
