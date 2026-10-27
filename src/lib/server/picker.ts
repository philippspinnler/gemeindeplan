import { formatDateShort } from '../dates';
import type { Member } from './db/schema';
import { byName, displayName } from './members';
import { weeksAgoLabel, type MemberActivity } from './stats';

export interface PickerOption { id: number; label: string; hint: string }

export function memberOptions(
	members: Member[],
	activity: Map<number, MemberActivity>,
	mode: 'talk' | 'prayer' | 'plain',
	today: string,
	includeId: number | null = null
): PickerOption[] {
	const declines = (m: Member) => (mode === 'talk' ? m.noTalk : mode === 'prayer' ? m.noPrayer : false);
	const visible = members.filter((m) => m.id === includeId || (m.active && !declines(m)));
	const last = (m: Member) => {
		const a = activity.get(m.id);
		return mode === 'talk' ? (a?.lastTalk ?? null) : mode === 'prayer' ? (a?.lastPrayer ?? null) : null;
	};
	const next = (m: Member) => {
		const a = activity.get(m.id);
		return mode === 'talk' ? (a?.nextTalk ?? null) : mode === 'prayer' ? (a?.nextPrayer ?? null) : null;
	};
	const sorted = [...visible].sort((a, b) => {
		if (mode === 'plain') return byName(a, b);
		const la = last(a), lb = last(b);
		if (la === lb) return byName(a, b);
		if (la === null) return -1;
		if (lb === null) return 1;
		return la < lb ? -1 : 1;
	});
	return sorted.map((m) => {
		let hint = '';
		if (mode !== 'plain') {
			hint = (declines(m) ? 'möchte nicht · ' : '') + weeksAgoLabel(last(m), today);
			const n = next(m);
			if (n) hint += `, geplant ${formatDateShort(n)}`;
			const note = mode === 'talk' ? m.noteTalk : m.notePrayer;
			if (note) hint += ` · ${note}`;
		}
		return { id: m.id, label: displayName(m), hint };
	});
}
