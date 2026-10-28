import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { settings } from './db/schema';

export const SETTING_DEFAULTS = {
	ward_name: 'Gemeinde',
	youth_page_token: '',
	bishopric: '[]',
	music_callings: '{}'
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
	db.insert(settings)
		.values({ key, value })
		.onConflictDoUpdate({ target: settings.key, set: { value } })
		.run();
}
