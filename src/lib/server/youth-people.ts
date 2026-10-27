import { and, eq, inArray } from 'drizzle-orm';
import { getBishopricIds } from './bishopric';
import type { Db } from './db';
import { members, youth, youthLeaders, YOUTH_GROUPS, type Member, type YouthLeaderRole, type YouthSide } from './db/schema';
import { byName, memberQuery } from './members';
import { UserError } from './forms';

export const YOUTH_GROUP_LABELS: Record<string, string> = {
	diakone: 'Diakone',
	lehrer: 'Lehrer',
	priester: 'Priester',
	hoffnung: 'JD der Hoffnung',
	glauben: 'JD des Glaubens',
	licht: 'JD des Lichts',
	leitung: 'Leitung'
};

export const YOUTH_LEADER_ROLE_LABELS: Record<YouthLeaderRole, string> = {
	jm_berater: 'JM-Berater',
	jd_beraterin: 'JD-Beraterin',
	jd_praesidentin: 'JD-Präsidentin',
	jd_ratgeberin1: '1. Ratgeberin JD',
	jd_ratgeberin2: '2. Ratgeberin JD'
};

export interface YouthEntry { id: number; member: Member; side: YouthSide; group: string | null }

function loadMembers(db: Db, ids: number[]): Map<number, Member> {
	if (!ids.length) return new Map();
	return new Map(memberQuery(db, and(inArray(members.id, ids), eq(members.active, true))).all().map((m) => [m.id, m]));
}

export function listYouth(db: Db, side?: YouthSide): YouthEntry[] {
	const rows = (side ? db.select().from(youth).where(eq(youth.side, side)) : db.select().from(youth)).all();
	const byId = loadMembers(db, rows.map((r) => r.memberId));
	return rows
		.flatMap((r) => (byId.has(r.memberId) ? [{ id: r.id, member: byId.get(r.memberId)!, side: r.side, group: r.group }] : []))
		.sort((a, b) => byName(a.member, b.member));
}

export function setYouth(db: Db, memberId: number, side: YouthSide, group: string | null): void {
	const m = memberQuery(db, eq(members.id, memberId)).get();
	if (!m || m.kind === 'pfahl') throw new UserError('Mitglied ist kein Gemeindemitglied');
	if (group !== null && !YOUTH_GROUPS[side].includes(group)) throw new UserError('Ungültige Gruppe');
	db.insert(youth).values({ memberId, side, group }).onConflictDoUpdate({ target: youth.memberId, set: { side, group } }).run();
}

export function removeYouth(db: Db, memberId: number): void {
	db.delete(youth).where(eq(youth.memberId, memberId)).run();
}

export function listLeaders(db: Db): { id: number; member: Member; role: YouthLeaderRole }[] {
	const rows = db.select().from(youthLeaders).all();
	const byId = loadMembers(db, rows.map((r) => r.memberId));
	return rows
		.flatMap((r) => (byId.has(r.memberId) ? [{ id: r.id, member: byId.get(r.memberId)!, role: r.role }] : []))
		.sort((a, b) => byName(a.member, b.member));
}

export function setLeaders(db: Db, role: YouthLeaderRole, memberIds: number[]): void {
	db.transaction((tx) => {
		tx.delete(youthLeaders).where(eq(youthLeaders.role, role)).run();
		for (const memberId of new Set(memberIds)) tx.insert(youthLeaders).values({ memberId, role }).run();
	});
}

/** Bishopric and youth leaders, deduplicated: everyone who can attend a youth event as an adult. */
export function listAdults(db: Db): Member[] {
	const ids = [...new Set([...getBishopricIds(db), ...listLeaders(db).map((l) => l.member.id)])];
	return [...loadMembers(db, ids).values()].sort(byName);
}
