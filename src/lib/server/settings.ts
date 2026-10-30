import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { settings } from './db/schema';
import { assertRecording } from './recording';

export const SETTING_DEFAULTS = {
	ward_name: 'Gemeinde',
	youth_page_token: '',
	bishopric: '[]',
	music_callings: '{}',
	youth_wed_start: '',
	youth_wed_end: '',
	youth_sun_start: '',
	youth_sun_end: ''
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export function getSetting(db: Db, key: SettingKey): string {
	return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? SETTING_DEFAULTS[key];
}

export function getAllSettings(db: Db): Record<SettingKey, string> {
	const out = { ...SETTING_DEFAULTS } as Record<SettingKey, string>;
	for (const row of db.select().from(settings).all()) {
		if (row.key in out) out[row.key as SettingKey] = row.value;
	}
	return out;
}

export function setSetting(db: Db, key: SettingKey, value: string): void {
	assertRecording();
	db.insert(settings)
		.values({ key, value })
		.onConflictDoUpdate({ target: settings.key, set: { value } })
		.run();
}

/** Default times (HH:MM) of the Wednesday activity and the Sunday class; null until all four are set and each ends after it starts. */
export function youthTimes(db: Db): { wed: [string, string]; sun: [string, string] } | null {
	const s = getAllSettings(db);
	const wed: [string, string] = [s.youth_wed_start, s.youth_wed_end];
	const sun: [string, string] = [s.youth_sun_start, s.youth_sun_end];
	return [wed, sun].every(([start, end]) => start && end && start < end) ? { wed, sun } : null;
}
