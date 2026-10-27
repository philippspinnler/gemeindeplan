import { formatDateLong } from './dates';

/** WhatsApp link with a prepared request; the contact is chosen in WhatsApp, so the app stores no phone numbers. */
export function whatsappAskUrl(o: { firstName: string; task: string; date: string; theme?: string | null; minutes?: number | null; sender: string }): string {
	const day = formatDateLong(o.date).replace(/ \d{4}$/, '');
	const details = [o.theme ? `Das Thema ist «${o.theme}»` : '', o.minutes ? `ca. ${o.minutes} Minuten` : ''].filter(Boolean).join(', ');
	const ask = `Wärst du bereit, am ${day} in der Abendmahlsversammlung ${o.task}?${details ? ` ${details}.` : ''}`;
	const text = [`Hoi ${o.firstName}`, '', ask, '', 'Gib mir doch kurz Bescheid. Vielen Dank!', '', 'Liebe Grüsse', o.sender].join('\n');
	return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
