import { and, desc, eq, isNotNull, isNull, or } from 'drizzle-orm';
import type { Db } from './db';
import { users, youthIdeas, type YouthIdea, type YouthPartSide } from './db/schema';
import { assertRecording } from './recording';

export function listIdeas(db: Db, opts: { open: boolean }): (YouthIdea & { createdByName: string })[] {
	const open = and(isNull(youthIdeas.dismissedAt), isNull(youthIdeas.plannedEventId));
	return db
		.select({ idea: youthIdeas, createdByName: users.name })
		.from(youthIdeas)
		.leftJoin(users, eq(users.id, youthIdeas.createdBy))
		.where(opts.open ? open : or(isNotNull(youthIdeas.dismissedAt), isNotNull(youthIdeas.plannedEventId)))
		.orderBy(desc(youthIdeas.createdAt), desc(youthIdeas.id))
		.all()
		.map((r) => ({ ...r.idea, createdByName: r.createdByName ?? '' }));
}

export function createIdea(db: Db, input: { text: string; side: YouthPartSide; note: string | null; createdBy: number }): YouthIdea {
	assertRecording();
	return db.insert(youthIdeas).values(input).returning().get();
}

export function dismissIdea(db: Db, id: number) {
	assertRecording();
	db.update(youthIdeas).set({ dismissedAt: new Date().toISOString() }).where(eq(youthIdeas.id, id)).run();
}

export function planIdea(db: Db, id: number, eventId: number) {
	assertRecording();
	db.update(youthIdeas).set({ plannedEventId: eventId, dismissedAt: null }).where(eq(youthIdeas.id, id)).run();
}

export function openIdeasFor(db: Db, side: YouthPartSide): YouthIdea[] {
	return listIdeas(db, { open: true })
		.filter((i) => side === 'both' || i.side === side || i.side === 'both')
		.map(({ createdByName: _, ...i }) => i);
}
