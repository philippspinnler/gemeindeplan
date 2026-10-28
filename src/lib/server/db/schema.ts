import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const ROLES = ['admin', 'bischofschaft', 'gebete', 'musik', 'dirigent', 'jm_berater', 'jd_leitung'] as const;
export type Role = (typeof ROLES)[number];
export const MEETING_KINDS = ['normal', 'fastsonntag', 'dka', 'fhv', 'aek', 'jd', 'jm', 'ostern', 'weihnachten', 'gemeindekonferenz', 'generalkonferenz', 'pfahlkonferenz', 'keine'] as const;
/** Sundays without fixed speakers and without intermediate hymn (behave like a fast Sunday). */
export const FAST_LIKE_KINDS: readonly MeetingKind[] = ['fastsonntag', 'dka', 'fhv', 'aek', 'jd', 'jm'];
export function isFastLike(kind: MeetingKind): boolean {
	return FAST_LIKE_KINDS.includes(kind);
}
export type MeetingKind = (typeof MEETING_KINDS)[number];
export const HYMN_SLOTS = ['anfang', 'abendmahl', 'zwischen', 'schluss'] as const;
export type HymnSlot = (typeof HYMN_SLOTS)[number];
export const CALLING_KINDS = ['entlassung', 'berufung'] as const;
export const MEMBER_KINDS = ['gemeinde', 'pfahl'] as const;
export type MemberKind = (typeof MEMBER_KINDS)[number];
export type CallingKind = (typeof CALLING_KINDS)[number];

export const YOUTH_SIDES = ['jd', 'jm'] as const;
export type YouthSide = (typeof YOUTH_SIDES)[number];
export const YOUTH_GROUPS: Record<YouthSide, readonly string[]> = {
	jd: ['hoffnung', 'glauben', 'licht'],
	jm: ['diakone', 'lehrer', 'priester']
};
export const YOUTH_LEADER_ROLES = ['jm_berater', 'jd_beraterin', 'jd_praesidentin', 'jd_ratgeberin1', 'jd_ratgeberin2'] as const;
export type YouthLeaderRole = (typeof YOUTH_LEADER_ROLES)[number];
export const YOUTH_EVENT_KINDS = ['klasse', 'erwachsene', 'aktivitaet', 'gemeinsam_jd', 'gemeinsam_jm', 'basel', 'basel_jd', 'basel_jm'] as const;
export type YouthEventKind = (typeof YOUTH_EVENT_KINDS)[number];
export const YOUTH_PART_SIDES = ['jd', 'jm', 'both'] as const;
export type YouthPartSide = (typeof YOUTH_PART_SIDES)[number];
/** The four areas of personal development (General Handbook 10.2.1.3 / 11.2.1.3). */
export const YOUTH_AREAS = ['geistig', 'sozial', 'koerperlich', 'intellektuell'] as const;
export type YouthArea = (typeof YOUTH_AREAS)[number];
export const YOUTH_BREAK_KINDS = ['ferien', 'pfahl', 'tempel', 'supersamstag', 'tanzabend'] as const;

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const timestamps = {
	createdAt: text('created_at').notNull().default(now),
	updatedAt: text('updated_at').notNull().default(now)
};

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	role: text('role', { enum: ROLES }).notNull(),
	passwordHash: text('password_hash').notNull(),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	...timestamps
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: text('expires_at').notNull(),
	createdAt: text('created_at').notNull().default(now)
});

export const invites = sqliteTable('invites', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	token: text('token').notNull().unique(),
	email: text('email').notNull(),
	name: text('name').notNull(),
	role: text('role', { enum: ROLES }).notNull(),
	createdBy: integer('created_by').notNull().references(() => users.id),
	expiresAt: text('expires_at').notNull(),
	usedAt: text('used_at'),
	createdAt: text('created_at').notNull().default(now)
});

export const loginAttempts = sqliteTable('login_attempts', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull(),
	attemptedAt: text('attempted_at').notNull(),
	success: integer('success', { mode: 'boolean' }).notNull()
});

export const stakeCallings = sqliteTable('stake_callings', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	position: integer('position').notNull().default(0),
	/** Presides if present as a guest (e.g. stake presidency). */
	presides: integer('presides', { mode: 'boolean' }).notNull().default(false)
});

export const members = sqliteTable('members', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	firstName: text('first_name').notNull(),
	lastName: text('last_name').notNull(),
	affiliation: text('affiliation'),
	kind: text('kind', { enum: MEMBER_KINDS }).notNull().default('gemeinde'),
	stakeCallingId: integer('stake_calling_id').references(() => stakeCallings.id),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	noteTalk: text('note_talk'),
	notePrayer: text('note_prayer'),
	noTalk: integer('no_talk', { mode: 'boolean' }).notNull().default(false),
	noPrayer: integer('no_prayer', { mode: 'boolean' }).notNull().default(false),
	...timestamps
});

export const hymns = sqliteTable('hymns', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	number: integer('number').notNull().unique(),
	title: text('title').notNull(),
	book: text('book', { enum: ['gesangbuch', 'neu'] }).notNull(),
	durationSeconds: integer('duration_seconds'),
	...timestamps
});

export const meetings = sqliteTable('meetings', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	date: text('date').notNull().unique(),
	kind: text('kind', { enum: MEETING_KINDS }).notNull().default('normal'),
	theme: text('theme'),
	specialNote: text('special_note'),
	presidingMemberId: integer('presiding_member_id').references(() => members.id),
	absences: text('absences'),
	guestMemberId: integer('guest_member_id').references(() => members.id),
	/** Presiding person if set by hand; null = automatic by rule. */
	chairMemberId: integer('chair_member_id').references(() => members.id),
	/** The stake announces releasings/callings this Sunday. */
	stakeChanges: integer('stake_changes', { mode: 'boolean' }).notNull().default(false),
	organistMemberId: integer('organist_member_id').references(() => members.id),
	conductorMemberId: integer('conductor_member_id').references(() => members.id),
	talksStartTime: text('talks_start_time'),
	musicNote: text('music_note'),
	...timestamps
});

export const meetingPrayers = sqliteTable(
	'meeting_prayers',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		meetingId: integer('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		memberId: integer('member_id').references(() => members.id)
	},
	(t) => [uniqueIndex('meeting_prayers_pos').on(t.meetingId, t.position)]
);

export const meetingTalks = sqliteTable(
	'meeting_talks',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		meetingId: integer('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		memberId: integer('member_id').references(() => members.id),
		durationMinutes: integer('duration_minutes'),
		confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [uniqueIndex('meeting_talks_pos').on(t.meetingId, t.position)]
);

export const meetingHymns = sqliteTable(
	'meeting_hymns',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		meetingId: integer('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
		slot: text('slot', { enum: HYMN_SLOTS }).notNull(),
		hymnId: integer('hymn_id').references(() => hymns.id),
		freeText: text('free_text')
	},
	(t) => [uniqueIndex('meeting_hymns_slot').on(t.meetingId, t.slot)]
);

export const announcements = sqliteTable('announcements', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	meetingId: integer('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
	position: integer('position').notNull(),
	text: text('text').notNull()
});

export const callings = sqliteTable('callings', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	meetingId: integer('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
	position: integer('position').notNull(),
	kind: text('kind', { enum: CALLING_KINDS }).notNull(),
	personName: text('person_name').notNull(),
	calling: text('calling').notNull()
});

export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const youth = sqliteTable('youth', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	memberId: integer('member_id').notNull().unique().references(() => members.id, { onDelete: 'cascade' }),
	side: text('side', { enum: YOUTH_SIDES }).notNull(),
	group: text('group')
});

export const youthLeaders = sqliteTable('youth_leaders', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	memberId: integer('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
	role: text('role', { enum: YOUTH_LEADER_ROLES }).notNull()
});

export const youthEvents = sqliteTable('youth_events', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	date: text('date').notNull().unique(),
	kind: text('kind', { enum: YOUTH_EVENT_KINDS }).notNull().default('aktivitaet'),
	joint: integer('joint', { mode: 'boolean' }).notNull().default(false),
	details: text('details'),
	topic: text('topic'),
	topicUrl: text('topic_url'),
	/** Sunday: JM's own lesson when it differs; topic and topicUrl then belong to JD. */
	topicJm: text('topic_jm'),
	topicUrlJm: text('topic_url_jm'),
	snack: text('snack'),
	/** Wednesday: one spiritual thought for JD and JM together. */
	thoughtMemberId: integer('thought_member_id').references(() => members.id),
	...timestamps
});

export const youthEventParts = sqliteTable(
	'youth_event_parts',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		eventId: integer('event_id').notNull().references(() => youthEvents.id, { onDelete: 'cascade' }),
		side: text('side', { enum: YOUTH_PART_SIDES }).notNull(),
		text: text('text'),
		details: text('details'),
		leaderMemberId: integer('leader_member_id').references(() => members.id),
		leaderGroup: text('leader_group'),
		area: text('area', { enum: YOUTH_AREAS }),
		/** Sunday class: who teaches (youth or adult). */
		teacherMemberId: integer('teacher_member_id').references(() => members.id)
	},
	(t) => [uniqueIndex('youth_event_parts_side').on(t.eventId, t.side)]
);

export const youthEventAdults = sqliteTable(
	'youth_event_adults',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		eventId: integer('event_id').notNull().references(() => youthEvents.id, { onDelete: 'cascade' }),
		memberId: integer('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
		present: integer('present', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [uniqueIndex('youth_event_adults_member').on(t.eventId, t.memberId)]
);

export const youthIdeas = sqliteTable('youth_ideas', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	text: text('text').notNull(),
	side: text('side', { enum: YOUTH_PART_SIDES }).notNull(),
	note: text('note'),
	createdBy: integer('created_by').references(() => users.id),
	createdAt: text('created_at').notNull().default(now),
	plannedEventId: integer('planned_event_id').references(() => youthEvents.id, { onDelete: 'set null' }),
	dismissedAt: text('dismissed_at')
});

export const youthBreaks = sqliteTable('youth_breaks', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	fromDate: text('from_date').notNull(),
	toDate: text('to_date').notNull(),
	label: text('label'),
	kind: text('kind', { enum: YOUTH_BREAK_KINDS }).notNull(),
	/** Stake and temple dates may leave the Wednesday activity in place; holidays always cancel it. */
	cancels: integer('cancels', { mode: 'boolean' }).notNull().default(true)
});

export type User = typeof users.$inferSelect;
export type MemberRow = typeof members.$inferSelect;
export type Member = MemberRow & { calling: string | null };
export type StakeCalling = typeof stakeCallings.$inferSelect;
export type Hymn = typeof hymns.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type YouthEvent = typeof youthEvents.$inferSelect;
export type YouthIdea = typeof youthIdeas.$inferSelect;
export type YouthBreak = typeof youthBreaks.$inferSelect;
