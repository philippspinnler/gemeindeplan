import { describe, expect, it } from 'vitest';
import { createDb } from './db';
import { createMember } from './members';
import { createMeeting, loadMeetingFullByDate, savePrayers, saveTalks } from './meetings';
import { overviewRange, summarize } from './overview';

describe('overview', () => {
	it('overviewRange', () => {
		expect(overviewRange('2026-09-07', null)).toEqual({ from: '2026-09-06', to: '2026-11-30' });
		expect(overviewRange('2026-09-07', 2027)).toEqual({ from: '2027-01-01', to: '2027-12-31' });
	});
	it('summarize', () => {
		const db = createDb(':memory:');
		const anna = createMember(db, { firstName: 'Anna', lastName: 'Rey' });
		const m = createMeeting(db, '2026-09-13');
		saveTalks(db, m.id, [{ position: 1, memberId: anna.id, durationMinutes: 5, confirmed: true }]);
		savePrayers(db, m.id, [{ position: 2, memberId: anna.id }]);
		const s = summarize(loadMeetingFullByDate(db, '2026-09-13')!, { showProgram: true, showPrayers: true });
		expect(s.prayers).toEqual({ opening: null, closing: 'Anna Rey' });
		expect(summarize(loadMeetingFullByDate(db, '2026-09-13')!, { showProgram: false, showPrayers: false }).prayers).toEqual({ opening: null, closing: null });
		expect(summarize(loadMeetingFullByDate(db, '2026-09-13')!, { showProgram: false, showPrayers: true }).prayers.closing).toBe('Anna Rey');
		expect(s.dateLabel).toBe('So, 13.09.2026');
		expect(s.kindLabel).toBe('Normal');
		expect(s.speakers).toEqual(['Anna Rey']);
		expect(s.missingProgram).toContain('Leitung');
		expect(s.missingMusic).toContain('Orgel');
	});
	it('summarize hides the program for music roles', () => {
		const db = createDb(':memory:');
		const anna = createMember(db, { firstName: 'Anna', lastName: 'Rey' });
		const m = createMeeting(db, '2026-09-13');
		saveTalks(db, m.id, [{ position: 1, memberId: anna.id, durationMinutes: 5, confirmed: true }]);
		const s = summarize(loadMeetingFullByDate(db, '2026-09-13')!, { showProgram: false, showPrayers: false });
		expect(s.presiding).toBeNull();
		expect(s.speakers).toEqual([]);
		expect(s.missingProgram).toEqual([]);
		expect(s.missingMusic).toContain('Orgel');
	});
});
