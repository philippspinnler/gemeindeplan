import ExcelJS from 'exceljs';
import { isSunday } from '../../dates';
import { splitFullName, splitListName } from '../../names';
import type { Db } from '../db';
import { HYMN_SLOTS, type HymnSlot, type Member } from '../db/schema';
import { formatAbsences, getBishopricIds } from '../bishopric';
import { createHymn, getHymnByNumber, updateHymn } from '../hymns';
import { createMember, listMembers, matchByFirstName, matchMember, stakeFromAffiliation, updateMember } from '../members';
import { ensureStakeCalling } from '../stake-callings';
import { createMeeting, getMeetingByDate, loadMeetingFullByDate, saveGeneral, saveMusic, savePrayers, saveTalks, type TalkInput } from '../meetings';
import { cellDateIso, cellNumber, cellSeconds, cellText, isIgnoredToken, parseSpecial, parseTalk } from './parse';

export interface ImportReport { members: number; hymns: number; meetings: number; unresolved: string[]; warnings: string[] }
type Row = ExcelJS.Row;
type SlotInput = Record<HymnSlot, { hymnNumber: number | null; freeText: string | null }>;

const val = (row: Row, col: number): unknown => row.getCell(col).value;
const txt = (row: Row, col: number): string => cellText(val(row, col));
const emptySlots = (): SlotInput => ({ anfang: { hymnNumber: null, freeText: null }, abendmahl: { hymnNumber: null, freeText: null }, zwischen: { hymnNumber: null, freeText: null }, schluss: { hymnNumber: null, freeText: null } });

class MemberResolver {
	private all: Member[];
	constructor(private db: Db, private report: ImportReport) {
		this.all = listMembers(db);
	}
	resolve(raw: string): Member | null {
		if (isIgnoredToken(raw)) return null;
		const hit = matchMember(this.all, raw);
		if (hit) return hit;
		const { firstName, lastName, affiliation } = splitFullName(raw);
		if (!firstName) return null;
		const stake = stakeFromAffiliation(affiliation);
		const created = createMember(this.db, {
			firstName,
			lastName,
			affiliation: stake.kind === 'pfahl' ? null : affiliation,
			kind: stake.kind,
			stakeCallingId: stake.callingName ? ensureStakeCalling(this.db, stake.callingName).id : null,
			active: affiliation !== null
		});
		this.all.push(created);
		this.report.unresolved.push(raw.trim());
		return created;
	}
	resolveFirst(raw: string): Member | null {
		if (isIgnoredToken(raw)) return null;
		return matchMember(this.all, raw) ?? matchByFirstName(this.all, raw);
	}
}

function importMembers(db: Db, ws: ExcelJS.Worksheet | undefined, report: ImportReport): void {
	if (!ws) { report.warnings.push('Blatt Mitgliederliste fehlt'); return; }
	const all = listMembers(db);
	ws.eachRow((row, n) => {
		if (n < 2) return;
		const raw = txt(row, 1) || txt(row, 2);
		if (!raw) return;
		const { firstName, lastName, affiliation } = splitListName(raw);
		const active = txt(row, 3) === '';
		const noteTalk = txt(row, 4) || null;
		const notePrayer = txt(row, 5) || null;
		const existing = matchMember(all, `${firstName} ${lastName}`);
		if (existing) {
			const stake = stakeFromAffiliation(affiliation);
			updateMember(db, existing.id, {
				active,
				noteTalk,
				notePrayer,
				...(stake.kind === 'pfahl'
					? { kind: 'pfahl' as const, stakeCallingId: stake.callingName ? ensureStakeCalling(db, stake.callingName).id : null, affiliation: null }
					: { affiliation: affiliation ?? existing.affiliation })
			});
		} else {
			const stake = stakeFromAffiliation(affiliation);
			all.push(
				createMember(db, {
					firstName,
					lastName,
					affiliation: stake.kind === 'pfahl' ? null : affiliation,
					kind: stake.kind,
					stakeCallingId: stake.callingName ? ensureStakeCalling(db, stake.callingName).id : null,
					active,
					noteTalk,
					notePrayer
				})
			);
			report.members++;
		}
	});
}

function importHymns(db: Db, ws: ExcelJS.Worksheet | undefined, report: ImportReport): void {
	if (!ws) { report.warnings.push('Blatt Lieder fehlt'); return; }
	ws.eachRow((row) => {
		const number = cellNumber(val(row, 1));
		const title = txt(row, 2);
		if (!number || !title) return;
		const seconds = cellSeconds(val(row, 3));
		const existing = getHymnByNumber(db, number);
		if (existing) {
			if (seconds && !existing.durationSeconds) updateHymn(db, existing.id, { title: existing.title, durationSeconds: seconds });
			return;
		}
		createHymn(db, { number, title, durationSeconds: seconds });
		report.hymns++;
	});
}

function hymnSlot(db: Db, numberCell: unknown, titleCell: unknown, slot: HymnSlot, report: ImportReport, date: string): { hymnNumber: number | null; freeText: string | null } {
	const number = cellNumber(numberCell);
	const title = cellText(titleCell);
	if (number) {
		if (!getHymnByNumber(db, number)) {
			if (title && !isIgnoredToken(title)) { createHymn(db, { number, title }); report.hymns++; }
			else { report.warnings.push(`${date}: Lied ${number} unbekannt, kein Titel`); return { hymnNumber: null, freeText: null }; }
		}
		return { hymnNumber: number, freeText: null };
	}
	if (slot === 'zwischen' && title && !isIgnoredToken(title)) return { hymnNumber: null, freeText: title };
	return { hymnNumber: null, freeText: null };
}

function musicPeople(resolver: MemberResolver, organistRaw: string, conductorRaw: string): { organistId: number | null; conductorId: number | null; notes: string[] } {
	const notes: string[] = [];
	const pick = (raw: string, label: string) => {
		if (isIgnoredToken(raw)) return null;
		const m = resolver.resolveFirst(raw);
		if (!m) notes.push(`${label}: ${raw.trim()}`);
		return m?.id ?? null;
	};
	return { organistId: pick(organistRaw, 'Orgel'), conductorId: pick(conductorRaw, 'Dirigieren'), notes };
}

function ensureMeeting(db: Db, date: string, report: ImportReport): number {
	const existing = getMeetingByDate(db, date);
	if (existing) return existing.id;
	report.meetings++;
	return createMeeting(db, date).id;
}

function importProgram(db: Db, ws: ExcelJS.Worksheet | undefined, resolver: MemberResolver, today: string, report: ImportReport): void {
	if (!ws) { report.warnings.push('Blatt Programm fehlt'); return; }
	const bishopricIds = getBishopricIds(db);
	const bishopric = listMembers(db).filter((m) => bishopricIds.includes(m.id));
	ws.eachRow((row, n) => {
		if (n < 3) return;
		const date = cellDateIso(val(row, 2));
		if (!date) return;
		if (!isSunday(date)) { report.warnings.push(`Programm Zeile ${n}: ${date} ist kein Sonntag`); return; }
		const isPast = date <= today;
		const id = ensureMeeting(db, date, report);
		const spezial = parseSpecial(txt(row, 4));
		saveGeneral(db, id, {
			kind: spezial.kind,
			theme: txt(row, 3) || null,
			specialNote: spezial.note,
			presidingMemberId: resolver.resolveFirst(txt(row, 6))?.id ?? null,
			// Names that match no bishopric member are dropped and filled in by hand.
			absences: formatAbsences(txt(row, 5).split(/,|\bund\b/).flatMap((name) => matchByFirstName(bishopric, name.trim())?.id ?? []))
		});
		const prayers = [7, 8]
			.map((col, i) => ({ position: i + 1, memberId: resolver.resolve(txt(row, col))?.id ?? null }))
			.filter((p) => p.memberId !== null);
		savePrayers(db, id, prayers);
		const talks: TalkInput[] = [];
		[[13, 14], [15, 16], [19, 20], [21, 22]].forEach(([nameCol, topicCol], i) => {
			const t = parseTalk(txt(row, nameCol), txt(row, topicCol), isPast);
			if (!t.name) return;
			const member = resolver.resolve(t.name);
			if (!member) return;
			talks.push({ position: i + 1, memberId: member.id, durationMinutes: t.durationMinutes, confirmed: t.confirmed });
		});
		saveTalks(db, id, talks);
		const slots = emptySlots();
		slots.anfang = hymnSlot(db, val(row, 9), val(row, 10), 'anfang', report, date);
		slots.abendmahl = hymnSlot(db, val(row, 11), val(row, 12), 'abendmahl', report, date);
		slots.zwischen = hymnSlot(db, val(row, 17), val(row, 18), 'zwischen', report, date);
		slots.schluss = hymnSlot(db, val(row, 23), val(row, 24), 'schluss', report, date);
		const people = musicPeople(resolver, txt(row, 25), txt(row, 26));
		saveMusic(db, id, { hymns: slots, organistMemberId: people.organistId, conductorMemberId: people.conductorId, musicNote: people.notes.join('; ') || null });
	});
}

function importHymnPlanning(db: Db, ws: ExcelJS.Worksheet | undefined, resolver: MemberResolver, report: ImportReport): void {
	if (!ws) { report.warnings.push('Blatt Lieder AV fehlt'); return; }
	ws.eachRow((row, n) => {
		if (n < 3) return;
		const date = cellDateIso(val(row, 1));
		if (!date || !isSunday(date)) return;
		const cols: Record<HymnSlot, [number, number]> = { anfang: [6, 7], abendmahl: [9, 10], zwischen: [12, 13], schluss: [15, 16] };
		const hasAny = HYMN_SLOTS.some((s) => cellNumber(val(row, cols[s][0])) || (s === 'zwischen' && txt(row, 13) && !isIgnoredToken(txt(row, 13))));
		let full = loadMeetingFullByDate(db, date);
		if (!full) {
			if (!hasAny) return;
			ensureMeeting(db, date, report);
			full = loadMeetingFullByDate(db, date)!;
		}
		const spezial = parseSpecial(txt(row, 2));
		const theme = txt(row, 3) || null;
		if ((full.meeting.kind === 'normal' && spezial.kind !== 'normal') || (!full.meeting.theme && theme) || (!full.meeting.specialNote && spezial.note)) {
			saveGeneral(db, full.meeting.id, {
				kind: full.meeting.kind === 'normal' ? spezial.kind : full.meeting.kind,
				theme: full.meeting.theme ?? theme,
				specialNote: full.meeting.specialNote ?? spezial.note,
				presidingMemberId: full.meeting.presidingMemberId,
				absences: full.meeting.absences
			});
		}
		const slots = emptySlots();
		for (const slot of HYMN_SLOTS) {
			const current = full.hymns[slot];
			if (current.hymn) slots[slot] = { hymnNumber: current.hymn.number, freeText: null };
			else if (current.freeText) slots[slot] = { hymnNumber: null, freeText: current.freeText };
			else slots[slot] = hymnSlot(db, val(row, cols[slot][0]), val(row, cols[slot][1]), slot, report, date);
		}
		const people = musicPeople(resolver, full.organist ? '' : txt(row, 17), full.conductor ? '' : txt(row, 18));
		const existing = (full.meeting.musicNote ?? '').split(/;\s*/).filter(Boolean);
		const notes = [...existing, ...people.notes, txt(row, 19) ? `Abwesend: ${txt(row, 19)}` : ''].filter(Boolean);
		saveMusic(db, full.meeting.id, {
			hymns: slots,
			organistMemberId: full.organist?.id ?? people.organistId,
			conductorMemberId: full.conductor?.id ?? people.conductorId,
			musicNote: [...new Set(notes)].join('; ') || null
		});
	});
}

export async function importWorkbooks(
	db: Db,
	avPath: string,
	liederPath: string,
	opts: { today: string; log?: (s: string) => void }
): Promise<ImportReport> {
	const log = opts.log ?? (() => {});
	const report: ImportReport = { members: 0, hymns: 0, meetings: 0, unresolved: [], warnings: [] };
	const av = new ExcelJS.Workbook();
	await av.xlsx.readFile(avPath);
	const lp = new ExcelJS.Workbook();
	await lp.xlsx.readFile(liederPath);

	log('Mitglieder …');
	importMembers(db, av.getWorksheet('Mitgliederliste'), report);
	log('Lieder …');
	importHymns(db, lp.getWorksheet('Lieder'), report);
	importHymns(db, av.getWorksheet('Lieder'), report);
	const resolver = new MemberResolver(db, report);
	log('Programm …');
	importProgram(db, av.getWorksheet('Programm'), resolver, opts.today, report);
	log('Liederplanung …');
	importHymnPlanning(db, lp.getWorksheet('Lieder AV'), resolver, report);
	report.unresolved = [...new Set(report.unresolved)].sort((a, b) => a.localeCompare(b, 'de'));
	return report;
}
