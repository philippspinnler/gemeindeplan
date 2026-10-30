import { and, desc, eq, inArray, lt, type SQL } from 'drizzle-orm';
import type { Db } from './db';
import { changes, users, type Role } from './db/schema';
import { SECTIONS, type ChangeRef, type SectionDef, type SectionId } from './change-sections';
import { UserError } from './forms';
import { can } from './permissions';
import { insideRecording } from './recording';

const MERGE_MS = 5 * 60_000;
const KEEP_MS = 90 * 86_400_000;

export interface ChangeView {
	id: number;
	at: string;
	userName: string | null;
	section: SectionId;
	area: string;
	label: string;
	target: { label: string; href: string | null };
	lines: string[];
	resettable: boolean;
}

const json = (x: unknown) => (x === null || x === undefined ? null : JSON.stringify(x));
const parse = (s: string | null): unknown => (s === null ? null : JSON.parse(s));
const refId = (r: ChangeRef) => `${r.section}\u0000${r.key}`;
const resettable = (def: SectionDef, before: string | null) => !!def.write && (before !== null || !!def.deletesCreated);
const latestFor = (db: Db, r: ChangeRef) =>
	db.select().from(changes).where(and(eq(changes.section, r.section), eq(changes.key, r.key))).orderBy(desc(changes.id)).limit(1).get();

function store(db: Db, userId: number | null, r: ChangeRef, before: string | null, after: string | null, now: Date) {
	if (before === after) return;
	const last = latestFor(db, r);
	if (last && userId !== null && last.userId === userId && now.getTime() - Date.parse(last.at) < MERGE_MS) {
		if (last.before === after) db.delete(changes).where(eq(changes.id, last.id)).run();
		else db.update(changes).set({ after, at: now.toISOString() }).where(eq(changes.id, last.id)).run();
		return;
	}
	db.insert(changes).values({ at: now.toISOString(), userId, section: r.section, key: r.key, before, after }).run();
}

/**
 * Runs a write and logs every declared section whose snapshot changed, all in one transaction.
 * `created` registers an object made inside `fn` (it did not exist before).
 */
export function recordChanges<T>(db: Db, userId: number | null, refs: ChangeRef[], fn: (created: (ref: ChangeRef) => void) => T, now = new Date()): T {
	return db.transaction(() => {
		const all = new Map<string, { ref: ChangeRef; before: string | null }>();
		for (const ref of refs) if (!all.has(refId(ref))) all.set(refId(ref), { ref, before: json(SECTIONS[ref.section].read(db, ref.key)) });
		const result = insideRecording(() => fn((ref) => all.set(refId(ref), { ref, before: null })));
		for (const { ref, before } of all.values()) store(db, userId, ref, before, json(SECTIONS[ref.section].read(db, ref.key)), now);
		db.delete(changes).where(lt(changes.at, new Date(now.getTime() - KEEP_MS).toISOString())).run();
		return result;
	});
}

export function recordImport(db: Db, summary: string, now = new Date()): void {
	db.insert(changes).values({ at: now.toISOString(), userId: null, section: 'import', key: '', before: null, after: JSON.stringify({ summary }) }).run();
}

export function listChanges(db: Db, role: Role, filter: { key?: string; sections?: SectionId[]; area?: string; userId?: number } = {}, limit = 200): ChangeView[] {
	const visible = (Object.keys(SECTIONS) as SectionId[]).filter(
		(id) => can(role, SECTIONS[id].permission) && (!filter.sections || filter.sections.includes(id)) && (!filter.area || SECTIONS[id].area === filter.area)
	);
	if (!visible.length) return [];
	const where: SQL[] = [inArray(changes.section, visible)];
	if (filter.key !== undefined) where.push(eq(changes.key, filter.key));
	if (filter.userId !== undefined) where.push(eq(changes.userId, filter.userId));
	return db
		.select({ c: changes, userName: users.name })
		.from(changes)
		.leftJoin(users, eq(users.id, changes.userId))
		.where(and(...where))
		.orderBy(desc(changes.id))
		.limit(limit)
		.all()
		.map(({ c, userName }) => {
			const def = SECTIONS[c.section as SectionId];
			return {
				id: c.id,
				at: c.at,
				userName,
				section: c.section as SectionId,
				area: def.area,
				label: def.label,
				target: def.target(db, c.key),
				lines: def.describe(db, parse(c.before), parse(c.after)),
				resettable: resettable(def, c.before)
			};
		});
}

/** Puts the section back to its state before the entry; asks first (conflict) when it changed since, unless forced. */
export function resetChange(db: Db, user: { id: number; role: Role }, id: number, force: boolean, now = new Date()): { ok: true } | { conflict: { name: string | null; at: string } } {
	const entry = db.select().from(changes).where(eq(changes.id, id)).get();
	const def = entry && SECTIONS[entry.section as SectionId];
	if (!entry || !def) throw new UserError('Änderung nicht gefunden.');
	if (!can(user.role, def.permission)) throw new UserError('Dafür fehlt dir die Berechtigung.');
	if (!resettable(def, entry.before)) throw new UserError('Diese Änderung lässt sich nicht zurücksetzen.');
	const ref: ChangeRef = { section: entry.section as SectionId, key: entry.key };
	if (!force && json(def.read(db, ref.key)) !== entry.after) {
		const last = latestFor(db, ref)!;
		const by = last.userId === null ? undefined : db.select({ name: users.name }).from(users).where(eq(users.id, last.userId)).get();
		return { conflict: { name: by?.name ?? null, at: last.at } };
	}
	recordChanges(db, user.id, [ref], () => def.write!(db, ref.key, parse(entry.before)), now);
	return { ok: true };
}
