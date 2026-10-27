import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/** With a key the file is encrypted at rest; an existing plain file is encrypted on first open. */
function open(file: string, key: string | undefined): Database.Database {
	const sqlite = new Database(file);
	if (!key) return sqlite;
	const pragma = `key='${key.replaceAll("'", "''")}'`;
	sqlite.pragma(pragma);
	try {
		sqlite.prepare('SELECT count(*) FROM sqlite_master').get();
		return sqlite;
	} catch {
		sqlite.close();
	}
	const plain = new Database(file);
	// Rekeying is not supported in WAL mode.
	plain.pragma('journal_mode = DELETE');
	plain.pragma(`re${pragma}`);
	plain.close();
	return open(file, key);
}

export function createDb(file: string, key = process.env.DATABASE_KEY): Db {
	if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
	const sqlite = open(file, file === ':memory:' ? undefined : key);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema }) as Db;
	migrate(db, { migrationsFolder: path.resolve('drizzle') });
	return db;
}

let instance: Db | undefined;

export function getDb(): Db {
	if (!instance) instance = createDb(process.env.DATABASE_PATH ?? 'data/app.db');
	return instance;
}
