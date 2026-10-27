import { toIso } from '../../dates';
import { parseDuration } from '../../duration';
import type { MeetingKind } from '../db/schema';

type Obj = Record<string, unknown>;

export function cellText(v: unknown): string {
	if (v === null || v === undefined) return '';
	if (typeof v === 'string') return v.trim();
	if (typeof v === 'number') return String(v);
	if (v instanceof Date) return toIso(v);
	if (typeof v === 'object') {
		const o = v as Obj;
		if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join('').trim();
		if ('error' in o) return '';
		if ('result' in o) return cellText(o.result);
		if ('text' in o) return cellText(o.text);
	}
	return '';
}

export function cellNumber(v: unknown): number | null {
	if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
	if (typeof v === 'object' && v !== null && 'result' in (v as Obj)) return cellNumber((v as Obj).result);
	const t = cellText(v);
	const m = t.match(/^(\d+)$/);
	return m ? parseInt(m[1], 10) : null;
}

export function cellDateIso(v: unknown): string | null {
	if (v instanceof Date) return toIso(v);
	if (typeof v === 'number') return v > 20000 ? toIso(new Date(Math.round((v - 25569) * 86_400_000))) : null;
	if (typeof v === 'object' && v !== null && 'result' in (v as Obj)) return cellDateIso((v as Obj).result);
	const m = cellText(v).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
	if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
	return null;
}

export function cellSeconds(v: unknown): number | null {
	if (v instanceof Date) {
		const s = v.getUTCHours() * 3600 + v.getUTCMinutes() * 60 + v.getUTCSeconds();
		return s > 0 ? s : null;
	}
	if (typeof v === 'number') {
		const s = Math.round(v * 86_400);
		return s > 0 ? s : null;
	}
	if (typeof v === 'object' && v !== null && 'result' in (v as Obj)) return cellSeconds((v as Obj).result);
	return parseDuration(cellText(v));
}

const IGNORED = new Set(['', '-', '–', 'pv', '#n/a', 'nn', '!', 'orgel', 'x', '?', 'gk', 'leer', 'suchname', 'thema', 'ansprache']);

export function isIgnoredToken(s: string): boolean {
	return IGNORED.has(s.trim().toLowerCase());
}

const KIND_KEYWORDS: [MeetingKind, string][] = [
	['generalkonferenz', 'generalkonferenz'],
	['pfahlkonferenz', 'pfahlkonferenz'],
	['gemeindekonferenz', 'gemeindekonferenz'],
	['ostern', 'ostern'],
	['dka', 'dka'],
	['fhv', 'fhv'],
	['aek', 'aek'],
	['aek', 'äk'],
	['jd', 'jd'],
	['jm', 'jm'],
	['weihnachten', 'weihnacht'],
	['fastsonntag', 'fastsonntag'],
	['fastsonntag', 'faststonntag']
];

export function parseSpecial(text: string): { kind: MeetingKind; note: string | null } {
	const lower = text.toLowerCase();
	let kind: MeetingKind = 'normal';
	let note = text;
	for (const [k, kw] of KIND_KEYWORDS) {
		const short = kw.length <= 3;
		const hit = short ? new RegExp(`(^|[\\s,;/(])${kw}(?=$|[\\s,;/)])`, 'i').test(text) : lower.includes(kw);
		if (hit) {
			kind = k;
			note = short ? text.replace(new RegExp(`(^|[\\s,;/(])${kw}(?=$|[\\s,;/)])`, 'i'), '$1') : text.replace(new RegExp(`[^\\s,;/]*${kw}[^\\s,;/]*`, 'i'), '');
			break;
		}
	}
	note = note.replace(/^[\s,;/\-?]+|[\s,;/\-?]+$/g, '').trim();
	return { kind, note: note || null };
}

const DURATION_MARK = /(\d{1,2})'/;

export function parseTalk(
	nameRaw: string,
	topicRaw: string,
	isPast: boolean
): { name: string | null; confirmed: boolean; durationMinutes: number | null } {
	let nameText = nameRaw.trim();
	let topicText = topicRaw.trim();
	let durationMinutes: number | null = null;
	const nameMark = nameText.match(DURATION_MARK);
	if (nameMark) {
		durationMinutes = parseInt(nameMark[1], 10);
		nameText = nameText.replace(DURATION_MARK, '').trim();
	} else {
		const topicMark = topicText.match(DURATION_MARK);
		if (topicMark) {
			durationMinutes = parseInt(topicMark[1], 10);
			topicText = topicText.replace(DURATION_MARK, '').trim();
		}
	}
	const name = isIgnoredToken(nameText) ? null : nameText || null;
	// "Confirm"/"einladen" in the topic column mark a talk that is not yet confirmed.
	const confirmed = isPast || !/confirm|einladen/i.test(topicText);
	return { name, confirmed, durationMinutes };
}
