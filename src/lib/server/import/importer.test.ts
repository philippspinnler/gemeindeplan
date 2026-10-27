import ExcelJS from 'exceljs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { getHymnByNumber, listHymns } from '../hymns';
import { setBishopric } from '../bishopric';
import { listMembers, matchMember } from '../members';
import { loadMeetingFullByDate } from '../meetings';
import { importWorkbooks, type ImportReport } from './importer';

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
const dur = (min: number, sec: number) => new Date(Date.UTC(1899, 11, 30, 0, min, sec));

async function writeFixtures(dir: string) {
	const av = new ExcelJS.Workbook();
	const ml = av.addWorksheet('Mitgliederliste');
	ml.addRow(['Name Tools', 'Suchname', 'Inaktiv/Kind/weggezogen', 'Kommentar Ansprache', 'Kommentar Gebet']);
	ml.addRow(['Rey, Anna', 'Anna Rey', null, 'gerne kurz', null]);
	ml.addRow(['Achermann, Edith', 'Edith Achermann', 'x', null, 'will lieber nicht beten']);
	ml.addRow(['Dürst, HR-Daniel', 'HR-Daniel Dürst', null, null, null]);
	ml.addRow(['Widmer, Vreni', 'Vreni Widmer', null, null, null]);
	ml.addRow(['Bischof, Urs', 'Urs Bischof', null, null, null]);
	const pr = av.addWorksheet('Programm');
	pr.addRow([null, 'Liederplanung']);
	pr.addRow(['OK', 'Datum', 'Thema', 'Spezial', 'Abwesenheiten', 'Leitung', 'Gebet1', 'Gebet2', 'Nr 1', 'Anfangslied', 'Nr 2', 'Abendmahlslied', 'Ansprache 1', 'Thema 1', 'Ansprache 2', 'Thema 2', 'Nr 3', 'Zwischelied', 'Ansprache 3', 'Thema 3', 'Anpsrache 4', 'Thema 4', 'Nr. 4', 'Schlusslied', 'Orgel', 'Dirigieren']);
	pr.addRow([null, d(2026, 8, 30), 'Schwächen', null, 'Reto, Urs', 'Urs', 'Anna Rey', '-', 47, ' Herr und Gott der Himmelsheere', 61, ' Näher, mein Gott, zu dir', 'HR-Daniel Dürst', 'Glaube', 'Elder Neuer', null, 58, ' Führ, gütges Licht', 'Anna Rey', 'Rückfrage??', null, null, 33, ' Hört, ihr Geschöpfe all, frohlockt!', 'Vreni', 'Lea']);
	pr.addRow([null, d(2026, 10, 4), null, 'Generalkonferenz']);
	pr.addRow([null, d(2026, 10, 11), 'Gebet', 'Fastsonntag?', null, 'Urs', null, null, null, null, null, null, 'Anna Rey', 'Confirm', 'Unbekannt Neu', 'Einladen']);
	pr.addRow([null, 'kein Datum']);
	const avHymns = av.addWorksheet('Lieder');
	avHymns.addRow([33, ' Hört, ihr Geschöpfe all, frohlockt!']);
	avHymns.addRow([47, ' Herr und Gott der Himmelsheere']);
	await av.xlsx.writeFile(path.join(dir, 'av.xlsx'));

	const lp = new ExcelJS.Workbook();
	const lieder = lp.addWorksheet('Lieder');
	lieder.addRow([47, ' Herr und Gott der Himmelsheere', dur(3, 30)]);
	lieder.addRow([61, ' Näher, mein Gott, zu dir', null]);
	lieder.addRow([58, ' Führ, gütges Licht', null]);
	lieder.addRow([1019, 'Hilf mir, zu lieben, Herr, wie du', dur(2, 28)]);
	const lav = lp.addWorksheet('Lieder AV');
	lav.addRow([14]);
	lav.addRow(['', 'Spezial', 'Thema Abendmahlsversammlung', 'ZEIT', 'mm:ss', 'Nr 1', 'Anfangslied', 'mm:ss', 'Nr 2', 'Abendmahlslied', 'mm:ss', 'Nr 3', 'Zwischenlied', 'mm:ss', 'Nr. 4', 'Schlusslied', 'Orgel/Klavier', 'Dirigieren', 'Abwesenheit']);
	lav.addRow([d(2026, 8, 30), null, 'Schwächen', null, null, 47, ' Herr und Gott', null, 61, ' Näher', null, 58, ' Führ', null, 33, ' Hört', 'Vreni', 'Lea', 'Mia']);
	lav.addRow([d(2026, 10, 11), 'Fastsonntag', null, null, null, 1019, 'Hilf mir, zu lieben, Herr, wie du', null, null, null, null, null, 'PV singt', null, null, null, 'Vreni', null, null]);
	lav.addRow([d(2026, 10, 18), null, 'Nur Musik geplant', null, null, 47, ' Herr und Gott', null, null, null, null, null, null, null, null, null, 'Fritz', 'Trudi']);
	await lp.xlsx.writeFile(path.join(dir, 'lieder.xlsx'));
}

let dir: string;
let db: Db;
let report: ImportReport;

beforeAll(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-import-'));
	await writeFixtures(dir);
	db = createDb(':memory:');
	report = await importWorkbooks(db, path.join(dir, 'av.xlsx'), path.join(dir, 'lieder.xlsx'), { today: '2026-09-07' });
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('importWorkbooks', () => {
	it('imports members with flags, notes and affiliation', () => {
		const anna = matchMember(listMembers(db), 'Anna Rey')!;
		expect(anna.active).toBe(true);
		expect(anna.noteTalk).toBe('gerne kurz');
		const edith = matchMember(listMembers(db), 'Edith Achermann')!;
		expect(edith.active).toBe(false);
		expect(edith.notePrayer).toBe('will lieber nicht beten');
		const daniel = matchMember(listMembers(db), 'Daniel Dürst')!;
		expect(daniel.kind).toBe('pfahl');
		expect(daniel.calling).toBe('Hoherat');
		expect(daniel.affiliation).toBeNull();
	});
	it('creates unknown speakers and reports them', () => {
		const elder = matchMember(listMembers(db), 'Elder Neuer')!;
		expect(elder.affiliation).toBe('Missionar');
		expect(elder.active).toBe(true);
		const unknown = matchMember(listMembers(db), 'Unbekannt Neu')!;
		expect(unknown.active).toBe(false);
		expect(report.unresolved).toEqual(expect.arrayContaining(['Elder Neuer', 'Unbekannt Neu']));
		expect(listMembers(db)).toHaveLength(7);
	});
	it('imports hymns from both files with duration', () => {
		expect(listHymns(db).map((h) => h.number)).toEqual([33, 47, 58, 61, 1019]);
		expect(getHymnByNumber(db, 47)?.durationSeconds).toBe(210);
		expect(getHymnByNumber(db, 47)?.title).toBe('Herr und Gott der Himmelsheere');
		expect(getHymnByNumber(db, 1019)?.book).toBe('neu');
	});
	it('imports a past Sunday completely', () => {
		const m = loadMeetingFullByDate(db, '2026-08-30')!;
		expect(m.meeting.kind).toBe('normal');
		expect(m.meeting.theme).toBe('Schwächen');
		// No bishopric is set yet, so no name can be assigned.
		expect(m.meeting.absences).toBeNull();
		expect(m.presiding?.firstName).toBe('Urs');
		expect(m.prayers).toHaveLength(1);
		expect(m.prayers[0].member?.firstName).toBe('Anna');
		expect(m.talks.map((t) => [t.position, t.member?.lastName, t.confirmed])).toEqual([
			[1, 'Dürst', true],
			[2, 'Neuer', true],
			[3, 'Rey', true]
		]);
		expect(m.hymns.anfang.hymn?.number).toBe(47);
		expect(m.hymns.abendmahl.hymn?.number).toBe(61);
		expect(m.hymns.zwischen.hymn?.number).toBe(58);
		expect(m.hymns.schluss.hymn?.number).toBe(33);
		expect(m.organist?.firstName).toBe('Vreni');
		expect(m.conductor).toBeNull();
		expect(m.meeting.musicNote).toContain('Dirigieren: Lea');
		expect(m.meeting.musicNote).toContain('Mia');
	});
	it('marks future talks unconfirmed and sets the type', () => {
		const f = loadMeetingFullByDate(db, '2026-10-11')!;
		expect(f.meeting.kind).toBe('fastsonntag');
		expect(f.meeting.specialNote).toBeNull();
		expect(f.talks.map((t) => [t.member?.lastName, t.confirmed])).toEqual([['Rey', false], ['Neu', false]]);
		expect(f.hymns.anfang.hymn?.number).toBe(1019);
		// Fast Sunday: no intermediate hymn even if the source names one ("PV singt")
		expect(f.hymns.zwischen).toEqual({ hymn: null, freeText: null });
		expect(f.organist?.firstName).toBe('Vreni');
		expect(loadMeetingFullByDate(db, '2026-10-04')!.meeting.kind).toBe('generalkonferenz');
	});
	it('creates Sundays that exist only in the hymn planning, and counts them', () => {
		const only = loadMeetingFullByDate(db, '2026-10-18')!;
		expect(only.hymns.anfang.hymn?.number).toBe(47);
		expect(only.meeting.theme).toBe('Nur Musik geplant');
		expect(report.meetings).toBe(4);
		expect(report.hymns).toBe(5);
		expect(report.members).toBe(5);
	});
	it('is idempotent', async () => {
		const musicNoteBefore = loadMeetingFullByDate(db, '2026-10-18')!.meeting.musicNote;
		const again = await importWorkbooks(db, path.join(dir, 'av.xlsx'), path.join(dir, 'lieder.xlsx'), { today: '2026-09-07' });
		expect(again.members).toBe(0);
		expect(again.hymns).toBe(0);
		expect(again.meetings).toBe(0);
		expect(listMembers(db)).toHaveLength(7);
		expect(loadMeetingFullByDate(db, '2026-08-30')!.talks).toHaveLength(3);
		expect(loadMeetingFullByDate(db, '2026-10-18')!.meeting.musicNote).toBe(musicNoteBefore);
	});
});

describe('importWorkbooks absences', () => {
	it('keeps only names that match the bishopric', async () => {
		const urs = matchMember(listMembers(db), 'Urs Bischof')!;
		setBishopric(db, [{ id: urs.id, role: 'bischof' }]);
		await importWorkbooks(db, path.join(dir, 'av.xlsx'), path.join(dir, 'lieder.xlsx'), { today: '2026-09-07' });
		expect(loadMeetingFullByDate(db, '2026-08-30')!.meeting.absences).toBe(`ids:${urs.id}`);
	});
});
