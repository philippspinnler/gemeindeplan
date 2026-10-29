import { describe, expect, it } from 'vitest';
import { createDb } from './db';
import { createUser } from './auth';
import { groupNews, markNewsSeen, NEWS, newsForUser, unseenNews, type NewsEntry } from './news';

const news: NewsEntry[] = [
	{ date: '2026-10-01', area: 'youth.view', title: 'Jugend', text: 'alt' },
	{ date: '2026-11-01', area: 'youth.view', title: 'Jugend', text: 'Jugend neu' },
	{ date: '2026-11-02', area: 'hymns.edit', title: 'Lieder', text: 'Lieder neu' }
];

describe('news', () => {
	it('shows only newer entries for areas the role may use, newest first', () => {
		expect(unseenNews('jd_leitung', 1, '', news).map((n) => n.text)).toEqual(['Jugend neu']);
		expect(unseenNews('musik', 1, '', news).map((n) => n.text)).toEqual(['Lieder neu']);
		expect(unseenNews('admin', 1, '', news).map((n) => n.text)).toEqual(['Lieder neu', 'Jugend neu']);
		expect(unseenNews('admin', 3, '', news)).toEqual([]);
	});

	it('before the first "Verstanden" shows entries dated after the account was created', () => {
		expect(unseenNews('admin', null, '2026-10-15T08:00:00.000Z', news).map((n) => n.text)).toEqual(['Lieder neu', 'Jugend neu']);
		expect(unseenNews('admin', null, '2026-11-02T08:00:00.000Z', news)).toEqual([]);
	});

	it('groups entries under their title', () => {
		expect(groupNews(unseenNews('admin', 0, '', news))).toEqual([
			{ title: 'Lieder', texts: ['Lieder neu'] },
			{ title: 'Jugend', texts: ['Jugend neu', 'alt'] }
		]);
	});

	it('starts new users clean and hides entries after "Verstanden"', async () => {
		const db = createDb(':memory:');
		const u = await createUser(db, { email: 'lea@example.ch', name: 'Lea Muster', role: 'jd_leitung', password: 'geheim123' });
		expect(newsForUser(db, u.id, 'jd_leitung')).toEqual([]);
		markNewsSeen(db, u.id, 0);
		expect(newsForUser(db, u.id, 'jd_leitung').length).toBeGreaterThan(0);
		markNewsSeen(db, u.id, NEWS.length + 1);
		expect(newsForUser(db, u.id, 'jd_leitung').length).toBeGreaterThan(0);
		markNewsSeen(db, u.id, NEWS.length);
		expect(newsForUser(db, u.id, 'jd_leitung')).toEqual([]);
	});
});
