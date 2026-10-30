import { asc, eq } from 'drizzle-orm';
import type { Db } from './db';
import { hymns, type Hymn } from './db/schema';
import { UserError } from './forms';
import { assertRecording } from './recording';

export function bookForNumber(n: number): 'gesangbuch' | 'neu' {
	return n >= 1000 ? 'neu' : 'gesangbuch';
}

export function listHymns(db: Db): Hymn[] {
	return db.select().from(hymns).orderBy(asc(hymns.number)).all();
}

export function getHymnByNumber(db: Db, number: number): Hymn | undefined {
	return db.select().from(hymns).where(eq(hymns.number, number)).get();
}

export function createHymn(db: Db, input: { number: number; title: string; durationSeconds?: number | null }): Hymn {
	assertRecording();
	if (getHymnByNumber(db, input.number)) throw new UserError('Nummer existiert bereits');
	return db
		.insert(hymns)
		.values({ number: input.number, title: input.title.trim(), book: bookForNumber(input.number), durationSeconds: input.durationSeconds ?? null })
		.returning()
		.get();
}

export function updateHymn(db: Db, id: number, patch: { title: string; durationSeconds: number | null }): void {
	assertRecording();
	db.update(hymns)
		.set({ title: patch.title.trim(), durationSeconds: patch.durationSeconds, updatedAt: new Date().toISOString() })
		.where(eq(hymns.id, id))
		.run();
}

export function hymnLabel(h: Pick<Hymn, 'number' | 'title'>): string {
	return `${h.number} – ${h.title}`;
}
