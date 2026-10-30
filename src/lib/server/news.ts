import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { users, type Role } from './db/schema';
import { can, type Action } from './permissions';

/** A "what's new" entry, shown once to every user allowed to do `area`. `date` only decides what a brand-new account skips. */
export type NewsEntry = { date: string; area: Action; title: string; text: string };
export type NewsGroup = { title: string; texts: string[] };

/** Append only, oldest first: users store how many entries they have seen, so removing or reordering one shifts everybody. */
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
	{ date: '2026-10-29', area: 'youth.view', title: 'Jugend', text: 'Pfahl- und Tempeltermine über mehrere Tage erscheinen als ein Eintrag mit Zeitraum statt als einzelne Tage.' },
	{
		date: '2026-10-29',
		area: 'youth.view',
		title: 'Jugend',
		text: 'Die Details einer Mittwochsaktivität (z.B. Treffpunkt, was mitbringen) erscheinen jetzt auch auf der öffentlichen Jugendseite.'
	},
	{
		date: '2026-10-30',
		area: 'settings.edit',
		title: 'Einstellungen',
		text: 'Unter Einstellungen lassen sich die üblichen Zeiten der Mittwochsaktivität und der Sonntagsklasse eintragen. Sie werden für das neue Kalender-Abo der Jugendseite gebraucht. Neue Benutzer lädt man jetzt direkt als Mitglied ein.'
	},
	{
		date: '2026-10-30',
		area: 'youth.view',
		title: 'Jugend',
		text: 'Auf der öffentlichen Jugendseite kann man die Termine jetzt im eigenen Kalender abonnieren. Wer angemeldet ist, kann auch nur die eigenen Termine abonnieren.'
	},
	{
		date: '2026-10-30',
		area: 'meeting.view',
		title: 'Sonntage',
		text: 'Neben dem Titel eines Sonntags zeigt ein Verlaufssymbol, wer wann was geändert hat. Alle Änderungen deiner Bereiche findest du im Benutzermenü unter „Änderungen“.'
	},
	{
		date: '2026-10-30',
		area: 'youth.view',
		title: 'Jugend',
		text: 'Neben dem Titel eines Jugendtermins zeigt ein Verlaufssymbol, wer wann was geändert hat. Alle Änderungen deiner Bereiche findest du im Benutzermenü unter „Änderungen“.'
	},
	{
		date: '2026-10-30',
		area: 'settings.edit',
		title: 'Einstellungen',
		text: 'Im Verlauf kannst du einzelne Änderungen rückgängig machen. Hat jemand den Abschnitt seither weiter bearbeitet, fragt die App vorher nach.'
	},
	{
		date: '2026-10-30',
		area: 'settings.edit',
		title: 'Einstellungen',
		text: 'Unter „Konto“ kannst du einen persönlichen Schlüssel für Claude Desktop oder Claude Code erzeugen. Damit kann Claude Themen für die Abendmahlsversammlung und die Sonntagsklassen lesen und eintragen. Jede Änderung erscheint unter deinem Namen im Verlauf.'
	}
];

/** Entries after the last "Verstanden", newest first; before the first one, those dated after the account was created. */
export function unseenNews(role: Role, seen: number | null, createdAt: string, news: NewsEntry[] = NEWS): NewsEntry[] {
	const fresh = seen === null ? news.filter((n) => n.date > createdAt.slice(0, 10)) : news.slice(seen);
	return fresh.filter((n) => can(role, n.area)).reverse();
}

/** One section per title, in the order of each title's newest entry. */
export function groupNews(news: NewsEntry[]): NewsGroup[] {
	const groups = new Map<string, string[]>();
	for (const n of news) groups.set(n.title, [...(groups.get(n.title) ?? []), n.text]);
	return [...groups].map(([title, texts]) => ({ title, texts }));
}

export function newsForUser(db: Db, userId: number, role: Role): NewsGroup[] {
	const u = db.select({ seen: users.newsSeen, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).get();
	return u ? groupNews(unseenNews(role, u.seen, u.createdAt)) : [];
}

/** `count` is NEWS.length as the dialog was rendered, so an entry deployed while it was open still shows next time. */
export function markNewsSeen(db: Db, userId: number, count: number): void {
	if (!Number.isInteger(count) || count < 0 || count > NEWS.length) return;
	db.update(users).set({ newsSeen: count }).where(eq(users.id, userId)).run();
}
