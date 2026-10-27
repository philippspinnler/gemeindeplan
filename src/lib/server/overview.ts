import { addDays, formatDateDe } from '../dates';
import { isFastLike, type MeetingKind } from './db/schema';
import { hymnLabel } from './hymns';
import { displayName } from './members';
import { KIND_LABELS, hasProgram, type MeetingFull } from './meetings';
import { isRated, readiness } from './stats';

export interface MeetingSummary {
	date: string;
	dateLabel: string;
	kind: MeetingKind;
	kindLabel: string;
	theme: string | null;
	presiding: string | null;
	speakers: string[];
	hymns: string[];
	missingProgram: string[];
	missingMusic: string[];
	/** Opening and closing prayer (name or null), only for roles that may pray. */
	prayers: { opening: string | null; closing: string | null };
	organist: string | null;
	conductor: string | null;
	rated: boolean;
	/** Conferences and "no meeting" have no program. */
	hasProgram: boolean;
	/** Fast Sundays have testimonies instead of talks. */
	hasTalks: boolean;
}

export function summarize(m: MeetingFull, opts: { showProgram: boolean; showPrayers: boolean }): MeetingSummary {
	const r = readiness(m);
	const prayer = (pos: number) => {
		const p = m.prayers.find((x) => x.position === pos);
		return opts.showPrayers && p?.member ? displayName(p.member) : null;
	};
	return {
		date: m.meeting.date,
		dateLabel: formatDateDe(m.meeting.date),
		kind: m.meeting.kind,
		kindLabel: KIND_LABELS[m.meeting.kind],
		theme: m.meeting.theme,
		presiding: opts.showProgram && m.presiding ? displayName(m.presiding) : null,
		speakers: opts.showProgram ? m.talks.filter((t) => t.member).map((t) => displayName(t.member!)) : [],
		hymns: (['anfang', 'abendmahl', 'zwischen', 'schluss'] as const)
			.map((s) => m.hymns[s])
			.filter((h) => h.hymn || h.freeText)
			.map((h) => (h.hymn ? hymnLabel(h.hymn) : h.freeText!)),
		missingProgram: opts.showProgram ? r.program : [],
		missingMusic: r.music,
		prayers: { opening: prayer(1), closing: prayer(2) },
		organist: m.organist ? displayName(m.organist) : null,
		conductor: m.conductor ? displayName(m.conductor) : null,
		rated: isRated(m.meeting.kind),
		hasProgram: hasProgram(m.meeting.kind),
		hasTalks: !isFastLike(m.meeting.kind)
	};
}

export function overviewRange(today: string, year: number | null): { from: string; to: string } {
	if (year) return { from: `${year}-01-01`, to: `${year}-12-31` };
	return { from: today, to: addDays(today, 12 * 7) };
}
