import { AsyncLocalStorage } from 'node:async_hooks';

const scope = new AsyncLocalStorage<{ depth: number }>();

/** Runs a request so that logged writes outside recordChanges fail loudly instead of slipping past the change log. */
export const requestScope = <T>(fn: () => T): T => scope.run({ depth: 0 }, fn);

export function assertRecording(): void {
	const s = scope.getStore();
	if (s && s.depth === 0) throw new Error('Write outside recordChanges');
}

export function insideRecording<T>(fn: () => T): T {
	const s = scope.getStore();
	if (s) s.depth++;
	try {
		return fn();
	} finally {
		if (s) s.depth--;
	}
}

/** Write functions that call assertRecording; routes importing one of them must log through recordChanges. */
export const GUARDED = [
	'saveGeneral', 'savePrayers', 'saveTalks', 'saveAnnouncements', 'saveCallings', 'saveMusic', 'saveConductor', 'assignOpenSlot',
	'saveYouthCommon', 'saveYouthPart', 'saveYouthAdults', 'createIdea', 'dismissIdea', 'planIdea', 'createBreak', 'updateBreak', 'deleteBreak'
];
