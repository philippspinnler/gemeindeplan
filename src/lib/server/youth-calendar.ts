import { createHmac } from 'node:crypto';
import { addMonths } from '../dates';
import type { Db } from './db';
import type { YouthPartSide } from './db/schema';
import { getSetting, youthTimes } from './settings';
import { listYouthEvents } from './youth';
import { publicItem, tokenMatches, toItem, youthPageNames } from './youth-page';
import { listAdults, listAdultsFor, listYouth } from './youth-people';

export interface CalendarFilter { sides: ('jd' | 'jm')[]; days: ('mi' | 'so')[]; personId: number | null }
export interface CalendarEntry { uid: string; date: string; start: string; end: string; title: string; description: string; url: string | null }

const PREFIX: Record<YouthPartSide, string> = { jd: 'JD', jm: 'JM', both: 'JD/JM' };

export function parseCalendarFilter(params: URLSearchParams): CalendarFilter {
	const seite = params.get('seite');
	const tag = params.get('tag');
	const person = Number(params.get('person'));
	return {
		sides: seite === 'jd' || seite === 'jm' ? [seite] : ['jd', 'jm'],
		days: tag === 'mi' || tag === 'so' ? [tag] : ['mi', 'so'],
		personId: Number.isInteger(person) && person > 0 ? person : null
	};
}

/** Who a picked person is: a youth of one side, or an adult on the side they lead (bishopric → JM). */
function personSide(db: Db, id: number): { youth: boolean; side: 'jd' | 'jm' } | null {
	const y = listYouth(db).find((e) => e.member.id === id);
	if (y) return { youth: true, side: y.side };
	if (!listAdults(db).some((m) => m.id === id)) return null;
	return { youth: false, side: listAdultsFor(db, 'jd').some((m) => m.id === id) ? 'jd' : 'jm' };
}

export function youthCalendarEntries(db: Db, today: string, f: CalendarFilter): CalendarEntry[] {
	const times = youthTimes(db);
	if (!times) return [];
	const person = f.personId === null ? null : personSide(db, f.personId);
	if (f.personId !== null && !person) return [];
	const names = youthPageNames(db);
	const out: CalendarEntry[] = [];
	for (const e of listYouthEvents(db, addMonths(today, -1), addMonths(today, 6))) {
		if (e.status === 'off' || !f.days.includes(e.weekday === 'sunday' ? 'so' : 'mi')) continue;
		const item = publicItem(toItem(e, names));
		const sunday = e.weekday === 'sunday';
		for (const p of item.parts) {
			const sideMatches = (side: 'jd' | 'jm') => p.side === side || p.side === 'both';
			if (person) {
				const teaches = e.parts.find((x) => x.side === p.side)?.teacher?.id === f.personId;
				if (sunday ? !teaches : !sideMatches(person.side)) continue;
				if (!sunday && !person.youth && !e.adults.some((a) => a.present && a.member.id === f.personId)) continue;
			} else if (!f.sides.some(sideMatches)) continue;
			const name = sunday ? (p.topic ?? item.topic) : p.text;
			const lines = [
				!sunday && item.topic && `Thema: ${item.topic}`,
				p.leaderName && `Leitung: ${p.leaderName}`,
				p.teacherName && `Lehrer: ${p.teacherName}`,
				p.details && `Details: ${p.details}`,
				item.snack && `Snack: ${item.snack}`,
				item.thoughtName && `Gedanke: ${item.thoughtName}`,
				item.adults && `Erwachsene: ${item.adults}`,
				item.noSeminar && 'Kein Seminar'
			];
			const [start, end] = sunday ? times.sun : times.wed;
			out.push({
				uid: `${e.event.date}-${p.side}@gemeindeplan`,
				date: e.event.date,
				start,
				end,
				title: `${PREFIX[p.side]} ${sunday ? 'Klasse' : 'Aktivität'}${name ? `: ${name}` : ''}`,
				description: lines.filter(Boolean).join('\n'),
				url: p.topicUrl ?? item.topicUrl
			});
		}
	}
	return out;
}

const ZURICH = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Zurich', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const icsStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

/** Local Zurich wall time → UTC in iCal form, so no VTIMEZONE block is needed. */
export function zurichToUtc(date: string, hhmm: string): string {
	const [y, m, d] = date.split('-').map(Number);
	const [h, mi] = hhmm.split(':').map(Number);
	const guess = Date.UTC(y, m - 1, d, h, mi);
	const p = Object.fromEntries(ZURICH.formatToParts(guess).map((x) => [x.type, Number(x.value)]));
	const zurichAtGuess = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
	return icsStamp(guess - (zurichAtGuess - guess));
}

const escapeText = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

/** RFC 5545 folding: at most 75 octets per line, never splitting a UTF-8 character. */
function fold(line: string): string {
	const enc = new TextEncoder();
	const out: string[] = [];
	let cur = '';
	let size = 0;
	for (const ch of line) {
		const n = enc.encode(ch).length;
		if (size + n > (out.length ? 74 : 75)) {
			out.push(cur);
			cur = '';
			size = 0;
		}
		cur += ch;
		size += n;
	}
	out.push(cur);
	return out.join('\r\n ');
}

export function toIcs(entries: CalendarEntry[], ward: string, now: Date): string {
	const stamp = icsStamp(now.getTime());
	const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gemeindeplan//Jugend//DE', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeText(`JD/JM ${ward}`)}`];
	for (const e of entries) {
		lines.push(
			'BEGIN:VEVENT',
			`UID:${e.uid}`,
			`DTSTAMP:${stamp}`,
			`DTSTART:${zurichToUtc(e.date, e.start)}`,
			`DTEND:${zurichToUtc(e.date, e.end)}`,
			`SUMMARY:${escapeText(e.title)}`
		);
		if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
		if (e.url && /^https?:\/\/\S+$/.test(e.url)) lines.push(`URL:${e.url}`);
		lines.push('END:VEVENT');
	}
	lines.push('END:VCALENDAR');
	return lines.map(fold).join('\r\n') + '\r\n';
}

/** Signs a personal feed link so nobody can read another person's dates by changing the id; dies with the token. */
export const calendarSig = (token: string, personId: number) => createHmac('sha256', token).update(`calendar:${personId}`).digest('base64url').slice(0, 22);

/** The iCal text behind the youth page token, or null when the token is wrong. A person without a valid signature gets an empty calendar. */
export function youthFeed(db: Db, token: string, params: URLSearchParams, today: string, now = new Date()): string | null {
	const expected = getSetting(db, 'youth_page_token');
	if (!expected || !tokenMatches(token, expected)) return null;
	const filter = parseCalendarFilter(params);
	const signed = filter.personId === null || tokenMatches(params.get('sig') ?? '', calendarSig(expected, filter.personId));
	return toIcs(signed ? youthCalendarEntries(db, today, filter) : [], getSetting(db, 'ward_name'), now);
}

/** "Nur meine Termine" for a logged-in user whose login is linked to a youth or youth leader. */
export function calendarSelf(db: Db, memberId: number | null): { id: number; name: string; sig: string } | null {
	const token = getSetting(db, 'youth_page_token');
	if (!memberId || !token || !personSide(db, memberId)) return null;
	return { id: memberId, name: youthPageNames(db).get(memberId) ?? '', sig: calendarSig(token, memberId) };
}
