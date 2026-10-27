import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb } from '.';
import { createMember, listMembers } from '../members';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulpit-enc-'));
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('database encryption', () => {
	it('encrypts an existing plain file on first open with a key', () => {
		const file = path.join(dir, 'app.db');
		const plain = createDb(file, '');
		createMember(plain, { firstName: 'Lina', lastName: 'Beispielname' });
		plain.$client.close();

		const db = createDb(file, 'geheim');
		expect(listMembers(db).map((m) => m.lastName)).toEqual(['Beispielname']);
		db.$client.pragma('wal_checkpoint(TRUNCATE)');
		expect(fs.readFileSync(file).includes('Beispielname')).toBe(false);
		expect(() => new Database(file).prepare('SELECT * FROM members').all()).toThrow();

		const copy = path.join(dir, 'copy.db');
		db.$client.prepare('VACUUM INTO ?').run(copy);
		db.$client.close();
		expect(() => new Database(copy).prepare('SELECT * FROM members').all()).toThrow();
		expect(listMembers(createDb(copy, 'geheim')).map((m) => m.lastName)).toEqual(['Beispielname']);
	});
});
