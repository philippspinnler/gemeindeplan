import type { Db } from './db';
import { getSetting, setSetting } from './settings';
import { assertRecording } from './recording';

export const MUSIC_ROLES = ['organist', 'dirigent'] as const;
export type MusicRole = (typeof MUSIC_ROLES)[number];
export const MUSIC_ROLE_LABELS: Record<MusicRole, string> = { organist: 'Orgel / Klavier', dirigent: 'Dirigieren' };

export function getMusicCallings(db: Db): Record<MusicRole, number[]> {
	const out: Record<MusicRole, number[]> = { organist: [], dirigent: [] };
	try {
		const v = JSON.parse(getSetting(db, 'music_callings'));
		for (const role of MUSIC_ROLES) if (Array.isArray(v?.[role])) out[role] = v[role].filter((n: unknown) => Number.isInteger(n) && (n as number) > 0);
	} catch {
	}
	return out;
}

export function setMusicCalling(db: Db, role: MusicRole, ids: number[]): void {
	assertRecording();
	setSetting(db, 'music_callings', JSON.stringify({ ...getMusicCallings(db), [role]: [...new Set(ids)] }));
}
