import { and, eq, getTableColumns, type SQL } from 'drizzle-orm';
import { normalizeName, stripPrefix } from '../names';
import { collator } from '../table-sort';
import type { Db } from './db';
import { members, stakeCallings, type Member, type MemberKind } from './db/schema';

/** Maps an imported affiliation (e.g. from prefixes like HR-) to kind and calling name. */
export function stakeFromAffiliation(affiliation: string | null): { kind: MemberKind; callingName: string | null } {
	const stake = ['Hoherat', 'Pfahlpräsidentschaft', 'Tempelpräsidentschaft', 'Missionspräsidentschaft'];
	if (affiliation && stake.includes(affiliation)) return { kind: 'pfahl', callingName: affiliation };
	return { kind: 'gemeinde', callingName: null };
}

export function memberQuery(db: Db, where?: SQL) {
	const q = db
		.select({ ...getTableColumns(members), calling: stakeCallings.name })
		.from(members)
		.leftJoin(stakeCallings, eq(stakeCallings.id, members.stakeCallingId));
	return where ? q.where(where) : q;
}

export interface MemberInput {
	firstName: string;
	lastName: string;
	affiliation?: string | null;
	kind?: MemberKind;
	stakeCallingId?: number | null;
	active?: boolean;
	noteTalk?: string | null;
	notePrayer?: string | null;
	noTalk?: boolean;
	noPrayer?: boolean;
}

export function listMembers(db: Db, opts: { activeOnly?: boolean; kind?: MemberKind } = {}): Member[] {
	const conds = [];
	if (opts.activeOnly) conds.push(eq(members.active, true));
	if (opts.kind) conds.push(eq(members.kind, opts.kind));
	return memberQuery(db, conds.length ? and(...conds) : undefined).all().sort(byName);
}

/** German alphabetical order; SQLite's own ordering puts umlauts and "von …" after Z. */
export const byName = (a: Pick<Member, 'firstName' | 'lastName'>, b: Pick<Member, 'firstName' | 'lastName'>) =>
	collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName);

export function getMember(db: Db, id: number): Member | undefined {
	return memberQuery(db, eq(members.id, id)).get();
}

export function createMember(db: Db, input: MemberInput): Member {
	const row = db
		.insert(members)
		.values({
			firstName: input.firstName.trim(),
			lastName: input.lastName.trim(),
			affiliation: input.affiliation?.trim() || null,
			kind: input.kind ?? 'gemeinde',
			stakeCallingId: input.stakeCallingId ?? null,
			active: input.active ?? true,
			noteTalk: input.noteTalk?.trim() || null,
			notePrayer: input.notePrayer?.trim() || null,
			noTalk: input.noTalk ?? false,
			noPrayer: input.noPrayer ?? false
		})
		.returning()
		.get();
	return getMember(db, row.id)!;
}

export function updateMember(db: Db, id: number, patch: Partial<MemberInput>): void {
	db.update(members)
		.set({ ...patch, updatedAt: new Date().toISOString() })
		.where(eq(members.id, id))
		.run();
}

/** Stake officers from outside the ward, and ward members who also hold a stake calling. */
export const isStakeOfficer = (m: Pick<Member, 'kind' | 'stakeCallingId'>) => m.kind === 'pfahl' || m.stakeCallingId !== null;

/** Members holding the calling plus the one already assigned; everyone while nobody holds it yet. */
export function withCalling(ward: Member[], calledIds: number[], currentId: number | null): Member[] {
	return calledIds.length ? ward.filter((m) => calledIds.includes(m.id) || m.id === currentId) : ward;
}

type Named = Pick<Member, 'firstName' | 'lastName' | 'affiliation'> & { calling?: string | null };

/** "Nachname, Vorname", the order lists are sorted by. */
export const fullName = (m: Pick<Member, 'firstName' | 'lastName'>) => (m.lastName ? `${m.lastName}, ${m.firstName}` : m.firstName);

const withSuffix = (name: string, m: Named) => {
	const suffix = m.calling || m.affiliation;
	return suffix ? `${name} (${suffix})` : name;
};

/** "Nachname, Vorname (Berufung)" for lists and pickers. */
export const displayName = (m: Named) => withSuffix(fullName(m), m);

/** "Vorname Nachname (Berufung)" for text that is read aloud: the Leitungszettel and callings. */
export const spokenName = (m: Named) => withSuffix(`${m.firstName} ${m.lastName}`.trim(), m);

export function matchMember(all: Member[], raw: string): Member | null {
	const { name } = stripPrefix(raw);
	const idx = name.indexOf(',');
	const wanted = normalizeName(idx >= 0 ? `${name.slice(idx + 1)} ${name.slice(0, idx)}` : name);
	if (!wanted) return null;
	const hits = all.filter((m) => normalizeName(`${m.firstName} ${m.lastName}`) === wanted);
	return hits.length === 1 ? hits[0] : null;
}

export function matchByFirstName(all: Member[], first: string): Member | null {
	const wanted = normalizeName(first);
	if (!wanted) return null;
	const hits = all.filter((m) => m.active && normalizeName(m.firstName) === wanted);
	return hits.length === 1 ? hits[0] : null;
}
