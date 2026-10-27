import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './db';
import { createHymn } from './hymns';
import { createMember } from './members';
import { adjacentMeetingDates, assignOpenSlot, createMeeting, ensureSundays, getMeetingByDate, hasProgram, listMeetings, loadMeetingFullByDate, openSundays, saveAnnouncements, saveCallings, saveConductor, saveGeneral, saveMusic, savePrayers, saveTalks, sectionVersions } from './meetings';

let db: Db;
beforeEach(() => {
	db = createDb(':memory:');
});

describe('meetings', () => {
	it('creates Sundays only', () => {
		expect(() => createMeeting(db, '2026-09-14')).toThrowError('Datum ist kein Sonntag');
		const m = createMeeting(db, '2026-09-13');
		expect(m.kind).toBe('normal');
		expect(getMeetingByDate(db, '2026-09-13')?.id).toBe(m.id);
	});
	it('adds missing Sundays idempotently', () => {
		createMeeting(db, '2026-09-13');
		const created = ensureSundays(db, '2026-09-07', 1);
		expect(created).toBe(3);
		expect(ensureSundays(db, '2026-09-07', 1)).toBe(0);
		expect(listMeetings(db, '2026-09-01', '2026-10-31').map((m) => m.meeting.date)).toEqual(['2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04']);
	});
	it('hasProgram', () => {
		expect(hasProgram('normal')).toBe(true);
		expect(hasProgram('fastsonntag')).toBe(true);
		expect(hasProgram('gemeindekonferenz')).toBe(true);
		expect(hasProgram('ostern')).toBe(true);
		expect(hasProgram('jd')).toBe(true);
		expect(hasProgram('weihnachten')).toBe(true);
		expect(hasProgram('generalkonferenz')).toBe(false);
		expect(hasProgram('keine')).toBe(false);
	});
	it('saves and loads all sections', () => {
		const m = createMeeting(db, '2026-09-13');
		const anna = createMember(db, { firstName: 'Anna', lastName: 'Rey' });
		const joerg = createMember(db, { firstName: 'Urs', lastName: 'Bischof' });
		const h1 = createHymn(db, { number: 202, title: 'Ich bin ein Kind von Gott' });
		createHymn(db, { number: 56, title: 'O fest wie ein Felsen' });

		saveGeneral(db, m.id, { kind: 'fastsonntag', theme: 'Familie', specialNote: null, presidingMemberId: joerg.id, absences: 'Reto' });
		savePrayers(db, m.id, [
			{ position: 1, memberId: anna.id },
			{ position: 2, memberId: null }
		]);
		saveTalks(db, m.id, [
			{ position: 1, memberId: anna.id, durationMinutes: 5, confirmed: false },
			{ position: 3, memberId: null, durationMinutes: 15, confirmed: false }
		]);
		saveAnnouncements(db, m.id, ['Pfahl-Plauschtag', 'Neue 2. Stunde']);
		saveCallings(db, m.id, [{ kind: 'berufung', personName: 'Nadja Moser', calling: 'FHV-Präsidentin' }]);
		const music = saveMusic(db, m.id, {
			hymns: {
				anfang: { hymnNumber: 202, freeText: null },
				abendmahl: { hymnNumber: 56, freeText: null },
				zwischen: { hymnNumber: null, freeText: 'PV singt' },
				schluss: { hymnNumber: 9999, freeText: null }
			},
			organistMemberId: anna.id,
			conductorMemberId: null,
			musicNote: 'Vreni fehlt'
		});
		expect(music.unknownNumbers).toEqual([9999]);

		const full = loadMeetingFullByDate(db, '2026-09-13')!;
		expect(full.meeting.kind).toBe('fastsonntag');
		expect(full.presiding?.firstName).toBe('Urs');
		expect(full.prayers.map((p) => [p.position, p.member?.firstName ?? null])).toEqual([[1, 'Anna'], [2, null]]);
		expect(full.talks.map((t) => t.position)).toEqual([1, 3]);
		expect(full.talks.map((t) => [t.durationMinutes, t.confirmed])).toEqual([[5, false], [15, false]]);
		expect(full.announcements).toEqual(['Pfahl-Plauschtag', 'Neue 2. Stunde']);
		expect(full.callings[0].calling).toBe('FHV-Präsidentin');
		expect(full.hymns.anfang.hymn?.id).toBe(h1.id);
		// Fast Sunday: no intermediate hymn even if one was passed
		expect(full.hymns.zwischen).toEqual({ hymn: null, freeText: null });
		expect(full.hymns.schluss).toEqual({ hymn: null, freeText: null });
		expect(full.organist?.firstName).toBe('Anna');
		expect(full.meeting.musicNote).toBe('Vreni fehlt');

		saveAnnouncements(db, m.id, []);
		expect(loadMeetingFullByDate(db, '2026-09-13')!.announcements).toEqual([]);
	});

	it('saveConductor sets and clears only the conducting field', () => {
		const m = createMeeting(db, '2026-09-13');
		const anna = createMember(db, { firstName: 'Anna', lastName: 'Rey' });
		saveConductor(db, m.id, anna.id);
		expect(loadMeetingFullByDate(db, '2026-09-13')!.conductor?.firstName).toBe('Anna');
		saveConductor(db, m.id, null);
		expect(loadMeetingFullByDate(db, '2026-09-13')!.conductor).toBeNull();
	});

	it('saveMusic discards the intermediate hymn on fast Sunday', () => {
		const m = createMeeting(db, '2026-09-13');
		saveGeneral(db, m.id, { kind: 'fastsonntag', theme: null, specialNote: null, presidingMemberId: null, absences: null });
		createHymn(db, { number: 202, title: 'Ich bin ein Kind von Gott' });
		const result = saveMusic(db, m.id, {
			hymns: {
				anfang: { hymnNumber: 202, freeText: null },
				abendmahl: { hymnNumber: null, freeText: null },
				zwischen: { hymnNumber: 9999, freeText: 'PV singt' },
				schluss: { hymnNumber: null, freeText: null }
			},
			organistMemberId: null,
			conductorMemberId: null,
			musicNote: null
		});
		expect(result.unknownNumbers).toEqual([]);
		const full = loadMeetingFullByDate(db, '2026-09-13')!;
		expect(full.hymns.zwischen).toEqual({ hymn: null, freeText: null });
	});
});

describe('adjacentMeetingDates', () => {
	it('returns the previous and next existing Sunday', () => {
		const db = createDb(':memory:');
		for (const d of ['2026-09-06', '2026-09-13', '2026-09-27']) createMeeting(db, d);
		expect(adjacentMeetingDates(db, '2026-09-13')).toEqual({ prev: '2026-09-06', next: '2026-09-27' });
		expect(adjacentMeetingDates(db, '2026-09-06')).toEqual({ prev: null, next: '2026-09-13' });
		expect(adjacentMeetingDates(db, '2026-09-27')).toEqual({ prev: '2026-09-13', next: null });
	});
});

describe('sectionVersions', () => {
	it('changes only for the section that was edited', () => {
		const m = createMeeting(db, '2026-09-13');
		const anna = createMember(db, { firstName: 'Anna', lastName: 'Rey' });
		createHymn(db, { number: 202, title: 'Ich bin ein Kind von Gott' });
		const v0 = sectionVersions(loadMeetingFullByDate(db, '2026-09-13')!);
		expect(sectionVersions(loadMeetingFullByDate(db, '2026-09-13')!)).toEqual(v0);

		saveTalks(db, m.id, [{ position: 1, memberId: anna.id, durationMinutes: null, confirmed: false }]);
		const v1 = sectionVersions(loadMeetingFullByDate(db, '2026-09-13')!);
		expect(v1.program).not.toBe(v0.program);
		expect(v1.music).toBe(v0.music);
		expect(v1.prayers).toBe(v0.prayers);

		savePrayers(db, m.id, [{ position: 1, memberId: anna.id }]);
		const v2 = sectionVersions(loadMeetingFullByDate(db, '2026-09-13')!);
		expect(v2.prayers).not.toBe(v1.prayers);
		expect(v2.program).not.toBe(v1.program);
		expect(v2.music).toBe(v1.music);

		saveConductor(db, m.id, anna.id);
		const v3 = sectionVersions(loadMeetingFullByDate(db, '2026-09-13')!);
		expect(v3.conductor).not.toBe(v2.conductor);
		expect(v3.music).not.toBe(v2.music);
		expect(v3.program).toBe(v2.program);
	});
});

describe('asking for a free slot', () => {
	it('offers Sundays by talk minutes left and fills the first free slot unconfirmed', () => {
		const anna = createMember(db, { firstName: 'Anna', lastName: 'Rey' });
		const lea = createMember(db, { firstName: 'Lea', lastName: 'Muster' });
		const ben = createMember(db, { firstName: 'Ben', lastName: 'Beispiel' });
		const m = createMeeting(db, '2026-11-08');
		const fast = createMeeting(db, '2026-11-01');
		saveGeneral(db, fast.id, { kind: 'fastsonntag', theme: null, specialNote: null, presidingMemberId: null, absences: null });
		saveTalks(db, m.id, [{ position: 1, memberId: anna.id, durationMinutes: 10, confirmed: true }]);

		expect(openSundays(db, '2026-10-27', '2026-11-30', 'talk')).toEqual([{ date: '2026-11-08', theme: null, free: 15, suggest: 12, position: 2, memberIds: [anna.id] }]);
		expect(openSundays(db, '2026-10-27', '2026-11-30', 'prayer').map((s) => s.date)).toEqual(['2026-11-01', '2026-11-08']);
		expect(assignOpenSlot(db, '2026-11-01', 'talk', lea.id, 12)).toBe(false);

		expect(assignOpenSlot(db, '2026-11-08', 'talk', lea.id, 10)).toBe(true);
		expect(openSundays(db, '2026-10-27', '2026-11-30', 'talk')[0]).toMatchObject({ free: 5, suggest: 5, position: 3 });
		expect(assignOpenSlot(db, '2026-11-08', 'talk', ben.id, 5)).toBe(true);
		expect(loadMeetingFullByDate(db, '2026-11-08')!.talks.map((t) => [t.position, t.member?.firstName, t.durationMinutes, t.confirmed])).toEqual([
			[1, 'Anna', 10, true],
			[2, 'Lea', 10, false],
			[3, 'Ben', 5, false]
		]);
		expect(openSundays(db, '2026-10-27', '2026-11-30', 'talk')).toEqual([]);
		expect(assignOpenSlot(db, '2026-11-08', 'talk', lea.id, 5)).toBe(false);
	});
	it('counts two talks of 12 minutes as a full Sunday', () => {
		const anna = createMember(db, { firstName: 'Anna', lastName: 'Rey' });
		const m = createMeeting(db, '2026-11-08');
		saveTalks(db, m.id, [{ position: 1, memberId: anna.id, durationMinutes: 12, confirmed: true }, { position: 2, memberId: anna.id, durationMinutes: null, confirmed: false }]);
		expect(openSundays(db, '2026-10-27', '2026-11-30', 'talk')).toEqual([]);
	});
});
