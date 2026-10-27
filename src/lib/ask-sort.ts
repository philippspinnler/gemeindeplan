import { collator, compareDate, sortRows, type ColumnSpec, type SortState } from './table-sort';

export type AskSortKey = 'name' | 'last' | 'note';
export type AskSortState = SortState<AskSortKey>;

export interface AskRow {
	id: number;
	name: string;
	firstName: string;
	sortName: string;
	lastDate: string | null;
	nextDate: string | null;
	/** "nie", "vor 3 Wochen", or "in 4 Wochen" for scheduled members. */
	label: string;
	planned: boolean;
	note: string;
}

/** Unscheduled first ("nie", then longest pause), then scheduled, soonest first. */
function compareDue(a: AskRow, b: AskRow): number {
	if (a.planned !== b.planned) return Number(a.planned) - Number(b.planned);
	return a.planned ? compareDate(a.nextDate, b.nextDate) : compareDate(a.lastDate, b.lastDate);
}

const COLUMNS: Record<AskSortKey, ColumnSpec<AskRow>> = {
	name: { compare: (a, b) => collator.compare(a.sortName, b.sortName) },
	last: { compare: compareDue },
	note: { compare: (a, b) => collator.compare(a.note, b.note), last: (r) => !r.note }
};

/** Default: longest since last turn first ("nie" on top); scheduled at the end. */
export const DEFAULT_ASK_SORT: AskSortState = { key: 'last', dir: 'asc' };

export function sortAskRows(rows: AskRow[], sort: AskSortState): AskRow[] {
	return sortRows(rows, sort, COLUMNS, (a, b) => collator.compare(a.sortName, b.sortName));
}
