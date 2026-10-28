import { describe, expect, it } from 'vitest';
import { createDb } from './db';
import { getMusicCallings, setMusicCalling } from './music-callings';

describe('music callings', () => {
	it('stores each role separately and drops duplicates', () => {
		const db = createDb(':memory:');
		expect(getMusicCallings(db)).toEqual({ organist: [], dirigent: [] });
		setMusicCalling(db, 'organist', [3, 1, 3]);
		setMusicCalling(db, 'dirigent', [2]);
		expect(getMusicCallings(db)).toEqual({ organist: [3, 1], dirigent: [2] });
	});
});
