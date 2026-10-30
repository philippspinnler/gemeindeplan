import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from './db';
import { members, stakeCallings, type StakeCalling } from './db/schema';
import { UserError } from './forms';
import { assertRecording } from './recording';

export function listStakeCallings(db: Db): StakeCalling[] {
	return db.select().from(stakeCallings).orderBy(asc(stakeCallings.position), asc(stakeCallings.name)).all();
}

export function findStakeCallingByName(db: Db, name: string): StakeCalling | undefined {
	const wanted = name.trim().toLowerCase();
	return listStakeCallings(db).find((c) => c.name.toLowerCase() === wanted);
}

export function createStakeCalling(db: Db, name: string): StakeCalling {
	assertRecording();
	const clean = name.trim();
	if (!clean) throw new UserError('Name darf nicht leer sein');
	if (findStakeCallingByName(db, clean)) throw new UserError('Berufung existiert bereits');
	const max = db.select({ m: sql<number>`coalesce(max(${stakeCallings.position}), 0)` }).from(stakeCallings).get()?.m ?? 0;
	return db.insert(stakeCallings).values({ name: clean, position: max + 1 }).returning().get();
}

export function ensureStakeCalling(db: Db, name: string): StakeCalling {
	return findStakeCallingByName(db, name) ?? createStakeCalling(db, name);
}

export function renameStakeCalling(db: Db, id: number, name: string): void {
	assertRecording();
	const clean = name.trim();
	if (!clean) throw new UserError('Name darf nicht leer sein');
	const other = findStakeCallingByName(db, clean);
	if (other && other.id !== id) throw new UserError('Berufung existiert bereits');
	db.update(stakeCallings).set({ name: clean }).where(eq(stakeCallings.id, id)).run();
}

export function setStakeCallingPresides(db: Db, id: number, presides: boolean): void {
	assertRecording();
	db.update(stakeCallings).set({ presides }).where(eq(stakeCallings.id, id)).run();
}

/** Deletes a calling; false if it is still used by stake officers. */
export function deleteStakeCalling(db: Db, id: number): boolean {
	assertRecording();
	const used = db.select({ id: members.id }).from(members).where(eq(members.stakeCallingId, id)).get();
	if (used) return false;
	db.delete(stakeCallings).where(eq(stakeCallings.id, id)).run();
	return true;
}

export function moveStakeCalling(db: Db, id: number, dir: -1 | 1): void {
	assertRecording();
	const list = listStakeCallings(db);
	const i = list.findIndex((c) => c.id === id);
	const j = i + dir;
	if (i < 0 || j < 0 || j >= list.length) return;
	[list[i], list[j]] = [list[j], list[i]];
	db.transaction((tx) => {
		list.forEach((c, pos) => tx.update(stakeCallings).set({ position: pos + 1 }).where(eq(stakeCallings.id, c.id)).run());
	});
}
