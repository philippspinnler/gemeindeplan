import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { users, type Role } from './db/schema';
import { can, type Action } from './permissions';

/** A "what's new" entry, shown once to every user allowed to do `area`. */
export type NewsEntry = { date: string; area: Action; title: string; text: string };
export type NewsGroup = { title: string; texts: string[] };

export const NEWS: NewsEntry[] = [
	{
		date: '2026-10-29',
		area: 'youth.view',
		title: 'Jugend',
		text: 'Beim Snack kann man jetzt «kein Snack nötig» ankreuzen, und an einem Mittwoch lässt sich das Seminar mit «Seminar fällt aus» weglassen.'
	},
	{ date: '2026-10-29', area: 'youth.view', title: 'Jugend', text: 'In der Mittwochsliste und auf den Karten steht jetzt, welche Erwachsenen dabei sind.' },
	{
		date: '2026-10-29',
		area: 'youth.view',
		title: 'Jugend',
		text: 'Die nächsten Termine sehen jetzt gleich aus wie auf der öffentlichen Jugendseite; ein grüner oder roter Rand zeigt auf einen Blick, ob ein Termin schon geplant ist.'
	},
	{ date: '2026-10-29', area: 'youth.view', title: 'Jugend', text: 'Pfahl- und Tempeltermine über mehrere Tage erscheinen als ein Eintrag mit Zeitraum statt als einzelne Tage.' }
];

/**
 * Entries newer than the user's last "Verstanden" (or their account creation, so new users start clean).
 * ponytail: day granularity – an entry dated today is missed by whoever dismissed earlier today; date it tomorrow then.
 */
export function unseenNews(role: Role, seenAt: string, news: NewsEntry[] = NEWS): NewsEntry[] {
	const seenDay = seenAt.slice(0, 10);
	return news.filter((n) => n.date > seenDay && can(role, n.area)).sort((a, b) => b.date.localeCompare(a.date));
}

/** One section per title, in the order of each title's newest entry. */
export function groupNews(news: NewsEntry[]): NewsGroup[] {
	const groups = new Map<string, string[]>();
	for (const n of news) groups.set(n.title, [...(groups.get(n.title) ?? []), n.text]);
	return [...groups].map(([title, texts]) => ({ title, texts }));
}

export function newsForUser(db: Db, userId: number, role: Role): NewsGroup[] {
	const u = db.select({ seenAt: users.newsSeenAt, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).get();
	return u ? groupNews(unseenNews(role, u.seenAt ?? u.createdAt)) : [];
}

export function markNewsSeen(db: Db, userId: number, now: Date = new Date()): void {
	db.update(users).set({ newsSeenAt: now.toISOString() }).where(eq(users.id, userId)).run();
}
