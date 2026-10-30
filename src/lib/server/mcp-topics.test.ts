import { beforeEach, describe, expect, it } from 'vitest';
import { listChanges } from './changes';
import { createDb, type Db } from './db';
import { users } from './db/schema';
import { UserError } from './forms';
import { createMember } from './members';
import { createMeeting, loadMeetingFullByDate, saveGeneral } from './meetings';
import { readClasses, readSundays, setClassTopics, setSundayThemes, type McpUser } from './mcp-topics';
import { recordChanges } from './changes';
import { ensureYouthEvents, loadYouthEvent, saveYouthCommon } from './youth';

let db: Db;
let admin: McpUser;
const today = '2026-10-30';
const sunday = '2026-11-01';

const general = (date: string, over: Partial<Parameters<typeof saveGeneral>[2]> = {}) => {
	const id = loadMeetingFullByDate(db, date)!.meeting.id;
	recordChanges(db, null, [], () => saveGeneral(db, id, { kind: 'normal', theme: null, specialNote: null, presidingMemberId: null, absences: null, ...over }));
};
const common = (date: string, over: Partial<Parameters<typeof saveYouthCommon>[2]> = {}) =>
	recordChanges(db, null, [], () =>
		saveYouthCommon(db, loadYouthEvent(db, date)!.event.id, { kind: 'klasse', joint: false, details: null, topic: null, topicUrl: null, snack: null, ...over })
	);
const event = (date: string) => loadYouthEvent(db, date)!.event;

beforeEach(() => {
	db = createDb(':memory:');
	const u = db.insert(users).values({ email: 'eva@example.test', name: 'Eva Muster', role: 'admin', passwordHash: 'x' }).returning().get();
	admin = { id: u.id, role: 'admin' };
	createMeeting(db, sunday);
	createMeeting(db, '2026-11-08');
	ensureYouthEvents(db, today, 1);
});

describe('Sunday themes', () => {
	it('reads Sundays with kind and theme, and refuses more than 12 months', () => {
		general(sunday, { theme: 'Glaube' });
		expect(readSundays(db, admin, sunday, '2026-11-08')).toEqual([
			{ datum: sunday, art: 'Normal', programm: true, thema: 'Glaube' },
			{ datum: '2026-11-08', art: 'Normal', programm: true, thema: null }
		]);
		expect(() => readSundays(db, admin, '2026-11-01', '2027-12-01')).toThrow(UserError);
	});

	it('sets an empty Sunday theme and logs it under the user', () => {
		expect(setSundayThemes(db, admin, [{ datum: sunday, thema: 'Umkehr' }], false)).toEqual([{ datum: sunday, status: 'eingetragen', eingetragen: ['Thema'] }]);
		expect(loadMeetingFullByDate(db, sunday)!.meeting.theme).toBe('Umkehr');
		const [entry] = listChanges(db, 'admin');
		expect(entry).toMatchObject({ section: 'sonntag.programm', userName: 'Eva Muster', lines: ['Thema: – → Umkehr'] });
	});

	it('does not overwrite a theme unless asked', () => {
		general(sunday, { theme: 'alt' });
		expect(setSundayThemes(db, admin, [{ datum: sunday, thema: 'neu' }], false)).toEqual([{ datum: sunday, status: 'übersprungen', uebersprungen: { Thema: 'alt' } }]);
		expect(setSundayThemes(db, admin, [{ datum: sunday, thema: 'neu' }], true)[0].status).toBe('eingetragen');
		expect(loadMeetingFullByDate(db, sunday)!.meeting.theme).toBe('neu');
	});

	it('changes nothing but the theme', () => {
		const max = createMember(db, { firstName: 'Max', lastName: 'Test' });
		general(sunday, { kind: 'fastsonntag', specialNote: 'Kindersegnung', presidingMemberId: max.id });
		setSundayThemes(db, admin, [{ datum: sunday, thema: 'Fasten' }], false);
		const m = loadMeetingFullByDate(db, sunday)!.meeting;
		expect([m.kind, m.specialNote, m.presidingMemberId, m.theme]).toEqual(['fastsonntag', 'Kindersegnung', max.id, 'Fasten']);
	});

	it('refuses a Sunday without a program and a non-Sunday date', () => {
		general(sunday, { kind: 'generalkonferenz' });
		const [gk, wed] = setSundayThemes(db, admin, [{ datum: sunday, thema: 'X' }, { datum: '2026-11-04', thema: 'X' }], false);
		expect(gk).toMatchObject({ status: 'abgelehnt', grund: 'keine Versammlung mit Programm (Generalkonferenz)' });
		expect(wed).toMatchObject({ status: 'abgelehnt', grund: 'kein Sonntag' });
	});

	it('creates a regular Sunday that is not stored yet', () => {
		expect(setSundayThemes(db, admin, [{ datum: '2027-12-05', thema: 'Advent' }], false)[0].status).toBe('eingetragen');
		expect(loadMeetingFullByDate(db, '2027-12-05')!.meeting.theme).toBe('Advent');
	});

	it('refuses without permission', () => {
		expect(() => setSundayThemes(db, { id: admin.id, role: 'musik' }, [{ datum: sunday, thema: 'X' }], false)).toThrow(UserError);
		expect(() => setClassTopics(db, { id: admin.id, role: 'musik' }, [{ datum: sunday, thema: 'X' }], false)).toThrow(UserError);
	});
});

describe('class topics', () => {
	it('reads classes with topics and whether they take place', () => {
		common(sunday, { topic: 'Glaube', topicUrl: 'https://example.test/glaube' });
		general('2026-11-08', { kind: 'generalkonferenz' });
		expect(readClasses(db, admin, sunday, '2026-11-08')).toEqual([
			{ datum: sunday, findetStatt: true, grund: null, gemeinsam: false, thema: 'Glaube', link: 'https://example.test/glaube', themaJm: null, linkJm: null },
			{ datum: '2026-11-08', findetStatt: false, grund: 'Generalkonferenz', gemeinsam: false, thema: null, link: null, themaJm: null, linkJm: null }
		]);
	});

	it('fills only empty class fields', () => {
		common(sunday, { topic: 'Glaube' });
		expect(setClassTopics(db, admin, [{ datum: sunday, thema: 'Hoffnung', link: 'https://example.test/h' }], false)).toEqual([
			{ datum: sunday, status: 'teilweise', eingetragen: ['Link'], uebersprungen: { Thema: 'Glaube' } }
		]);
		expect([event(sunday).topic, event(sunday).topicUrl]).toEqual(['Glaube', 'https://example.test/h']);
		expect(listChanges(db, 'admin')[0].section).toBe('jugend.gemeinsam');
	});

	it('refuses a JM topic on a joint class and never toggles joint', () => {
		common(sunday, { joint: true });
		expect(setClassTopics(db, admin, [{ datum: sunday, thema: 'A', thema_jm: 'B' }], false)[0]).toMatchObject({ status: 'abgelehnt', grund: 'Klasse ist gemeinsam, kein eigenes JM-Thema' });
		expect(event(sunday)).toMatchObject({ joint: true, topic: null });
	});

	it('keeps an existing JM topic when none is given, even with overwrite', () => {
		common(sunday, { topic: 'A', topicJm: 'B', snack: 'Kuchen' });
		setClassTopics(db, admin, [{ datum: sunday, thema: 'C' }], true);
		expect(event(sunday)).toMatchObject({ topic: 'C', topicJm: 'B', snack: 'Kuchen', kind: 'klasse' });
	});

	it('refuses a link without http(s)', () => {
		expect(setClassTopics(db, admin, [{ datum: sunday, thema: 'A', link: 'Kapitel 3' }], false)[0]).toMatchObject({ status: 'abgelehnt', grund: 'Der Link muss mit http:// oder https:// beginnen.' });
		expect(event(sunday).topic).toBeNull();
	});

	it('refuses a class that does not take place', () => {
		common(sunday, { kind: 'erwachsene' });
		expect(setClassTopics(db, admin, [{ datum: sunday, thema: 'A' }], false)[0]).toMatchObject({ status: 'abgelehnt', grund: 'keine Klasse: Klasse mit den Erwachsenen' });
	});

	it('creates a class that is not stored yet', () => {
		expect(setClassTopics(db, admin, [{ datum: '2027-06-06', thema: 'Gebet' }], false)[0].status).toBe('eingetragen');
		expect(event('2027-06-06').topic).toBe('Gebet');
	});
});
