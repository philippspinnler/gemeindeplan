import { readFileSync } from 'node:fs';
import { createDb } from '../src/lib/server/db';
import { recordImport } from '../src/lib/server/changes';
import { importYouthCsv } from '../src/lib/server/import/youth-importer';

const [activitiesPath, classesPath] = process.argv.slice(2);
if (!activitiesPath) {
	console.error('Aufruf: npm run import:jugend -- <jd-jm.csv> [<klassen.csv>]');
	process.exit(1);
}
const db = createDb(process.env.DATABASE_PATH ?? 'data/app.db');
const report = importYouthCsv(db, readFileSync(activitiesPath, 'utf8'), classesPath ? readFileSync(classesPath, 'utf8') : null, { log: (s) => console.log(s) });
console.log(`\nImportiert: ${report.events} Termine, ${report.breaks} Pausen.`);
recordImport(db, `Import Jugend: ${report.events} Termine, ${report.breaks} Pausen`);
if (report.warnings.length) {
	console.log(`\nHinweise:`);
	for (const w of report.warnings) console.log(`  - ${w}`);
}
