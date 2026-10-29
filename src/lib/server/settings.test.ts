import { expect, it } from 'vitest';
import { createDb } from './db';
import { getAllSettings, getSetting, setSetting, youthTimes } from './settings';

it('returns defaults and persists changes', () => {
	const db = createDb(':memory:');
	expect(getSetting(db, 'ward_name')).toBe('Gemeinde');
	setSetting(db, 'ward_name', 'Bern');
	setSetting(db, 'ward_name', 'Bern West');
	expect(getSetting(db, 'ward_name')).toBe('Bern West');
	expect(getAllSettings(db)).toEqual({ ward_name: 'Bern West', youth_page_token: '', bishopric: '[]', music_callings: '{}', youth_wed_start: '', youth_wed_end: '', youth_sun_start: '', youth_sun_end: '' });
});

it('youth times are null until all four are set', () => {
	const db = createDb(':memory:');
	expect(youthTimes(db)).toBeNull();
	setSetting(db, 'youth_wed_start', '19:00');
	setSetting(db, 'youth_wed_end', '21:00');
	setSetting(db, 'youth_sun_start', '10:50');
	expect(youthTimes(db)).toBeNull();
	setSetting(db, 'youth_sun_end', '11:40');
	expect(youthTimes(db)).toEqual({ wed: ['19:00', '21:00'], sun: ['10:50', '11:40'] });
});

it('youth times are null when an end is not after its start', () => {
	const db = createDb(':memory:');
	setSetting(db, 'youth_wed_start', '21:00');
	setSetting(db, 'youth_wed_end', '19:00');
	setSetting(db, 'youth_sun_start', '10:50');
	setSetting(db, 'youth_sun_end', '11:40');
	expect(youthTimes(db)).toBeNull();
});
