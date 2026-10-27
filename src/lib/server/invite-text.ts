import type { Role } from './db/schema';
import { ROLE_HELP, ROLE_LABELS } from '../roles';

export function inviteText(name: string, link: string, role: Role): string {
	return [
		`Hallo ${name}`,
		'',
		'Ich habe dich bei Gemeindeplan eingeladen, unserer Planung für Abendmahlsversammlung und Jugend.',
		`Deine Rolle: ${ROLE_LABELS[role]}. ${ROLE_HELP[role]}`,
		'',
		'Bitte öffne diesen Link und setze dein Passwort:',
		link,
		'',
		'Der Link ist 7 Tage gültig. Bei Fragen melde dich einfach bei mir.',
		'',
		'Liebe Grüsse'
	].join('\n');
}

export function resetText(name: string, link: string): string {
	return [
		`Hallo ${name}`,
		'',
		'Hier ist dein Link, um bei Gemeindeplan ein neues Passwort zu setzen:',
		link,
		'',
		'Der Link ist 7 Tage gültig.',
		'',
		'Liebe Grüsse'
	].join('\n');
}
