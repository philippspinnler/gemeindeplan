import { describe, expect, it } from 'vitest';
import { chairFor, formatAbsences, getBishopric, getBishopricIds, parseAbsences, setBishopric, setBishopricMember } from './bishopric';
import { createDb } from './db';

describe('bishopric', () => {
	it('assigns roles uniquely', () => {
		const db = createDb(':memory:');
		expect(getBishopricIds(db)).toEqual([]);
		setBishopricMember(db, 'bischof', 3);
		setBishopricMember(db, 'ratgeber1', 1);
		expect(getBishopric(db)).toEqual([{ id: 3, role: 'bischof' }, { id: 1, role: 'ratgeber1' }]);
		// Person changes role: old role becomes free
		setBishopricMember(db, 'ratgeber2', 3);
		expect(getBishopric(db)).toEqual([{ id: 1, role: 'ratgeber1' }, { id: 3, role: 'ratgeber2' }]);
		setBishopricMember(db, 'ratgeber1', null);
		expect(getBishopricIds(db)).toEqual([3]);
		setBishopric(db, [{ id: 5, role: 'bischof' }, { id: 6, role: 'bischof' }, { id: 5, role: 'ratgeber1' }]);
		expect(getBishopric(db)).toEqual([{ id: 5, role: 'bischof' }]);
	});
	it('determines who presides', () => {
		const bishopric = [{ id: 1, role: 'bischof' as const }, { id: 2, role: 'ratgeber1' as const }, { id: 3, role: 'ratgeber2' as const }];
		expect(chairFor({ bishopric, absentIds: [], guest: null })).toBe(1);
		expect(chairFor({ bishopric, absentIds: [1], guest: null })).toBe(2);
		expect(chairFor({ bishopric, absentIds: [1, 2], guest: null })).toBe(3);
		expect(chairFor({ bishopric, absentIds: [1, 2, 3], guest: null })).toBeNull();
		expect(chairFor({ bishopric, absentIds: [], guest: { id: 50, presides: true } })).toBe(50);
		expect(chairFor({ bishopric, absentIds: [], guest: { id: 51, presides: false } })).toBe(1);
		expect(chairFor({ bishopric: [], absentIds: [], guest: null })).toBeNull();
	});
	it('encodes absences and ignores free text from the old sheets', () => {
		expect(formatAbsences([])).toBeNull();
		expect(formatAbsences([2, 5, 2])).toBe('ids:2,5');
		expect(parseAbsences('ids:2,5')).toEqual([2, 5]);
		expect(parseAbsences('ids:')).toEqual([]);
		expect(parseAbsences('Urs, Reto')).toEqual([]);
		expect(parseAbsences(null)).toEqual([]);
	});
});
