import { isSunday, toIso } from '../../dates';
import type { Db } from '../db';
import type { Member, YouthEventKind, YouthSide } from '../db/schema';
import { matchByFirstName } from '../members';
import { ensureYouthEvents, isWednesday, loadYouthEvent, OFF_KINDS, saveYouthAdults, saveYouthCommon, saveYouthPart, YOUTH_KIND_LABELS } from '../youth';
import { createBreak, listBreaks } from '../youth-breaks';
import { listAdults, listYouth } from '../youth-people';

export interface YouthImportReport { events: number; breaks: number; warnings: string[] }

/** Minimal RFC-4180 parser: quoted fields may contain commas, doubled quotes and newlines. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cur = '';
	let quoted = false;
	const endRow = () => { row.push(cur); cur = ''; if (row.some((c) => c.trim())) rows.push(row); row = []; };
	const t = text.replace(/^﻿/, '');
	for (let i = 0; i < t.length; i++) {
		const ch = t[i];
		if (quoted) {
			if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; }
			else if (ch === '"') quoted = false;
			else cur += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ',') { row.push(cur); cur = ''; }
		else if (ch === '\n') endRow();
		else if (ch !== '\r') cur += ch;
	}
	if (cur || row.length) endRow();
	return rows;
}

const norm = (h: string) => h.trim().replace(/:$/, '').trim().toLowerCase();
const ACT_COLUMNS = ['Datum', 'Art der Aktivität', 'Details', 'Geistiger Gedanke / Klasse', 'Thema', 'Aktivität JD', 'Leitung JD', 'Aktivität JM', 'Leitung JM', 'Anwesende Erw.', 'Abwesende Erw.', 'Snack'];
const CLS_COLUMNS = ['Datum', 'Details', 'Thema', 'Geistiger Gedanke / Klasse', 'Anwesende Erw.', 'Abwesende Erw.', 'Leitung JM', 'Leitung JD'];

/** Rows keyed by normalized header; missing expected columns read as '' after one warning. */
function records(csv: string, columns: string[], source: string, warn: (w: string) => void): Record<string, string>[] {
	const [head, ...rows] = parseCsv(csv);
	if (!head) return [];
	const keys = head.map(norm);
	const missing = columns.filter((c) => !keys.includes(norm(c)));
	for (const c of missing) warn(`Spalte '${c}' fehlt in ${source}`);
	return rows.map((r) => Object.fromEntries([...missing.map((c) => [norm(c), '']), ...keys.map((k, i) => [k, (r[i] ?? '').trim()])]));
}

function isoDate(s: string): string | null {
	const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
	if (!m) return null;
	const iso = toIso(new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])));
	return iso;
}

const ACTIVITY_KINDS: Record<string, { kind: YouthEventKind; joint: boolean }> = {
	'aktivitäten pratteln jd ap': { kind: 'aktivitaet', joint: false },
	'jd/ap pratteln gemeinsam': { kind: 'aktivitaet', joint: true },
	'gemeinsam mit basel': { kind: 'basel', joint: true },
	'pfahl-aktivität': { kind: 'pfahl', joint: false },
	'tempel taufen': { kind: 'tempel', joint: false },
	fireside: { kind: 'fireside', joint: false },
	übertragung: { kind: 'uebertragung', joint: false }
};
const JM_GROUPS: Record<string, string> = { 'priester kollegium': 'priester', 'lehrer kollegium': 'lehrer', 'diakons kollegium': 'diakone', leitung: 'leitung' };
const JD_GROUPS: Record<string, string> = { 'jd der hoffnung': 'hoffnung', 'jd des glaubens': 'glauben', 'jd des lichts': 'licht', leitung: 'leitung' };

/** One CSV (Airtable's single "JD/JM" table, class rows = "JD/AP Klassen") or two (activities, classes). */
export function importYouthCsv(db: Db, activitiesCsv: string, classesCsv: string | null, opts: { log?: (s: string) => void } = {}): YouthImportReport {
	return db.transaction(() => importAll(db, activitiesCsv, classesCsv, opts));
}

const CLASS_KIND = 'jd/ap klassen';

function importAll(db: Db, activitiesCsv: string, classesCsv: string | null, opts: { log?: (s: string) => void }): YouthImportReport {
	const report: YouthImportReport = { events: 0, breaks: 0, warnings: [] };
	const warn = (w: string) => { report.warnings.push(w); opts.log?.(`Hinweis: ${w}`); };
	const youth: Record<YouthSide, Member[]> = { jd: listYouth(db, 'jd').map((y) => y.member), jm: listYouth(db, 'jm').map((y) => y.member) };
	const adults = listAdults(db);
	const dates = new Set<string>();

	/** Resolves a first name; on failure warns and records the text for `details`. */
	const resolve = (date: string, field: string, name: string, pool: Member[], lost: string[]): Member | null => {
		if (!name) return null;
		const hit = matchByFirstName(pool, name);
		if (!hit) { warn(`${date}: ${field} '${name}' nicht gefunden`); lost.push(`${field}: ${name}`); }
		return hit;
	};
	const thoughts = (date: string, raw: string, lost: string[]): Record<YouthSide, Member | null> => {
		const out: Record<YouthSide, Member | null> = { jd: null, jm: null };
		for (const item of raw.split(',')) {
			const m = /^\s*(JD|JM)\s*:\s*(.+?)\s*$/i.exec(item);
			if (!m) { if (item.trim()) warn(`${date}: Geistiger Gedanke '${item.trim()}' nicht erkannt`); continue; }
			const side = m[1].toLowerCase() as YouthSide;
			out[side] = resolve(date, `Geistiger Gedanke ${m[1].toUpperCase()}`, m[2], [...youth[side], ...adults], lost);
		}
		return out;
	};
	const adultEntries = (date: string, r: Record<string, string>) => {
		const entries: { memberId: number; present: boolean }[] = [];
		for (const [field, present] of [['Anwesende Erw.', true], ['Abwesende Erw.', false]] as const) {
			for (const name of r[norm(field)].split(',')) {
				// Unresolved adults only warn: `details` can become a public off reason.
				const m = resolve(date, field, name.trim(), adults, []);
				if (m) entries.push({ memberId: m.id, present });
			}
		}
		return entries;
	};
	const store = (date: string, common: { kind: YouthEventKind; joint: boolean; details: string; topic: string; snack: string; thoughtMemberId?: number | null }, parts: Partial<Record<'jd' | 'jm' | 'both', { text: string | null; leaderMemberId: number | null; leaderGroup: string | null }>>, adultList: { memberId: number; present: boolean }[], lost: string[]) => {
		ensureYouthEvents(db, date, 0);
		const id = loadYouthEvent(db, date)!.event.id;
		const details = [common.details, ...lost].filter(Boolean).join('\n') || null;
		saveYouthCommon(db, id, { kind: common.kind, joint: common.joint, details, topic: common.topic || null, topicUrl: null, snack: common.snack || null, thoughtMemberId: common.thoughtMemberId ?? null });
		for (const [side, p] of Object.entries(parts)) saveYouthPart(db, id, side as 'jd' | 'jm' | 'both', p);
		const old = loadYouthEvent(db, date)!.adults.map((a) => ({ memberId: a.member.id, present: null }));
		saveYouthAdults(db, id, [...old, ...adultList]);
		dates.add(date);
	};

	const isClass = (r: Record<string, string>) => r['art der aktivität'].trim().toLowerCase() === CLASS_KIND;
	const all = classesCsv === null ? records(activitiesCsv, ACT_COLUMNS, 'der Tabelle', warn) : null;
	const activityRows = all ? all.filter((r) => !isClass(r)) : records(activitiesCsv, ACT_COLUMNS, 'den Aktivitäten', warn);
	const classRows = all ? all.filter(isClass) : records(classesCsv!, CLS_COLUMNS, 'den Sonntagsklassen', warn);

	for (const r of activityRows) {
		const date = isoDate(r['datum']);
		if (!date) { warn(`Ungültiges Datum '${r['datum']}' in den Aktivitäten`); continue; }
		const label = r['art der aktivität'];
		const lower = label.toLowerCase();
		const spec = lower === 'keine aktivität'
			? { kind: (r['details'].toLowerCase().includes('ferien') ? 'ferien' : 'keine') as YouthEventKind, joint: false }
			: ACTIVITY_KINDS[lower];
		if (!spec) { warn(`${date}: Art der Aktivität '${label}' unbekannt, Zeile übersprungen`); continue; }
		if (!isWednesday(date)) {
			if (spec.kind === 'pfahl' || spec.kind === 'tempel') {
				const label = r['details'] || YOUTH_KIND_LABELS[spec.kind];
				if (!listBreaks(db).some((b) => b.fromDate === date && b.toDate === date && b.kind === spec.kind)) {
					createBreak(db, { fromDate: date, toDate: date, label, kind: spec.kind });
					report.breaks++;
					opts.log?.(`Pause ${date}: ${label}`);
				}
			} else warn(`${date}: kein Mittwoch, Zeile übersprungen`);
			continue;
		}
		const lost: string[] = [];
		const th = thoughts(date, r['geistiger gedanke / klasse'], lost);
		// "Leitung" means the adult leaders run it: no person to resolve.
		const leader = (side: YouthSide) => (r[`leitung ${side}`].trim().toLowerCase() === 'leitung' ? null : resolve(date, `Leitung ${side.toUpperCase()}`, r[`leitung ${side}`], youth[side], lost));
		const lead = { jd: leader('jd'), jm: leader('jm') };
		// Airtable has one Details column; in the app details belong to the activity (part), the event keeps them only as off reason.
		const off = OFF_KINDS.includes(spec.kind);
		const details = off ? null : r['details'] || null;
		const part = (side: YouthSide) => ({ text: r[`aktivität ${side}`] || null, details, leaderMemberId: lead[side]?.id ?? null, leaderGroup: null });
		const jd = part('jd');
		const jm = part('jm');
		const both = { text: [jd.text, jm.text].filter(Boolean).join('\n') || null, details, leaderMemberId: jd.leaderMemberId ?? jm.leaderMemberId, leaderGroup: null };
		store(date, { ...spec, details: off ? r['details'] : '', topic: r['thema'], snack: r['snack'], thoughtMemberId: (th.jd ?? th.jm)?.id ?? null }, spec.joint ? { both } : { jd, jm }, adultEntries(date, r), lost);
	}

	for (const r of classRows) {
		const date = isoDate(r['datum']);
		if (!date) { warn(`Ungültiges Datum '${r['datum']}' in den Sonntagsklassen`); continue; }
		if (!isSunday(date)) { warn(`${date}: kein Sonntag, Zeile übersprungen`); continue; }
		const lost: string[] = [];
		const th = thoughts(date, r['geistiger gedanke / klasse'], lost);
		const group = (side: YouthSide, map: Record<string, string>) => {
			const raw = r[`leitung ${side}`];
			if (raw && !map[raw.toLowerCase()]) warn(`${date}: Leitung ${side.toUpperCase()} '${raw}' unbekannt`);
			return map[raw.toLowerCase()] ?? null;
		};
		// On class rows "Geistiger Gedanke / Klasse" names who teaches.
		const part = (side: YouthSide, map: Record<string, string>) => ({ text: null, details: r['details'] || null, leaderMemberId: null, leaderGroup: group(side, map), teacherMemberId: th[side]?.id ?? null });
		store(date, { kind: 'klasse', joint: false, details: '', topic: r['thema'], snack: '' }, { jd: part('jd', JD_GROUPS), jm: part('jm', JM_GROUPS) }, [], lost);
	}

	report.events = dates.size;
	return report;
}
