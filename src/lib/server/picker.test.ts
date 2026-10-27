import { describe, expect, it } from 'vitest';
import type { Member } from './db/schema';
import { memberOptions } from './picker';
import type { MemberActivity } from './stats';

const m = (id: number, firstName: string, lastName: string, extra: Partial<Member> = {}): Member => ({
	id, firstName, lastName, affiliation: null, kind: 'gemeinde', stakeCallingId: null, calling: null, active: true, noteTalk: null, notePrayer: null, noTalk: false, noPrayer: false, createdAt: '', updatedAt: '', ...extra
});
const members = [m(1, 'Anna', 'Rey'), m(2, 'Beat', 'Fischer', { noteTalk: 'gerne kurz' }), m(3, 'Carla', 'Hofer', { active: false }), m(4, 'Dora', 'Arnold', { affiliation: 'Hoherat' })];
const act = new Map<number, MemberActivity>([
	[1, { lastTalk: '2026-06-07', lastPrayer: null, nextTalk: '2026-09-20', nextPrayer: null }],
	[2, { lastTalk: '2026-08-30', lastPrayer: null, nextTalk: null, nextPrayer: null }]
]);
const TODAY = '2026-09-07';

describe('memberOptions', () => {
	it('sorts by longest pause, "never" first, hides inactive', () => {
		const o = memberOptions(members, act, 'talk', TODAY);
		expect(o.map((x) => x.id)).toEqual([4, 1, 2]);
		expect(o[0]).toEqual({ id: 4, label: 'Arnold, Dora (Hoherat)', hint: 'nie' });
		expect(o[1].hint).toBe('vor 13 Wochen, geplant 20.09.2026');
		expect(o[2].hint).toBe('vor 1 Woche · gerne kurz');
	});
	it('keeps an inactive but selected member', () => {
		expect(memberOptions(members, act, 'talk', TODAY, 3).map((x) => x.id)).toEqual([4, 3, 1, 2]);
	});
	it('hides members who want no talk or no prayer', () => {
		const withFlags = [...members, m(5, 'Eva', 'Nef', { noTalk: true }), m(6, 'Fritz', 'Ott', { noPrayer: true })];
		expect(memberOptions(withFlags, act, 'talk', TODAY).map((x) => x.id)).toEqual([4, 6, 1, 2]);
		expect(memberOptions(withFlags, act, 'prayer', TODAY).map((x) => x.id)).toEqual([4, 2, 5, 1]);
		expect(memberOptions(withFlags, act, 'plain', TODAY).map((x) => x.id)).toEqual([4, 2, 5, 6, 1]);
	});
	it('shows an already selected member despite "no talk", with a hint', () => {
		const withFlags = [...members, m(5, 'Eva', 'Nef', { noTalk: true })];
		const o = memberOptions(withFlags, act, 'talk', TODAY, 5);
		expect(o.map((x) => x.id)).toEqual([4, 5, 1, 2]);
		expect(o[1].hint).toBe('möchte nicht · nie');
	});
	it('plain sorts by name without hint', () => {
		const o = memberOptions(members, act, 'plain', TODAY);
		expect(o.map((x) => x.label)).toEqual(['Arnold, Dora (Hoherat)', 'Fischer, Beat', 'Rey, Anna']);
		expect(o.every((x) => x.hint === '')).toBe(true);
	});
});
