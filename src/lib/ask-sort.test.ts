import { describe, expect, it } from 'vitest';
import { DEFAULT_ASK_SORT, sortAskRows, type AskRow } from './ask-sort';

const row = (id: number, sortName: string, lastDate: string | null, nextDate: string | null = null, note = ''): AskRow => ({
	id, name: sortName, firstName: '', sortName, lastDate, nextDate, label: '', planned: nextDate !== null, note
});
const rows = [
	row(1, 'Muster Anna', '2026-08-01', '2026-10-04'),
	row(2, 'Baumann Simon', null),
	row(3, 'Zimmer Kurt', '2026-06-15', null, 'kurz'),
	row(4, 'Arnold Dora', null, '2026-09-20')
];
const ids = (r: AskRow[]) => r.map((x) => x.id);

describe('sortAskRows', () => {
	it('by default "never" first, then longest pause, scheduled last (soonest first)', () => {
		expect(ids(sortAskRows(rows, DEFAULT_ASK_SORT))).toEqual([2, 3, 4, 1]);
	});
	it('descending reverses the whole order', () => {
		expect(ids(sortAskRows(rows, { key: 'last', dir: 'desc' }))).toEqual([1, 4, 3, 2]);
	});
	it('note: empty last, name alphabetical', () => {
		expect(ids(sortAskRows(rows, { key: 'note', dir: 'asc' }))).toEqual([3, 4, 2, 1]);
		expect(ids(sortAskRows(rows, { key: 'name', dir: 'asc' }))).toEqual([4, 2, 1, 3]);
	});
});
