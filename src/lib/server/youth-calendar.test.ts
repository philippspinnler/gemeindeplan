import { beforeEach, describe, expect, it } from 'vitest';
import { setBishopric } from './bishopric';
import { createDb, type Db } from './db';
import { createMember } from './members';
import { setSetting } from './settings';
import { ensureYouthEvents, loadYouthEvent, saveYouthAdults, saveYouthCommon, saveYouthPart } from './youth';
import { calendarSig, parseCalendarFilter, toIcs, youthCalendarEntries, youthFeed, zurichToUtc, type CalendarFilter } from './youth-calendar';
import { newYouthPageToken } from './youth-page';
import { setLeaders, setYouth } from './youth-people';

let db: Db;
const today = '2026-10-19';
const all: CalendarFilter = { sides: ['jd', 'jm'], days: ['mi', 'so'], personId: null };
const none = { text: null, leaderMemberId: null, leaderGroup: null };
const id = (date: string) => loadYouthEvent(db, date)!.event.id;
const common = (date: string, over: Partial<Parameters<typeof saveYouthCommon>[2]> = {}) =>
	saveYouthCommon(db, id(date), { kind: loadYouthEvent(db, date)!.event.kind, joint: false, details: null, topic: null, topicUrl: null, snack: null, ...over });
const setTimes = () => {
	setSetting(db, 'youth_wed_start', '19:00');
	setSetting(db, 'youth_wed_end', '21:00');
	setSetting(db, 'youth_sun_start', '10:50');
	setSetting(db, 'youth_sun_end', '11:40');
};
const titles = (f: CalendarFilter, from = '2026-10-21', to = '2026-10-25') =>
	youthCalendarEntries(db, today, f).filter((e) => e.date >= from && e.date <= to).map((e) => `${e.date} ${e.title}`);

beforeEach(() => {
	db = createDb(':memory:');
	ensureYouthEvents(db, today, 1);
	setTimes();
});

describe('youth calendar entries', () => {
	it('returns nothing until the default times are set', () => {
		setSetting(db, 'youth_sun_end', '');
		expect(youthCalendarEntries(db, today, all)).toEqual([]);
	});

	it('titles a planned and an unplanned Wednesday per side', () => {
		saveYouthPart(db, id('2026-10-21'), 'jd', { ...none, text: 'Pizza backen' });
		expect(titles(all, '2026-10-21', '2026-10-21')).toEqual(['2026-10-21 JD Aktivität: Pizza backen', '2026-10-21 JM Aktivität']);
	});

	it('titles a joint Wednesday JD/JM and a Sunday class with its topic', () => {
		common('2026-10-21', { joint: true });
		saveYouthPart(db, id('2026-10-21'), 'both', { ...none, text: 'Grillen' });
		common('2026-10-25', { topic: 'Glaube' });
		expect(titles(all)).toEqual(['2026-10-21 JD/JM Aktivität: Grillen', '2026-10-25 JD Klasse: Glaube', '2026-10-25 JM Klasse: Glaube']);
		common('2026-10-25', { topic: 'Tochter Gottes', topicJm: 'Sohn Gottes' });
		expect(titles(all, '2026-10-25')).toEqual(['2026-10-25 JD Klasse: Tochter Gottes', '2026-10-25 JM Klasse: Sohn Gottes']);
	});

	it('leaves out off dates and class with the adults', () => {
		common('2026-10-25', { kind: 'erwachsene' });
		expect(titles(all)).toEqual(['2026-10-21 JD Aktivität', '2026-10-21 JM Aktivität']);
	});

	it('filters by side and weekday', () => {
		expect(titles({ sides: ['jm'], days: ['so'], personId: null })).toEqual(['2026-10-25 JM Klasse']);
		common('2026-10-21', { joint: true });
		expect(titles({ sides: ['jd'], days: ['mi'], personId: null })).toEqual(['2026-10-21 JD/JM Aktivität']);
	});

	it('a youth gets all activities of their side but only the classes they teach', () => {
		const lea = createMember(db, { firstName: 'Lea', lastName: 'Muster' });
		setYouth(db, lea.id, 'jd', null);
		saveYouthPart(db, id('2026-11-01'), 'jd', { ...none, teacherMemberId: lea.id });
		const f = { ...all, personId: lea.id };
		expect(titles(f, '2026-10-21', '2026-11-04')).toEqual(['2026-10-21 JD Aktivität', '2026-10-28 JD Aktivität', '2026-11-01 JD Klasse', '2026-11-04 JD Aktivität']);
		expect(titles({ ...f, days: ['so'] }, '2026-10-21', '2026-11-04')).toEqual(['2026-11-01 JD Klasse']);
	});

	it('an adult gets Wednesdays where present on their side; bishopric counts as JM', () => {
		const eva = createMember(db, { firstName: 'Eva', lastName: 'Probe' });
		const max = createMember(db, { firstName: 'Max', lastName: 'Test' });
		setLeaders(db, 'jd_beraterin', [eva.id]);
		setBishopric(db, [{ id: max.id, role: 'bischof' }]);
		saveYouthAdults(db, id('2026-10-21'), [{ memberId: eva.id, present: true }, { memberId: max.id, present: true }]);
		saveYouthAdults(db, id('2026-10-28'), [{ memberId: eva.id, present: false }]);
		expect(titles({ ...all, personId: eva.id }, '2026-10-21', '2026-10-28')).toEqual(['2026-10-21 JD Aktivität']);
		expect(titles({ ...all, personId: max.id }, '2026-10-21', '2026-10-28')).toEqual(['2026-10-21 JM Aktivität']);
	});

	it('an unknown person id gives no entries', () => {
		expect(youthCalendarEntries(db, today, { ...all, personId: 999 })).toEqual([]);
	});

	it('never puts Sunday text or details into the description', () => {
		const tim = createMember(db, { firstName: 'Tim', lastName: 'Beispiel' });
		setYouth(db, tim.id, 'jm', null);
		common('2026-10-25', { topic: 'Glaube' });
		saveYouthPart(db, id('2026-10-25'), 'jd', { ...none, text: 'Geheim', details: 'Intern', teacherMemberId: tim.id });
		saveYouthPart(db, id('2026-10-21'), 'jd', { ...none, text: 'Velotour', details: 'Treffpunkt Kirche' });
		const [wed, sun] = youthCalendarEntries(db, today, { ...all, sides: ['jd'] }).filter((e) => e.date >= '2026-10-21' && e.date <= '2026-10-25');
		expect(wed.description).toContain('Details: Treffpunkt Kirche');
		expect(sun.description).toContain('Lehrer: Tim');
		expect(sun.description).not.toMatch(/Geheim|Intern/);
		expect(sun.description).not.toContain('Beispiel');
	});
});

describe('ical', () => {
	it('converts Zurich time to UTC across daylight saving', () => {
		expect(zurichToUtc('2026-10-21', '19:00')).toBe('20261021T170000Z');
		expect(zurichToUtc('2026-11-04', '19:00')).toBe('20261104T180000Z');
	});

	it('escapes and folds iCal text', () => {
		const long = 'Ausflug über die Brücke mit Grillplatz '.repeat(6);
		const ics = toIcs(
			[
				{ uid: 'a', date: '2026-10-21', start: '19:00', end: '21:00', title: 'Grill, Spiele; mehr\nInfos', description: long, url: null }
			],
			'Musterdorf',
			new Date('2026-10-19T12:00:00Z')
		);
		expect(ics).toContain('SUMMARY:Grill\\, Spiele\\; mehr\\nInfos');
		const lines = ics.split('\r\n');
		expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
		expect(ics.replace(/\r\n /g, '')).toContain(`DESCRIPTION:${long}`);
		expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
	});

	it('writes URL only for http(s) links', () => {
		const entry = { uid: 'a', date: '2026-10-21', start: '19:00', end: '21:00', title: 'X', description: '' };
		const now = new Date('2026-10-19T12:00:00Z');
		expect(toIcs([{ ...entry, url: 'Kapitel 3' }], 'W', now)).not.toContain('URL:');
		expect(toIcs([{ ...entry, url: 'https://x.test/a' }], 'W', now)).toContain('URL:https://x.test/a');
	});

	it('parses the filter from query params', () => {
		expect(parseCalendarFilter(new URLSearchParams('seite=jm&tag=so&person=7'))).toEqual({ sides: ['jm'], days: ['so'], personId: 7 });
		expect(parseCalendarFilter(new URLSearchParams(''))).toEqual(all);
	});
});

describe('feed', () => {
	it('rejects a regenerated token', () => {
		const old = newYouthPageToken();
		setSetting(db, 'youth_page_token', old);
		expect(youthFeed(db, old, new URLSearchParams(), today)?.startsWith('BEGIN:VCALENDAR')).toBe(true);
		const fresh = newYouthPageToken();
		setSetting(db, 'youth_page_token', fresh);
		expect(youthFeed(db, old, new URLSearchParams(), today)).toBeNull();
		expect(youthFeed(db, fresh, new URLSearchParams(), today)).toContain('BEGIN:VEVENT');
	});
	it('serves a person feed only with that person\'s signature', () => {
		const token = newYouthPageToken();
		setSetting(db, 'youth_page_token', token);
		const lea = createMember(db, { firstName: 'Lea', lastName: 'Muster' });
		const tim = createMember(db, { firstName: 'Tim', lastName: 'Beispiel' });
		setYouth(db, lea.id, 'jd', null);
		setYouth(db, tim.id, 'jm', null);
		const feed = (q: string) => youthFeed(db, token, new URLSearchParams(q), today)!;
		expect(feed(`person=${lea.id}&sig=${calendarSig(token, lea.id)}`)).toContain('SUMMARY:JD Aktivität');
		expect(feed(`person=${lea.id}`)).not.toContain('BEGIN:VEVENT');
		expect(feed(`person=${lea.id}&sig=${calendarSig(token, tim.id)}`)).not.toContain('BEGIN:VEVENT');
	});
	it('rejects any token while none is set', () => {
		expect(youthFeed(db, '', new URLSearchParams(), today)).toBeNull();
	});
});
