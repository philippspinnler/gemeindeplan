import { todayIso } from '../src/lib/dates';
import { createDb } from '../src/lib/server/db';
import { recordImport } from '../src/lib/server/changes';
import { importWorkbooks } from '../src/lib/server/import/importer';

const [avPath, liederPath] = process.argv.slice(2);
if (!avPath || !liederPath) {
	console.error('Aufruf: npm run import -- <av-programm.xlsx> <liederplanung.xlsx>');
	process.exit(1);
}
const db = createDb(process.env.DATABASE_PATH ?? 'data/app.db');
const report = await importWorkbooks(db, avPath, liederPath, { today: todayIso(), log: (s) => console.log(s) });
console.log(`\nNeu angelegt: ${report.members} Personen, ${report.hymns} Lieder, ${report.meetings} Sonntage.`);
recordImport(db, `Import Programm/Lieder: ${report.members} Personen, ${report.hymns} Lieder, ${report.meetings} Sonntage neu`);
if (report.unresolved.length) {
	console.log(`\nNeu angelegte Personen aus Programmzeilen (bitte unter "Personen" prüfen, ggf. aktivieren oder Zugehörigkeit setzen):`);
	for (const n of report.unresolved) console.log(`  - ${n}`);
}
if (report.warnings.length) {
	console.log(`\nHinweise:`);
	for (const w of report.warnings) console.log(`  - ${w}`);
}
