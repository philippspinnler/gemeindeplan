import { beforeEach, describe, expect, it } from 'vitest';
import { setBishopricMember } from './bishopric';
import { createDb, type Db } from './db';
import { createMember } from './members';
import { listAdults, listAdultsFor, listLeaders, listYouth, removeYouth, setLeaders, setYouth } from './youth-people';

let db: Db;
beforeEach(() => {
	db = createDb(':memory:');
});

describe('youth people', () => {
	it('setYouth upserts and listYouth filters by side and sorts by name', () => {
		const rey = createMember(db, { firstName: 'Reto', lastName: 'Rey' });
		const durst = createMember(db, { firstName: 'Lea', lastName: 'Dürst' });
		const koller = createMember(db, { firstName: 'Urs', lastName: 'Koller' });
		const gone = createMember(db, { firstName: 'Mia', lastName: 'Gasser', active: false });
		setYouth(db, rey.id, 'jm', 'diakone');
		setYouth(db, koller.id, 'jm', 'lehrer');
		setYouth(db, durst.id, 'jd', 'licht');
		setYouth(db, gone.id, 'jd', null);
		setYouth(db, rey.id, 'jm', 'priester');
		expect(listYouth(db, 'jm').map((y) => [y.member.lastName, y.group])).toEqual([['Koller', 'lehrer'], ['Rey', 'priester']]);
		expect(listYouth(db).map((y) => y.member.lastName)).toEqual(['Dürst', 'Koller', 'Rey']);
	});

	it('setYouth rejects stake officers', () => {
		const officer = createMember(db, { firstName: 'Urs', lastName: 'Baumann', kind: 'pfahl' });
		expect(() => setYouth(db, officer.id, 'jm', null)).toThrow('Mitglied ist kein Gemeindemitglied');
		const rey = createMember(db, { firstName: 'Reto', lastName: 'Rey' });
		expect(() => setYouth(db, rey.id, 'jm', 'licht')).toThrow('Ungültige Gruppe');
		expect(() => setYouth(db, rey.id, 'jm', 'leitung')).toThrow('Ungültige Gruppe');
	});

	it('removeYouth drops the entry, member stays', () => {
		const rey = createMember(db, { firstName: 'Reto', lastName: 'Rey' });
		setYouth(db, rey.id, 'jm', 'diakone');
		removeYouth(db, rey.id);
		expect(listYouth(db)).toEqual([]);
	});

	it('setLeaders replaces the role\'s members; listAdults merges bishopric and leaders without duplicates', () => {
		const bishop = createMember(db, { firstName: 'Urs', lastName: 'Widmer' });
		const vreni = createMember(db, { firstName: 'Vreni', lastName: 'Baumann' });
		const lea = createMember(db, { firstName: 'Lea', lastName: 'Gasser' });
		setBishopricMember(db, 'bischof', bishop.id);
		setLeaders(db, 'jm_berater', [bishop.id, vreni.id]);
		setLeaders(db, 'jd_beraterin', [lea.id]);
		setLeaders(db, 'jm_berater', [bishop.id]);
		expect(listLeaders(db).map((l) => [l.member.id, l.role])).toEqual([[lea.id, 'jd_beraterin'], [bishop.id, 'jm_berater']]);
		expect(listAdults(db).map((m) => m.lastName)).toEqual(['Gasser', 'Widmer']);
	});
	it('listAdultsFor keeps JD and JM adults apart, the bishopric goes with JM', () => {
		const [bishop, jmAdviser, jdAdviser, jdPresident] = ['Beat', 'Marco', 'Nina', 'Lea'].map((firstName) => createMember(db, { firstName, lastName: 'Test' }));
		setBishopricMember(db, 'bischof', bishop.id);
		setLeaders(db, 'jm_berater', [jmAdviser.id]);
		setLeaders(db, 'jd_beraterin', [jdAdviser.id]);
		setLeaders(db, 'jd_praesidentin', [jdPresident.id]);
		expect(listAdultsFor(db, 'jm').map((m) => m.id).sort()).toEqual([bishop.id, jmAdviser.id].sort());
		expect(listAdultsFor(db, 'jd').map((m) => m.id).sort()).toEqual([jdAdviser.id, jdPresident.id].sort());
	});
});
