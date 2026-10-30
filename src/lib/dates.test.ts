import { describe, expect, it } from 'vitest';
import {
	changeDay,
	formatChangeTime,
	addDays, addMonths, formatDateDe, formatDateLong, formatDateShort, isSunday, nextSundayIso,
	sundaysBetween, todayIso, weeksBetween
} from './dates';

describe('dates', () => {
	it('detects Sundays', () => {
		expect(isSunday('2026-09-13')).toBe(true);
		expect(isSunday('2026-09-14')).toBe(false);
	});
	it('adds days and months', () => {
		expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
		expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
		expect(addMonths('2026-09-07', 12)).toBe('2027-09-07');
	});
	it('finds the next Sunday', () => {
		expect(nextSundayIso('2026-09-07')).toBe('2026-09-13');
		expect(nextSundayIso('2026-09-13')).toBe('2026-09-13');
	});
	it('lists Sundays inclusive of bounds', () => {
		expect(sundaysBetween('2026-09-07', '2026-09-27')).toEqual(['2026-09-13', '2026-09-20', '2026-09-27']);
	});
	it('counts whole weeks', () => {
		expect(weeksBetween('2026-08-30', '2026-09-13')).toBe(2);
		expect(weeksBetween('2026-08-30', '2026-09-12')).toBe(1);
	});
	it('formats in German', () => {
		expect(formatDateDe('2026-09-13')).toBe('So, 13.09.2026');
		expect(formatDateShort('2026-09-13')).toBe('13.09.2026');
		expect(formatDateLong('2026-09-13')).toBe('Sonntag, 13. September 2026');
		expect(formatDateLong('2026-03-02')).toBe('Montag, 2. März 2026');
	});
	it('todayIso uses local calendar dates', () => {
		expect(todayIso(new Date(2026, 8, 7, 23, 30))).toBe('2026-09-07');
	});
});

describe('change times', () => {
	const now = new Date('2026-10-30T13:00:00Z');
	it('names today and yesterday in Swiss time', () => {
		expect(formatChangeTime('2026-10-30T12:42:00Z', now)).toBe('heute 13:42');
		expect(formatChangeTime('2026-10-29T22:30:00Z', now)).toBe('gestern 23:30');
		expect(changeDay('2026-10-27T19:14:00Z', now)).toBe('Dienstag, 27. Oktober 2026');
	});
});
