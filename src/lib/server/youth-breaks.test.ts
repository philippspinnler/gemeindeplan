import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './db';
import { youthBreaks } from './db/schema';
import { breakFor, breaksFor, breakVersion, createBreak, deleteBreak, getBreak, listBreaks, updateBreak } from './youth-breaks';

let db: Db;
beforeEach(() => {
	db = createDb(':memory:');
	db.insert(youthBreaks).values([
		{ fromDate: '2026-12-21', toDate: '2027-01-03', label: 'Weihnachtsferien', kind: 'ferien' },
		{ fromDate: '2026-10-05', toDate: '2026-10-16', label: 'Herbstferien', kind: 'ferien' }
	]).run();
});

describe('youth breaks', () => {
	it('listBreaks filters by end date', () => {
		expect(listBreaks(db).map((b) => b.label)).toEqual(['Herbstferien', 'Weihnachtsferien']);
		expect(listBreaks(db, '2026-10-17').map((b) => b.label)).toEqual(['Weihnachtsferien']);
		expect(listBreaks(db, '2026-10-16').map((b) => b.label)).toEqual(['Herbstferien', 'Weihnachtsferien']);
	});
	it('breakFor picks the containing range', () => {
		const all = listBreaks(db);
		expect(breakFor(all, '2026-10-14')?.label).toBe('Herbstferien');
		expect(breakFor(all, '2027-01-03')?.label).toBe('Weihnachtsferien');
		expect(breakFor(all, '2026-10-17')).toBeNull();
	});
	it('an event anywhere in the week (Monday to Sunday) cancels its Wednesday, holidays only the Wednesdays inside them', () => {
		const sat = createBreak(db, { fromDate: '2026-11-14', toDate: '2026-11-14', label: null, kind: 'tanzabend' });
		const mon = createBreak(db, { fromDate: '2026-11-23', toDate: '2026-11-23', label: null, kind: 'tempel' });
		const all = listBreaks(db);
		expect(breakFor(all, '2026-11-11')?.id).toBe(sat.id);
		expect(breakFor(all, '2026-11-25')?.id).toBe(mon.id);
		expect(breakFor(all, '2026-11-04')).toBeNull();
		expect(breakFor(all, '2026-11-18')).toBeNull();
		// Holidays starting on the Saturday leave that week's Wednesday untouched.
		expect(breakFor(all, '2026-12-16')).toBeNull();
	});
	it('createBreak rejects reversed range', () => {
		expect(() => createBreak(db, { fromDate: '2026-03-02', toDate: '2026-03-01', label: 'x', kind: 'pfahl' })).toThrow();
	});
	it('createBreak rejects malformed dates', () => {
		for (const [fromDate, toDate] of [['abc', '2026-03-01'], ['2026-03-01', '2026-02-30'], ['2026-3-1', '2026-03-02']])
			expect(() => createBreak(db, { fromDate, toDate, label: null, kind: 'pfahl' })).toThrow('Ungültiges Datum');
	});
	it('createBreak and deleteBreak round-trip', () => {
		const b = createBreak(db, { fromDate: '2026-11-04', toDate: '2026-11-04', label: 'Pfahlkonferenz', kind: 'pfahl' });
		expect(listBreaks(db, '2026-11-01').map((x) => x.id)).toContain(b.id);
		deleteBreak(db, b.id);
		expect(listBreaks(db, '2026-11-01').map((x) => x.id)).not.toContain(b.id);
	});
	it('updates an entry, validates it and changes its version', () => {
		const b = createBreak(db, { fromDate: '2026-11-14', toDate: '2026-11-14', label: null, kind: 'pfahl' });
		updateBreak(db, b.id, { fromDate: '2026-11-21', toDate: '2026-11-21', label: 'Tanzabend Pfahl', kind: 'tanzabend' });
		const after = getBreak(db, b.id)!;
		expect(after).toMatchObject({ fromDate: '2026-11-21', label: 'Tanzabend Pfahl', kind: 'tanzabend' });
		expect(breakVersion(after)).not.toBe(breakVersion(b));
		expect(() => updateBreak(db, b.id, { fromDate: '2026-11-21', toDate: '2026-11-20', label: null, kind: 'pfahl' })).toThrow();
	});
	it('a stake date only cancels the Wednesday when it is marked to', () => {
		const temple = createBreak(db, { fromDate: '2027-01-09', toDate: '2027-01-09', label: 'Tempel', kind: 'tempel', cancels: false });
		expect(breakFor(listBreaks(db), '2027-01-06')).toBeNull();
		expect(breaksFor(listBreaks(db), '2027-01-06').map((b) => b.id)).toEqual([temple.id]);
		updateBreak(db, temple.id, { ...temple, cancels: true });
		expect(breakFor(listBreaks(db), '2027-01-06')?.id).toBe(temple.id);
		const holiday = createBreak(db, { fromDate: '2027-02-01', toDate: '2027-02-12', label: null, kind: 'ferien', cancels: false });
		expect(holiday.cancels).toBe(true);
	});
});
