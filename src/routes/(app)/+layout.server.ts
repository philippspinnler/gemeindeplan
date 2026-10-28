import type { LayoutServerLoad } from './$types';
import { can, youthOnly } from '$lib/server/permissions';

export const load: LayoutServerLoad = ({ locals }) => {
	const role = locals.user?.role;
	return {
		user: locals.user,
		accountRole: locals.accountRole,
		canAsk: !!role && (can(role, 'ask.talks') || can(role, 'ask.prayers')),
		canHymns: !!role && can(role, 'hymns.edit'),
		canYouth: !!role && can(role, 'youth.view'),
		youthOnly: !!role && youthOnly(role)
	};
};
