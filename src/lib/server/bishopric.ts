import type { Db } from './db';
import { getSetting, setSetting } from './settings';
import { assertRecording } from './recording';

const ABSENCE_PREFIX = 'ids:';

export const BISHOPRIC_ROLES = ['bischof', 'ratgeber1', 'ratgeber2'] as const;
export type BishopricRole = (typeof BISHOPRIC_ROLES)[number];
export const BISHOPRIC_ROLE_LABELS: Record<BishopricRole, string> = {
	bischof: 'Bischof',
	ratgeber1: '1. Ratgeber',
	ratgeber2: '2. Ratgeber'
};
export interface BishopricEntry { id: number; role: BishopricRole }

const isRole = (r: unknown): r is BishopricRole => typeof r === 'string' && (BISHOPRIC_ROLES as readonly string[]).includes(r);

/** At most one person per role and one role per person. */
export function getBishopric(db: Db): BishopricEntry[] {
	try {
		const v: unknown = JSON.parse(getSetting(db, 'bishopric'));
		if (Array.isArray(v)) return normalize(v.filter((e) => e && Number.isInteger(e.id) && e.id > 0 && isRole(e.role)));
	} catch {
	}
	return [];
}

function normalize(entries: BishopricEntry[]): BishopricEntry[] {
	const out: BishopricEntry[] = [];
	for (const role of BISHOPRIC_ROLES) {
		const e = entries.find((x) => x.role === role && !out.some((o) => o.id === x.id));
		if (e) out.push({ id: e.id, role });
	}
	return out;
}

export function setBishopric(db: Db, entries: BishopricEntry[]): void {
	assertRecording();
	setSetting(db, 'bishopric', JSON.stringify(normalize(entries)));
}

export function getBishopricIds(db: Db): number[] {
	return getBishopric(db).map((e) => e.id);
}

/** Assigns a role (null = vacant). The person loses any other role they held. */
export function setBishopricMember(db: Db, role: BishopricRole, id: number | null): void {
	assertRecording();
	const rest = getBishopric(db).filter((e) => e.role !== role && e.id !== id);
	setBishopric(db, id ? [...rest, { id, role }] : rest);
}

/**
 * Who presides? A present guest with presiding rights (e.g. stake presidency) before the bishop,
 * then 1st and 2nd counselor, each unless absent. Null if nobody can be determined.
 */
export function chairFor(input: { bishopric: BishopricEntry[]; absentIds: number[]; guest: { id: number; presides: boolean } | null }): number | null {
	if (input.guest?.presides) return input.guest.id;
	for (const role of ['bischof', 'ratgeber1', 'ratgeber2'] as const) {
		const e = input.bishopric.find((b) => b.role === role);
		if (e && !input.absentIds.includes(e.id)) return e.id;
	}
	return null;
}

/** Free text from the old sheets (without prefix) is ignored. */
export function parseAbsences(text: string | null): number[] {
	if (!text?.startsWith(ABSENCE_PREFIX)) return [];
	return text
		.slice(ABSENCE_PREFIX.length)
		.split(',')
		.map(Number)
		.filter((n) => Number.isInteger(n) && n > 0);
}

export function formatAbsences(ids: number[]): string | null {
	const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
	return clean.length ? ABSENCE_PREFIX + clean.join(',') : null;
}
