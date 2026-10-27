import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './db';
import { ensureStakeCalling } from './stake-callings';
import { createMember, displayName, listMembers, matchByFirstName, matchMember, updateMember } from './members';

let db: Db;
beforeEach(() => {
	db = createDb(':memory:');
	createMember(db, { firstName: 'Anna', lastName: 'Rey' });
	createMember(db, { firstName: 'Daniel', lastName: 'Dürst', affiliation: 'Hoherat' });
	createMember(db, { firstName: 'Edith', lastName: 'Achermann', active: false });
	createMember(db, { firstName: 'Thomas', lastName: 'Koller' });
	createMember(db, { firstName: 'Thomas', lastName: 'Moser' });
});

describe('members', () => {
	it('stores "no talk" and "no prayer"', () => {
		const m = createMember(db, { firstName: 'Ruth', lastName: 'Keller', noTalk: true });
		expect(m.noTalk).toBe(true);
		expect(m.noPrayer).toBe(false);
		updateMember(db, m.id, { noTalk: false, noPrayer: true });
		expect(listMembers(db).find((x) => x.id === m.id)).toMatchObject({ noTalk: false, noPrayer: true });
		expect(listMembers(db).find((x) => x.lastName === 'Rey')).toMatchObject({ noTalk: false, noPrayer: false });
	});
	it('lists sorted and filters active', () => {
		expect(listMembers(db).map((m) => m.lastName)).toEqual(['Achermann', 'Dürst', 'Koller', 'Moser', 'Rey']);
		expect(listMembers(db, { activeOnly: true }).map((m) => m.lastName)).toEqual(['Dürst', 'Koller', 'Moser', 'Rey']);
	});
	it('shows affiliation in the display name', () => {
		const d = matchMember(listMembers(db), 'HR-Daniel Dürst');
		expect(d && displayName(d)).toBe('Daniel Dürst (Hoherat)');
		expect(displayName({ firstName: 'Anna', lastName: 'Rey', affiliation: null })).toBe('Anna Rey');
		expect(displayName({ firstName: 'Simon', lastName: 'Dürst', affiliation: null, calling: '1. Ratgeber Pfahlpräsidentschaft' })).toBe('Simon Dürst (1. Ratgeber Pfahlpräsidentschaft)');
		const hr = ensureStakeCalling(db, 'Hoherat');
		const stake = createMember(db, { firstName: 'Stefan', lastName: 'Landolt', kind: 'pfahl', stakeCallingId: hr.id });
		expect(stake.calling).toBe('Hoherat');
		expect(displayName(stake)).toBe('Stefan Landolt (Hoherat)');
		expect(listMembers(db, { kind: 'pfahl' }).map((m) => m.id)).toEqual([stake.id]);
		expect(listMembers(db, { kind: 'gemeinde' })).toHaveLength(5);
	});
	it('finds by name in both spellings, ignores prefix', () => {
		expect(matchMember(listMembers(db), 'anna rey')?.firstName).toBe('Anna');
		expect(matchMember(listMembers(db), 'Rey, Anna')?.firstName).toBe('Anna');
		expect(matchMember(listMembers(db), 'Durst Daniel')).toBeNull();
		expect(matchMember(listMembers(db), 'Unbekannt Person')).toBeNull();
	});
	it('matchByFirstName is set only for a unique active match', () => {
		const all = listMembers(db);
		expect(matchByFirstName(all, 'Anna')?.lastName).toBe('Rey');
		expect(matchByFirstName(all, 'Thomas')).toBeNull();
		expect(matchByFirstName(all, 'Edith')).toBeNull();
		expect(matchMember(all, 'Koller Thomas')).toBeNull();
		expect(matchMember(all, 'Thomas Koller')?.lastName).toBe('Koller');
	});
	it('updates fields', () => {
		const a = matchMember(listMembers(db), 'Anna Rey')!;
		updateMember(db, a.id, { active: false, noteTalk: 'gerne kurz' });
		const again = listMembers(db).find((m) => m.id === a.id)!;
		expect(again.active).toBe(false);
		expect(again.noteTalk).toBe('gerne kurz');
	});
});

describe('listMembers order', () => {
	it('sorts German style, with umlauts and lowercase prefixes among their letters', () => {
		const db = createDb(':memory:');
		for (const [firstName, lastName] of [['Urs', 'Zbinden'], ['Lea', 'von Gunten'], ['Mia', 'Äbi'], ['Reto', 'Moser'], ['Anna', 'Moser']]) createMember(db, { firstName, lastName });
		expect(listMembers(db).map(displayName)).toEqual(['Mia Äbi', 'Anna Moser', 'Reto Moser', 'Lea von Gunten', 'Urs Zbinden']);
	});
});
