import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './db';
import { youthBreaks } from './db/schema';
import { createMeeting, saveGeneral } from './meetings';
import { createMember } from './members';
import { ensureYouthEvents, listYouthEvents, loadYouthEvent, saveYouthCommon, saveYouthPart } from './youth';
import { compactText, newYouthPageToken, shortNames, youthPageItems } from './youth-page';
import { setLeaders, setYouth } from './youth-people';

let db: Db;
beforeEach(() => {
	db = createDb(':memory:');
});
const dates = (xs: { date: string }[]) => xs.map((x) => x.date);

describe('youth page items', () => {
	it('shows one shared lesson, or a lesson per side when JM differs', () => {
		ensureYouthEvents(db, '2026-10-19', 1);
		const sunday = () => youthPageItems(db, '2026-10-24').big[0];
		const id = loadYouthEvent(db, '2026-10-25')!.event.id;
		saveYouthCommon(db, id, { kind: 'klasse', joint: false, details: null, topic: 'Glaube', topicUrl: 'https://x.test/a', snack: null });
		expect([sunday().topic, sunday().parts.map((p) => p.topic)]).toEqual(['Glaube', [null, null]]);
		saveYouthCommon(db, id, { kind: 'klasse', joint: false, details: null, topic: 'Tochter Gottes', topicUrl: 'https://x.test/a', topicJm: 'Sohn Gottes', topicUrlJm: 'https://x.test/b', snack: null });
		expect(sunday().topic).toBeNull();
		expect(sunday().parts.map((p) => [p.side, p.topic, p.topicUrl])).toEqual([['jd', 'Tochter Gottes', 'https://x.test/a'], ['jm', 'Sohn Gottes', 'https://x.test/b']]);
		expect(compactText(sunday())).toContain('Tochter Gottes / Sohn Gottes');
	});
	it('shows two cards from today inclusive, then a month of dates after the last card', () => {
		let r = youthPageItems(db, '2026-10-20');
		expect(dates(r.big)).toEqual(['2026-10-21', '2026-10-25']);
		expect(dates(r.small)).toEqual(['2026-10-28', '2026-11-01', '2026-11-04', '2026-11-08', '2026-11-11', '2026-11-15', '2026-11-18', '2026-11-22', '2026-11-25']);
		r = youthPageItems(db, '2026-10-22');
		expect(dates(r.big)).toEqual(['2026-10-25', '2026-10-28']);
		expect(youthPageItems(db, '2026-10-25').big[0].date).toBe('2026-10-25');
	});
	it('inserts stake and temple breaks as compact rows, not holidays', () => {
		db.insert(youthBreaks).values([
			{ fromDate: '2026-10-30', toDate: '2026-10-30', label: 'Mini-MTC', kind: 'pfahl' },
			{ fromDate: '2026-10-31', toDate: '2026-11-07', label: 'Herbstferien', kind: 'ferien' },
			{ fromDate: '2026-10-23', toDate: '2026-10-23', label: 'Tempeltaufen', kind: 'tempel' }
		]).run();
		const r = youthPageItems(db, '2026-10-20');
		expect(dates(r.big)).toEqual(['2026-10-21', '2026-10-25']);
		expect(r.small.map((i) => [i.date, i.weekday]).slice(0, 5)).toEqual([['2026-10-23', 'other'], ['2026-10-28', 'wednesday'], ['2026-10-30', 'other'], ['2026-11-01', 'sunday'], ['2026-11-04', 'wednesday']]);
		expect(r.small[2]).toMatchObject({ kindLabel: 'Pfahl-Aktivität', offLabel: 'Mini-MTC' });
		expect(compactText(r.small[2])).toBe('Pfahl-Aktivität – Mini-MTC');
	});
	it('caps a running break at today', () => {
		db.insert(youthBreaks).values({ fromDate: '2026-10-10', toDate: '2026-10-22', label: 'Tempelwoche', kind: 'tempel' }).run();
		const r = youthPageItems(db, '2026-10-20');
		expect(r.small[0]).toMatchObject({ date: '2026-10-20', weekday: 'other' });
	});
	it('skips a break row already shown as an off Wednesday', () => {
		db.insert(youthBreaks).values({ fromDate: '2026-10-28', toDate: '2026-10-28', label: 'Mini-MTC', kind: 'pfahl' }).run();
		const r = youthPageItems(db, '2026-10-20');
		expect(r.small.filter((i) => i.date === '2026-10-28')).toHaveLength(1);
		expect(r.small[0]).toMatchObject({ weekday: 'wednesday', offLabel: 'Mini-MTC' });
	});
	it('shortNames disambiguates duplicate first names', () => {
		const a = createMember(db, { firstName: 'Mia', lastName: 'Koller' });
		const b = createMember(db, { firstName: 'Mia', lastName: 'Rey' });
		const c = createMember(db, { firstName: 'Reto', lastName: 'Gasser' });
		const n = shortNames([a, b, c]);
		expect([n.get(a.id), n.get(b.id), n.get(c.id)]).toEqual(['Mia K.', 'Mia R.', 'Reto']);
	});
	it('off and open statuses carry labels', () => {
		const m = createMeeting(db, '2026-10-25');
		saveGeneral(db, m.id, { kind: 'generalkonferenz' } as Parameters<typeof saveGeneral>[2]);
		const { big } = youthPageItems(db, '2026-10-20');
		expect(big[0]).toMatchObject({ status: 'open', kindLabel: 'Aktivität' });
		expect(big[1]).toMatchObject({ status: 'off', kindLabel: 'Kein JD/JM', offLabel: 'Generalkonferenz' });
		expect(compactText(big[0])).toBe('Aktivität · noch nicht geplant');
		expect(compactText(big[1])).toBe('Kein JD/JM – Generalkonferenz');
	});
	it('shows a special Wednesday kind without parts as planned', () => {
		ensureYouthEvents(db, '2026-10-21', 0);
		const id = loadYouthEvent(db, '2026-10-21')!.event.id;
		saveYouthCommon(db, id, { kind: 'basel', joint: true, details: null, topic: null, topicUrl: null, snack: null });
		const { big } = youthPageItems(db, '2026-10-20');
		expect(compactText(big[0])).toBe('Mit Basel – Basel leitet');
		expect(big[0].parts).toMatchObject([{ side: 'both', planned: true, text: null }]);
	});

	it('shows first names only and hides people who are not youth', () => {
		const lea = createMember(db, { firstName: 'Lea', lastName: 'Rey' });
		const adult = createMember(db, { firstName: 'Urs', lastName: 'Bischof' });
		setYouth(db, lea.id, 'jd', 'licht');
		ensureYouthEvents(db, '2026-10-20', 1);
		const e = listYouthEvents(db, '2026-10-21', '2026-10-21')[0];
		saveYouthPart(db, e.event.id, 'jd', { text: 'Film', leaderMemberId: adult.id, leaderGroup: null });
		saveYouthCommon(db, e.event.id, { kind: 'aktivitaet', joint: false, details: null, topic: null, topicUrl: null, snack: null, thoughtMemberId: lea.id });
		const item = youthPageItems(db, '2026-10-20').big[0];
		expect(item.parts).toEqual([
			{ side: 'jd', label: 'Junge Damen', planned: true, text: 'Film', details: null, leaderName: null, teacherName: null, topic: null, topicUrl: null },
			{ side: 'jm', label: 'Junge Männer', planned: false, text: null, details: null, leaderName: null, teacherName: null, topic: null, topicUrl: null }
		]);
		expect(item.thoughtName).toBe('Lea');
		expect(compactText(item)).toBe('Aktivität · Film · Geistiger Gedanke: Lea');
		// A leader may give the thought: first name only, like the youth.
		setLeaders(db, 'jd_beraterin', [adult.id]);
		saveYouthCommon(db, e.event.id, { kind: 'aktivitaet', joint: false, details: null, topic: null, topicUrl: null, snack: null, thoughtMemberId: adult.id });
		expect(youthPageItems(db, '2026-10-20').big[0].thoughtName).toBe('Urs');
	});
	it('newYouthPageToken is url-safe and unique', () => {
		const t = newYouthPageToken();
		expect(t).toMatch(/^[\w-]{24}$/);
		expect(newYouthPageToken()).not.toBe(t);
	});
});
