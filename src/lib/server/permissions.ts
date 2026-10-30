import { error } from '@sveltejs/kit';
import type { Role } from './db/schema';
import { ROLE_LABELS } from '../roles';

export type Action =
	| 'program.view'
	| 'meeting.view'
	| 'meeting.program'
	| 'meeting.prayers'
	| 'meeting.music'
	| 'meeting.conductor'
	| 'meetings.create'
	| 'hymns.view'
	| 'hymns.edit'
	| 'members.view'
	| 'members.create'
	| 'members.edit'
	| 'members.stats'
	| 'ask.talks'
	| 'ask.prayers'
	| 'notes.talk'
	| 'notes.prayer'
	| 'users.manage'
	| 'settings.edit'
	| 'changes.reset'
	| 'youth.view'
	| 'youth.jm'
	| 'youth.jd'
	| 'youth.common';

const MATRIX: Record<Action, Role[]> = {
	'program.view': ['admin', 'bischofschaft'],
	'meeting.view': ['admin', 'bischofschaft', 'gebete', 'musik', 'dirigent'],
	'meeting.program': ['admin', 'bischofschaft'],
	'meeting.prayers': ['admin', 'bischofschaft', 'gebete'],
	'meeting.music': ['admin', 'bischofschaft', 'musik'],
	'meeting.conductor': ['admin', 'bischofschaft', 'musik', 'dirigent'],
	'meetings.create': ['admin', 'bischofschaft'],
	'hymns.view': ['admin', 'bischofschaft', 'musik', 'dirigent'],
	'hymns.edit': ['admin', 'bischofschaft', 'musik'],
	'members.view': ['admin', 'bischofschaft', 'gebete'],
	'members.create': ['admin'],
	'members.edit': ['admin'],
	'members.stats': ['admin', 'bischofschaft'],
	'ask.talks': ['admin', 'bischofschaft'],
	'ask.prayers': ['admin', 'bischofschaft', 'gebete'],
	'notes.talk': ['admin', 'bischofschaft'],
	'notes.prayer': ['admin', 'bischofschaft', 'gebete'],
	'users.manage': ['admin'],
	'settings.edit': ['admin'],
	'changes.reset': ['admin'],
	'youth.view': ['admin', 'bischofschaft', 'jm_berater', 'jd_leitung'],
	'youth.jm': ['admin', 'bischofschaft', 'jm_berater'],
	'youth.jd': ['admin', 'jd_leitung'],
	'youth.common': ['admin', 'bischofschaft', 'jm_berater', 'jd_leitung']
};

export function can(role: Role, action: Action): boolean {
	return MATRIX[action].includes(role);
}

export function requireRole(user: { role: Role } | null | undefined, action: Action): void {
	if (!user) error(401, 'Bitte anmelden');
	if (!can(user.role, action)) error(403, 'Dafür fehlt dir die Berechtigung');
}

export const roleLabel = (role: Role): string => ROLE_LABELS[role];

/** Youth leaders without program access: Jugend is their home, Sonntage is hidden. */
export const youthOnly = (role: Role) => !can(role, 'meeting.view') && can(role, 'youth.view');
