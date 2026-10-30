const DAY_MS = 86_400_000;
export const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const WEEKDAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

/** z.B. "Oktober 2026" */
export const monthLabel = (iso: string) => `${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export function parseIso(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function isSunday(iso: string): boolean {
	return parseIso(iso).getUTCDay() === 0;
}

export function addDays(iso: string, n: number): string {
	return toIso(new Date(parseIso(iso).getTime() + n * DAY_MS));
}

export function addMonths(iso: string, n: number): string {
	const d = parseIso(iso);
	const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n + 1, 0));
	const day = Math.min(d.getUTCDate(), target.getUTCDate());
	return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, day)));
}

export function todayIso(now: Date = new Date()): string {
	return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function nextSundayIso(iso: string): string {
	const diff = (7 - parseIso(iso).getUTCDay()) % 7;
	return addDays(iso, diff);
}

export function sundaysBetween(from: string, to: string): string[] {
	const out: string[] = [];
	for (let s = nextSundayIso(from); s <= to; s = addDays(s, 7)) out.push(s);
	return out;
}

export function weeksBetween(from: string, to: string): number {
	return Math.floor((parseIso(to).getTime() - parseIso(from).getTime()) / (7 * DAY_MS));
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDateShort(iso: string): string {
	const d = parseIso(iso);
	return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

export function formatDateDe(iso: string): string {
	return `${WEEKDAYS[parseIso(iso).getUTCDay()]}, ${formatDateShort(iso)}`;
}

/** z.B. "Sonntag, 13. September 2026" */
export function formatDateLong(iso: string): string {
	const d = parseIso(iso);
	return `${WEEKDAYS_LONG[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const ZURICH_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' });
const ZURICH_CLOCK = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' });

/** Swiss calendar day of a UTC timestamp as "Heute", "Gestern" or the long date. */
export function changeDay(iso: string, now: Date = new Date()): string {
	const day = ZURICH_DAY.format(new Date(iso));
	const today = ZURICH_DAY.format(now);
	if (day === today) return 'Heute';
	if (day === addDays(today, -1)) return 'Gestern';
	return formatDateLong(day);
}

export const changeClock = (iso: string) => ZURICH_CLOCK.format(new Date(iso));

/** "heute 14:42", "gestern 09:10" or "Dienstag, 28. Oktober 2026, 20:14". */
export function formatChangeTime(iso: string, now: Date = new Date()): string {
	const day = changeDay(iso, now);
	return day === 'Heute' || day === 'Gestern' ? `${day.toLowerCase()} ${changeClock(iso)}` : `${day}, ${changeClock(iso)}`;
}
