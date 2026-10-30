import type { LayoutServerLoad } from './$types';
import { can, youthOnly } from '$lib/server/permissions';
import { NEWS, newsForUser } from '$lib/server/news';
import { changeAreas } from '$lib/server/changes';

export const load: LayoutServerLoad = ({ locals }) => {
	const user = locals.user;
	const role = user?.role;
	return {
		user: locals.user,
		accountRole: locals.accountRole,
		canAsk: !!role && (can(role, 'ask.talks') || can(role, 'ask.prayers')),
		canHymns: !!role && can(role, 'hymns.edit'),
		canChanges: !!role && changeAreas(role).length > 0,
		canYouth: !!role && can(role, 'youth.view'),
		youthOnly: !!role && youthOnly(role),
		news: user && locals.accountRole === user.role ? newsForUser(locals.db, user.id, user.role) : [],
		newsCount: NEWS.length
	};
};
