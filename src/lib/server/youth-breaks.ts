import { asc, eq, gte } from 'drizzle-orm';
import { addDays, toIso, parseIso } from '$lib/dates';
import type { Db } from './db';
import { YOUTH_BREAK_KINDS, youthBreaks, type YouthBreak } from './db/schema';
import { optStr, str, UserError } from './forms';

export function listBreaks(db: Db, from?: string): YouthBreak[] {
	const q = db.select().from(youthBreaks);
	return (from ? q.where(gte(youthBreaks.toDate, from)) : q).orderBy(asc(youthBreaks.fromDate)).all();
}

/** Holidays cancel the Wednesdays inside them; another event in the same week (Monday to Sunday) cancels that Wednesday unless it is marked not to. */
export function breakFor(breaks: YouthBreak[], wednesday: string): YouthBreak | null {
	const monday = addDays(wednesday, -2);
	const sunday = addDays(wednesday, 4);
	return breaks.find((b) => (b.kind === 'ferien' ? b.fromDate <= wednesday && wednesday <= b.toDate : b.cancels && b.fromDate <= sunday && monday <= b.toDate)) ?? null;
}

export const YOUTH_BREAK_KIND_LABELS: Record<YouthBreak['kind'], string> = { ferien: 'Ferien', pfahl: 'Pfahl-Aktivität', tempel: 'Tempel', supersamstag: 'Supersamstag', tanzabend: 'Tanzabend' };

type BreakInput = Omit<YouthBreak, 'id' | 'cancels'> & { cancels?: boolean };

function check(input: BreakInput) {
	for (const d of [input.fromDate, input.toDate]) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || toIso(parseIso(d)) !== d) throw new UserError('Ungültiges Datum');
	}
	if (input.toDate < input.fromDate) throw new UserError('Das Enddatum liegt vor dem Startdatum.');
	if (input.kind === 'ferien') input.cancels = true;
}

export function createBreak(db: Db, input: BreakInput): YouthBreak {
	check(input);
	return db.insert(youthBreaks).values(input).returning().get();
}

export function updateBreak(db: Db, id: number, input: BreakInput): void {
	check(input);
	db.update(youthBreaks).set(input).where(eq(youthBreaks.id, id)).run();
}

export function getBreak(db: Db, id: number): YouthBreak | undefined {
	return db.select().from(youthBreaks).where(eq(youthBreaks.id, id)).get();
}

/** The table has no timestamps; the row content itself guards against overwrites. */
export const breakVersion = (b: YouthBreak) => JSON.stringify([b.fromDate, b.toDate, b.label, b.kind, b.cancels]);

export function deleteBreak(db: Db, id: number) {
	db.delete(youthBreaks).where(eq(youthBreaks.id, id)).run();
}

/** Null when date or kind is missing. */
export function breakInput(fd: FormData): BreakInput | null {
	const fromDate = str(fd, 'fromDate');
	const kind = YOUTH_BREAK_KINDS.find((k) => k === str(fd, 'kind'));
	return fromDate && kind ? { fromDate, toDate: str(fd, 'toDate') || fromDate, label: optStr(fd, 'label'), kind, cancels: fd.get('cancels') === '1' } : null;
}
