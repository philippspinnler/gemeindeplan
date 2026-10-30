import { addMonths, isSunday, parseIso, sundaysBetween, toIso } from '../dates';
import { recordChanges } from './changes';
import type { Db } from './db';
import type { Role } from './db/schema';
import { UserError } from './forms';
import { createMeeting, getMeetingByDate, hasProgram, KIND_LABELS, setMeetingTheme } from './meetings';
import { can, type Action } from './permissions';
import { classHeld, ensureYouthEvents, listYouthEvents, setClassTopics as writeClassTopics, YOUTH_KIND_LABELS, type ClassTopics, type YouthEventFull } from './youth';
import { YOUTH_BREAK_KIND_LABELS } from './youth-breaks';

export type McpUser = { id: number; role: Role };
export interface DateResult {
	datum: string;
	status: 'eingetragen' | 'übersprungen' | 'abgelehnt' | 'teilweise';
	eingetragen?: string[];
	uebersprungen?: Record<string, string>;
	grund?: string;
}

const MAX_MONTHS = 12;
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && toIso(parseIso(d)) === d;
const refused = (datum: string, grund: string): DateResult => ({ datum, status: 'abgelehnt', grund });

function allow(user: McpUser, action: Action) {
	if (!can(user.role, action)) throw new UserError('Dafür fehlt dir die Berechtigung.');
}

function checkRange(von: string, bis: string) {
	if (!isDate(von) || !isDate(bis) || bis < von) throw new UserError('Bitte von und bis als Datum (JJJJ-MM-TT) angeben, bis nicht vor von.');
	if (bis > addMonths(von, MAX_MONTHS)) throw new UserError(`Höchstens ${MAX_MONTHS} Monate auf einmal.`);
}

/**
 * Fills the given fields; existing values stay unless `overwrite`. Empty input never clears a field.
 * Returns the patch to write and the per-field outcome.
 */
function plan<K extends string>(fields: [label: string, key: K, value: string | undefined, current: string | null][], overwrite: boolean) {
	const patch: Partial<Record<K, string>> = {};
	const eingetragen: string[] = [];
	const uebersprungen: Record<string, string> = {};
	for (const [label, key, raw, current] of fields) {
		const value = raw?.trim();
		if (!value) continue;
		if (current === value || (current && !overwrite)) uebersprungen[label] = current!;
		else {
			patch[key] = value;
			eingetragen.push(label);
		}
	}
	return { patch, eingetragen, uebersprungen };
}

function outcome(datum: string, eingetragen: string[], uebersprungen: Record<string, string>): DateResult {
	const skipped = Object.keys(uebersprungen).length > 0;
	if (!eingetragen.length) return skipped ? { datum, status: 'übersprungen', uebersprungen } : refused(datum, 'nichts angegeben');
	return skipped ? { datum, status: 'teilweise', eingetragen, uebersprungen } : { datum, status: 'eingetragen', eingetragen };
}

export function readSundays(db: Db, user: McpUser, von: string, bis: string) {
	allow(user, 'meeting.view');
	checkRange(von, bis);
	return sundaysBetween(von, bis).map((datum) => {
		const m = getMeetingByDate(db, datum);
		const kind = m?.kind ?? 'normal';
		return { datum, art: KIND_LABELS[kind], programm: hasProgram(kind), thema: m?.theme ?? null };
	});
}

export function setSundayThemes(db: Db, user: McpUser, eintraege: { datum: string; thema: string }[], ueberschreiben: boolean): DateResult[] {
	allow(user, 'meeting.program');
	return eintraege.map(({ datum, thema }) => {
		if (!isDate(datum) || !isSunday(datum)) return refused(datum, 'kein Sonntag');
		const m = getMeetingByDate(db, datum) ?? (can(user.role, 'meetings.create') ? createMeeting(db, datum) : undefined);
		if (!m) return refused(datum, 'Datum nicht gefunden');
		if (!hasProgram(m.kind)) return refused(datum, `keine Versammlung mit Programm (${KIND_LABELS[m.kind]})`);
		const { patch, eingetragen, uebersprungen } = plan([['Thema', 'theme', thema, m.theme]], ueberschreiben);
		if (patch.theme) recordChanges(db, user.id, [{ section: 'sonntag.programm', key: datum }], () => setMeetingTheme(db, m.id, patch.theme!));
		return outcome(datum, eingetragen, uebersprungen);
	});
}

/** Why a class is off, from labels only: the app's off text can carry free-text details with names. */
function offReason(e: YouthEventFull): string {
	if (e.meetingKind && !classHeld(e.meetingKind)) return KIND_LABELS[e.meetingKind];
	if (e.offBreak) return YOUTH_BREAK_KIND_LABELS[e.offBreak.kind];
	return YOUTH_KIND_LABELS[e.event.kind];
}

const sundayClasses = (db: Db, von: string, bis: string) => listYouthEvents(db, von, bis).filter((e) => e.weekday === 'sunday');

export function readClasses(db: Db, user: McpUser, von: string, bis: string) {
	allow(user, 'youth.view');
	checkRange(von, bis);
	return sundayClasses(db, von, bis).map((e) => ({
		datum: e.event.date,
		findetStatt: e.status !== 'off',
		grund: e.status === 'off' ? offReason(e) : null,
		gemeinsam: e.event.joint,
		thema: e.event.topic,
		link: e.event.topicUrl,
		themaJm: e.event.topicJm,
		linkJm: e.event.topicUrlJm
	}));
}

export function setClassTopics(
	db: Db,
	user: McpUser,
	eintraege: { datum: string; thema?: string; link?: string; thema_jm?: string; link_jm?: string }[],
	ueberschreiben: boolean
): DateResult[] {
	allow(user, 'youth.common');
	return eintraege.map((x) => {
		const { datum } = x;
		if (!isDate(datum) || !isSunday(datum)) return refused(datum, 'kein Sonntag');
		if ([x.link, x.link_jm].some((l) => l?.trim() && !/^https?:\/\//i.test(l.trim()))) return refused(datum, 'Der Link muss mit http:// oder https:// beginnen.');
		ensureYouthEvents(db, datum, 0);
		const [e] = sundayClasses(db, datum, datum);
		if (e.status === 'off') return refused(datum, `keine Klasse: ${offReason(e)}`);
		if (e.event.joint && (x.thema_jm?.trim() || x.link_jm?.trim())) return refused(datum, 'Klasse ist gemeinsam, kein eigenes JM-Thema');
		const ev = e.event;
		const { patch, eingetragen, uebersprungen } = plan<keyof ClassTopics>([
			['Thema', 'topic', x.thema, ev.topic],
			['Link', 'topicUrl', x.link, ev.topicUrl],
			['Thema JM', 'topicJm', x.thema_jm, ev.topicJm],
			['Link JM', 'topicUrlJm', x.link_jm, ev.topicUrlJm]
		], ueberschreiben);
		if (eingetragen.length) recordChanges(db, user.id, [{ section: 'jugend.gemeinsam', key: datum }], () => writeClassTopics(db, ev.id, patch));
		return outcome(datum, eingetragen, uebersprungen);
	});
}
