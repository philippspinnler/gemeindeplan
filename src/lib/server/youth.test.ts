import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './db';
import { youthBreaks, type MeetingKind } from './db/schema';
import { createMeeting, saveGeneral } from './meetings';
import { createMember } from './members';
import {
	classHeld, ensureYouthEvents, isFifthSunday, listYouthEvents, loadYouthEvent, saveYouthAdults, saveYouthCommon, saveYouthPart,
	youthDatesBetween, youthSectionVersions, type YouthEventFull
} from './youth';

let db: Db;
beforeEach(() => {
	db = createDb(':memory:');
});

const none = { text: null, leaderMemberId: null, leaderGroup: null };
const common = (e: YouthEventFull, over: Partial<Parameters<typeof saveYouthCommon>[2]> = {}) =>
	saveYouthCommon(db, e.event.id, { kind: e.event.kind, joint: e.event.joint, details: null, topic: null, topicUrl: null, snack: null, ...over });
const load = (date: string) => loadYouthEvent(db, date)!;

describe('youth events', () => {
	it('youthDatesBetween returns Sundays and Wednesdays in order', () => {
		expect(youthDatesBetween('2026-10-19', '2026-10-28')).toEqual(['2026-10-21', '2026-10-25', '2026-10-28']);
	});
	it('ensureYouthEvents creates defaults once', () => {
		const n = ensureYouthEvents(db, '2026-10-19', 1);
		expect(n).toBeGreaterThan(8);
		expect(ensureYouthEvents(db, '2026-10-19', 1)).toBe(0);
		expect(load('2026-10-25').event.kind).toBe('klasse');
		expect(load('2026-10-21').event.kind).toBe('aktivitaet');
	});
	it('listYouthEvents synthesizes missing rows', () => {
		const list = listYouthEvents(db, '2026-10-19', '2026-10-28');
		expect(list.map((e) => [e.event.id, e.weekday, e.status])).toEqual([[0, 'wednesday', 'open'], [0, 'sunday', 'open'], [0, 'wednesday', 'open']]);
	});
	it('classHeld follows the meeting kind', () => {
		const table: [MeetingKind, boolean][] = [
			['normal', true], ['fastsonntag', true], ['gemeindekonferenz', true],
			['generalkonferenz', false], ['pfahlkonferenz', false], ['ostern', false], ['weihnachten', false], ['keine', false]
		];
		for (const [kind, held] of table) expect(classHeld(kind), kind).toBe(held);
	});
	it('loadYouthEvent marks a Sunday off when the meeting has no class', () => {
		ensureYouthEvents(db, '2026-10-19', 1);
		const m = createMeeting(db, '2026-10-25');
		saveGeneral(db, m.id, { kind: 'generalkonferenz' } as Parameters<typeof saveGeneral>[2]);
		saveYouthPart(db, load('2026-10-25').event.id, 'jd', { ...none, text: 'Lektion' });
		const e = load('2026-10-25');
		expect(e.status).toBe('off');
		expect(e.offLabel).toBe('Generalkonferenz');
	});
	it('off kinds append details', () => {
		ensureYouthEvents(db, '2026-10-19', 1);
		const e = load('2026-10-21');
		common(e, { kind: 'tempel', details: 'Basel' });
		expect(load('2026-10-21').offLabel).toBe('Tempel: Basel');
	});
	it('break cancels an open Wednesday but not one with content', () => {
		ensureYouthEvents(db, '2026-10-19', 1);
		db.insert(youthBreaks).values({ fromDate: '2026-10-19', toDate: '2026-10-30', label: 'Herbstferien', kind: 'ferien' }).run();
		let e = load('2026-10-21');
		expect([e.status, e.offLabel]).toEqual(['off', 'Herbstferien']);
		saveYouthPart(db, e.event.id, 'jm', { ...none, text: 'Spielabend' });
		e = load('2026-10-21');
		expect(e.status).toBe('planned');
		expect(e.break?.label).toBe('Herbstferien');
		expect(load('2026-10-25').break).toBeNull();
	});
	it('a Sunday topic or a special Wednesday kind counts as planned', () => {
		ensureYouthEvents(db, '2026-10-19', 1);
		common(load('2026-10-25'), { topic: 'Glaube' });
		common(load('2026-10-21'), { kind: 'fireside' });
		expect([load('2026-10-25').status, load('2026-10-21').status]).toEqual(['planned', 'planned']);
	});
	it('with Basel leading nothing is needed, with us leading someone must be planned', () => {
		ensureYouthEvents(db, '2026-10-19', 1);
		common(load('2026-10-21'), { kind: 'basel', joint: true });
		expect(load('2026-10-21').status).toBe('planned');
		common(load('2026-10-21'), { kind: 'basel_wir', joint: true });
		expect(load('2026-10-21').status).toBe('open');
		saveYouthPart(db, load('2026-10-21').event.id, 'both', { ...none, text: 'Grillen' });
		expect(load('2026-10-21').status).toBe('planned');
	});
	it('toggling joint merges and splits parts', () => {
		ensureYouthEvents(db, '2026-10-19', 1);
		const e = load('2026-10-21');
		saveYouthPart(db, e.event.id, 'jd', { ...none, text: 'Film' });
		saveYouthPart(db, e.event.id, 'jm', { ...none, text: 'Kart', leaderGroup: 'leitung' });
		common(e, { joint: true });
		expect(load('2026-10-21').parts.map((p) => [p.side, p.text, p.leaderGroup])).toEqual([['both', 'Film\nKart', 'leitung']]);
		common(e, { joint: false });
		expect(load('2026-10-21').parts.map((p) => [p.side, p.text])).toEqual([['jd', 'Film\nKart'], ['jm', 'Film\nKart']]);
	});
	it('the Wednesday thought belongs to the event and survives a joint toggle', () => {
		ensureYouthEvents(db, '2026-10-21', 0);
		const mia = createMember(db, { firstName: 'Mia', lastName: 'Muster' });
		const before = youthSectionVersions(load('2026-10-21')).common;
		common(load('2026-10-21'), { thoughtMemberId: mia.id });
		const e = load('2026-10-21');
		expect([e.thought?.firstName, e.status]).toEqual(['Mia', 'planned']);
		expect(youthSectionVersions(e).common).not.toBe(before);
		common(e, { joint: true });
		expect(load('2026-10-21').thought?.firstName).toBe('Mia');
	});
	it('saveYouthPart rejects a side that does not fit', () => {
		ensureYouthEvents(db, '2026-10-19', 1);
		const e = load('2026-10-21');
		expect(() => saveYouthPart(db, e.event.id, 'both', none)).toThrowError('Seite passt nicht zum Termin');
		common(e, { joint: true });
		expect(() => saveYouthPart(db, e.event.id, 'jd', none)).toThrowError('Seite passt nicht zum Termin');
	});
	it('saveYouthAdults keeps three states', () => {
		ensureYouthEvents(db, '2026-10-19', 1);
		const e = load('2026-10-21');
		const a = createMember(db, { firstName: 'Anna', lastName: 'Rey' });
		const b = createMember(db, { firstName: 'Urs', lastName: 'Bischof' });
		saveYouthAdults(db, e.event.id, [{ memberId: a.id, present: true }, { memberId: b.id, present: false }]);
		expect(load('2026-10-21').adults.map((x) => [x.member.id, x.present])).toEqual([[a.id, true], [b.id, false]]);
		saveYouthAdults(db, e.event.id, [{ memberId: b.id, present: null }]);
		expect(load('2026-10-21').adults.map((x) => x.member.id)).toEqual([a.id]);
	});
	it('youthSectionVersions changes only for the saved section', () => {
		ensureYouthEvents(db, '2026-10-19', 1);
		const e = load('2026-10-21');
		const before = youthSectionVersions(e);
		saveYouthPart(db, e.event.id, 'jd', { ...none, text: 'Film' });
		const after = youthSectionVersions(load('2026-10-21'));
		expect(after.jd).not.toBe(before.jd);
		expect({ ...after, jd: '' }).toEqual({ ...before, jd: '' });
	});
	it('isFifthSunday', () => {
		expect(isFifthSunday('2026-11-29')).toBe(true);
		expect(isFifthSunday('2026-11-22')).toBe(false);
	});
});
