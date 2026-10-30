import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChangeRef } from './change-sections';
import { formatAbsences, getBishopric, setBishopricMember } from './bishopric';
import { listChanges, recordChanges, recordImport, resetChange } from './changes';
import { createDb, type Db } from './db';
import { changes, users, type Role } from './db/schema';
import { UserError } from './forms';
import { createMember, updateMember } from './members';
import { getMusicCallings, setMusicCalling } from './music-callings';
import { setSetting } from './settings';
import { createStakeCalling, deleteStakeCalling, listStakeCallings } from './stake-callings';
import { listLeaders, setLeaders } from './youth-people';
import { createMeeting, loadMeetingFullByDate, saveConductor, saveGeneral, savePrayers } from './meetings';
import { GUARDED, requestScope } from './recording';
import { ensureYouthEvents, loadYouthEvent, saveYouthCommon, saveYouthPart } from './youth';
import { createBreak, deleteBreak, getBreak, updateBreak } from './youth-breaks';
import { createIdea, dismissIdea } from './youth-ideas';

let db: Db;
let meetingId: number;
let anna: number;
let max: number;
const date = '2026-11-01';
const t0 = new Date('2026-10-30T18:00:00Z');
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);
const programm: ChangeRef = { section: 'sonntag.programm', key: date };
const gebete: ChangeRef = { section: 'sonntag.gebete', key: date };

const addUser = (name: string, role: Role) =>
	db.insert(users).values({ email: `${name.toLowerCase()}@example.test`, name, role, passwordHash: 'x' }).returning().get();
const general = (theme: string | null) =>
	saveGeneral(db, meetingId, { kind: 'normal', theme, specialNote: null, presidingMemberId: null, absences: null });
const setTheme = (userId: number, theme: string, at: Date) => recordChanges(db, userId, [programm], () => general(theme), at);
const setPrayer = (userId: number, memberId: number | null, at: Date) =>
	recordChanges(db, userId, [gebete], () => savePrayers(db, meetingId, [{ position: 2, memberId }]), at);
const rows = () => db.select().from(changes).all();
const theme = () => loadMeetingFullByDate(db, date)!.meeting.theme;

let u1: number;
let u2: number;

beforeEach(() => {
	db = createDb(':memory:');
	meetingId = createMeeting(db, date).id;
	anna = createMember(db, { firstName: 'Anna', lastName: 'Muster' }).id;
	max = createMember(db, { firstName: 'Max', lastName: 'Test' }).id;
	u1 = addUser('Eva', 'admin').id;
	u2 = addUser('Tim', 'bischofschaft').id;
});

describe('recording', () => {
	it('logs one entry per changed section', () => {
		recordChanges(db, u1, [programm, gebete], () => {
			general('Glaube');
			savePrayers(db, meetingId, []);
		}, t0);
		expect(rows().map((r) => r.section)).toEqual(['sonntag.programm']);
	});

	it('writes nothing when nothing changed', () => {
		recordChanges(db, u1, [programm, gebete], () => general(null), t0);
		expect(rows()).toEqual([]);
	});

	it('rolls back data and entry when the save throws', () => {
		expect(() =>
			recordChanges(db, u1, [programm], () => {
				general('Glaube');
				throw new UserError('kaputt');
			}, t0)
		).toThrow('kaputt');
		expect(theme()).toBeNull();
		expect(rows()).toEqual([]);
	});

	it("merges the same user's saves within 5 minutes", () => {
		setTheme(u1, 'A', t0);
		setTheme(u1, 'B', minutes(4));
		expect(rows()).toHaveLength(1);
		expect(JSON.parse(rows()[0].before!).theme).toBeNull();
		expect(JSON.parse(rows()[0].after!).theme).toBe('B');
		setTheme(u1, 'C', minutes(10));
		expect(rows()).toHaveLength(2);
	});

	it("does not merge across another user's save", () => {
		setTheme(u1, 'A', t0);
		setTheme(u2, 'B', minutes(1));
		setTheme(u1, 'C', minutes(2));
		expect(rows()).toHaveLength(3);
	});

	it('drops a merged entry that ends where it started', () => {
		general('A');
		setTheme(u1, 'B', t0);
		setTheme(u1, 'A', minutes(1));
		expect(rows()).toEqual([]);
	});

	it('does not merge across a change the log did not see', () => {
		setTheme(u1, 'A', t0);
		general('B');
		setTheme(u1, 'C', minutes(1));
		expect(rows()).toHaveLength(2);
	});

	it('prunes entries older than 90 days', () => {
		setTheme(u1, 'A', new Date(t0.getTime() - 91 * 86_400_000));
		setTheme(u1, 'B', t0);
		expect(rows()).toHaveLength(1);
		expect(rows()[0].at).toBe(t0.toISOString());
	});
});

describe('listing', () => {
	it('describes changes with names', () => {
		setPrayer(u1, max, t0);
		expect(listChanges(db, 'admin')[0].lines).toEqual(['Schlussgebet: – → Max Test']);
	});

	it('names a single absent bishopric member', () => {
		recordChanges(db, u1, [programm], () => saveGeneral(db, meetingId, { kind: 'normal', theme: null, specialNote: null, presidingMemberId: null, absences: formatAbsences([max]) }), t0);
		expect(listChanges(db, 'admin')[0].lines).toEqual(['Abwesend: – → Max Test']);
	});

	it("shows entries only to roles with the section's permission", () => {
		setPrayer(u1, max, t0);
		recordChanges(db, u1, [{ section: 'sonntag.leitung', key: date }], () => saveConductor(db, meetingId, anna), t0);
		expect(listChanges(db, 'dirigent').map((c) => c.section)).toEqual(['sonntag.leitung']);
		expect(listChanges(db, 'gebete').map((c) => c.section)).toEqual(['sonntag.gebete']);
	});

	it('lists the newest entry first with a readable user name and target link', () => {
		setPrayer(u1, max, t0);
		setTheme(u2, 'Glaube', minutes(1));
		const [first, second] = listChanges(db, 'admin');
		expect(first.section).toBe('sonntag.programm');
		expect(first.userName).toBe('Tim');
		expect(first.target.href).toBe('/sonntag/2026-11-01');
		expect(second.userName).toBe('Eva');
	});
});

describe('reset', () => {
	it('resets a section to the state before the entry', () => {
		setPrayer(u1, max, t0);
		const [entry] = listChanges(db, 'admin');
		expect(resetChange(db, { id: u2, role: 'bischofschaft' }, entry.id, false, minutes(1))).toEqual({ ok: true });
		expect(loadMeetingFullByDate(db, date)!.prayers.find((p) => p.position === 2)?.member ?? null).toBeNull();
		expect(rows()).toHaveLength(2);
	});

	it('asks before overwriting a newer change', () => {
		setPrayer(u1, max, t0);
		const [entry] = listChanges(db, 'admin');
		setPrayer(u2, anna, minutes(1));
		const result = resetChange(db, { id: u1, role: 'admin' }, entry.id, false, minutes(2));
		expect(result).toEqual({ conflict: { name: 'Tim', at: minutes(1).toISOString() } });
		expect(loadMeetingFullByDate(db, date)!.prayers.find((p) => p.position === 2)?.member?.id).toBe(anna);
		expect(resetChange(db, { id: u1, role: 'admin' }, entry.id, true, minutes(3))).toEqual({ ok: true });
		expect(loadMeetingFullByDate(db, date)!.prayers.find((p) => p.position === 2)?.member ?? null).toBeNull();
	});

	it('refuses reset without permission', () => {
		setPrayer(u1, max, t0);
		const [entry] = listChanges(db, 'admin');
		expect(() => resetChange(db, { id: u2, role: 'musik' }, entry.id, false, minutes(1))).toThrow(UserError);
	});
});

describe('guard', () => {
	it('throws for a write in a request scope outside recordChanges', () => {
		expect(() => requestScope(() => savePrayers(db, meetingId, []))).toThrow();
		expect(() => requestScope(() => recordChanges(db, u1, [gebete], () => savePrayers(db, meetingId, [])))).not.toThrow();
		expect(() => savePrayers(db, meetingId, [])).not.toThrow();
	});
});

describe('youth sections', () => {
	const wed = '2026-11-04';
	const ref = (section: ChangeRef['section']): ChangeRef => ({ section, key: wed });
	const eventId = () => loadYouthEvent(db, wed)!.event.id;
	const none = { leaderMemberId: null, leaderGroup: null };
	const common = (joint: boolean) =>
		saveYouthCommon(db, eventId(), { kind: joint ? 'gemeinsam_jd' : 'aktivitaet', joint, details: null, topic: null, topicUrl: null, snack: null });
	const parts = () => Object.fromEntries(loadYouthEvent(db, wed)!.parts.map((p) => [p.side, p.text]));

	beforeEach(() => {
		ensureYouthEvents(db, '2026-11-01', 1);
		recordChanges(db, u1, [ref('jugend.jd'), ref('jugend.jm')], () => {
			saveYouthPart(db, eventId(), 'jd', { ...none, text: 'Velotour' });
			saveYouthPart(db, eventId(), 'jm', { ...none, text: 'Fussball' });
		}, t0);
	});

	it('undoing a joint toggle restores both sides', () => {
		recordChanges(db, u1, [ref('jugend.gemeinsam')], () => common(true), minutes(10));
		expect(parts()).toEqual({ both: 'Velotour\nFussball' });
		const entry = listChanges(db, 'admin', { sections: ['jugend.gemeinsam'] })[0];
		expect(resetChange(db, { id: u2, role: 'bischofschaft' }, entry.id, false, minutes(11))).toEqual({ ok: true });
		expect(loadYouthEvent(db, wed)!.event.joint).toBe(false);
		expect(parts()).toEqual({ jd: 'Velotour', jm: 'Fussball' });
	});

	it('a part edit after the toggle makes the reset ask first', () => {
		recordChanges(db, u1, [ref('jugend.gemeinsam')], () => common(true), minutes(10));
		const entry = listChanges(db, 'admin', { sections: ['jugend.gemeinsam'] })[0];
		recordChanges(db, u2, [ref('jugend.beide')], () => saveYouthPart(db, eventId(), 'both', { ...none, text: 'Grillen' }), minutes(11));
		expect(resetChange(db, { id: u1, role: 'admin' }, entry.id, false, minutes(12))).toHaveProperty('conflict');
	});

	it('JD leaders see JD but not JM entries', () => {
		const sections = listChanges(db, 'jd_leitung').map((c) => c.section);
		expect(sections).toContain('jugend.jd');
		expect(sections).not.toContain('jugend.jm');
	});

	it('describes a part change', () => {
		expect(listChanges(db, 'admin', { sections: ['jugend.jd'] })[0].lines).toEqual(['Aktivität: – → Velotour']);
	});

	const breakInput = { fromDate: '2026-12-20', toDate: '2027-01-03', label: 'Weihnachten', kind: 'ferien' as const };
	const makeBreak = () => {
		let id = 0;
		recordChanges(db, u1, [], (created) => {
			id = createBreak(db, breakInput).id;
			created({ section: 'ausfall', key: String(id) });
		}, t0);
		return id;
	};
	const breakEntries = () => listChanges(db, 'admin', { sections: ['ausfall'] });

	it('a deleted break comes back with the same id', () => {
		const id = makeBreak();
		recordChanges(db, u1, [{ section: 'ausfall', key: String(id) }], () => updateBreak(db, id, { ...breakInput, label: 'Winterferien' }), minutes(10));
		recordChanges(db, u1, [{ section: 'ausfall', key: String(id) }], () => deleteBreak(db, id), minutes(20));
		expect(getBreak(db, id)).toBeUndefined();
		const [deleted] = breakEntries();
		expect(resetChange(db, { id: u2, role: 'bischofschaft' }, deleted.id, false, minutes(21))).toEqual({ ok: true });
		expect(getBreak(db, id)?.label).toBe('Winterferien');
	});

	it('resetting a created break deletes it', () => {
		const id = makeBreak();
		const [created] = breakEntries();
		expect(created.resettable).toBe(true);
		resetChange(db, { id: u2, role: 'bischofschaft' }, created.id, false, minutes(10));
		expect(getBreak(db, id)).toBeUndefined();
	});

	it('a reset of a changed-then-deleted break asks first', () => {
		const id = makeBreak();
		recordChanges(db, u1, [{ section: 'ausfall', key: String(id) }], () => updateBreak(db, id, { ...breakInput, label: 'Winterferien' }), minutes(10));
		const update = breakEntries()[0];
		recordChanges(db, u2, [{ section: 'ausfall', key: String(id) }], () => deleteBreak(db, id), minutes(11));
		expect(resetChange(db, { id: u1, role: 'admin' }, update.id, false, minutes(12))).toHaveProperty('conflict');
		resetChange(db, { id: u1, role: 'admin' }, update.id, true, minutes(13));
		expect(getBreak(db, id)?.label).toBe('Weihnachten');
	});

	it('a created idea is not resettable, its dismissal is', () => {
		let id = 0;
		recordChanges(db, u1, [], (created) => {
			id = createIdea(db, { text: 'Bowling', side: 'jm', note: null, createdBy: u1 }).id;
			created({ section: 'idee', key: String(id) });
		}, t0);
		recordChanges(db, u1, [{ section: 'idee', key: String(id) }], () => dismissIdea(db, id), minutes(10));
		expect(listChanges(db, 'admin', { sections: ['idee'] }).map((c) => c.resettable)).toEqual([true, false]);
	});
});

describe('master data', () => {
	const ref = (section: ChangeRef['section'], key: string | number = ''): ChangeRef => ({ section, key: String(key) });

	it('member notes are their own sections', () => {
		recordChanges(db, u1, [ref('mitglied', anna), ref('notiz.ansprache', anna)], () => updateMember(db, anna, { noteTalk: 'Im Dezember' }), t0);
		expect(rows().map((r) => r.section)).toEqual(['notiz.ansprache']);
		expect(listChanges(db, 'bischofschaft').map((c) => c.section)).toEqual(['notiz.ansprache']);
		expect(listChanges(db, 'jm_berater')).toEqual([]);
		recordChanges(db, u1, [ref('mitglied', anna), ref('notiz.ansprache', anna)], () => updateMember(db, anna, { firstName: 'Annina' }), minutes(10));
		expect(listChanges(db, 'admin').map((c) => c.section)).toContain('mitglied');
		expect(listChanges(db, 'bischofschaft').map((c) => c.section)).not.toContain('mitglied');
	});

	it('the youth page token is logged without its value', () => {
		setSetting(db, 'youth_page_token', 'alt-geheim');
		recordChanges(db, u1, [ref('jugendseite')], () => setSetting(db, 'youth_page_token', 'neu-geheim'), t0);
		const [entry] = listChanges(db, 'admin');
		expect(entry.lines).toEqual(['Link neu erzeugt']);
		expect(entry.resettable).toBe(false);
		expect(JSON.stringify(rows())).not.toMatch(/geheim/);
	});

	it('a deleted stake calling comes back with the same id', () => {
		const calling = createStakeCalling(db, 'Hoher Rat');
		recordChanges(db, u1, [ref('pfahlbeamte', calling.id)], () => deleteStakeCalling(db, calling.id), t0);
		const [entry] = listChanges(db, 'admin');
		resetChange(db, { id: u2, role: 'admin' }, entry.id, false, minutes(1));
		expect(listStakeCallings(db).find((c) => c.id === calling.id)).toEqual(calling);
	});

	it('callings reset restores bishopric, music callings and leaders together', () => {
		recordChanges(db, u1, [ref('berufungen')], () => {
			setBishopricMember(db, 'bischof', max);
			setMusicCalling(db, 'organist', [anna]);
			setLeaders(db, 'jm_berater', [max]);
		}, t0);
		const [entry] = listChanges(db, 'admin');
		expect(entry.lines).toEqual(['Bischof: – → Max Test', 'Orgel / Klavier: – → Anna Muster', 'JM-Berater: – → Max Test']);
		resetChange(db, { id: u2, role: 'admin' }, entry.id, false, minutes(1));
		expect(getBishopric(db)).toEqual([]);
		expect(getMusicCallings(db).organist).toEqual([]);
		expect(listLeaders(db)).toEqual([]);
	});

	it('an import entry has no user and cannot be reset', () => {
		recordImport(db, 'Mitglieder aus Tabelle: 12 neu', t0);
		const [entry] = listChanges(db, 'admin');
		expect(entry).toMatchObject({ userName: null, lines: ['Mitglieder aus Tabelle: 12 neu'], resettable: false });
		expect(listChanges(db, 'bischofschaft')).toEqual([]);
	});
});

describe('routes', () => {
	it('every route that imports a guarded write function also imports recordChanges', () => {
		const files = readdirSync('src/routes', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.server.ts')).map((f) => join('src/routes', f));
		const missing = files.filter((f) => {
			const imports = [...readFileSync(f, 'utf8').matchAll(/import\s*\{([^}]*)\}/g)].flatMap((m) => m[1].split(',').map((x) => x.trim()));
			return imports.some((x) => GUARDED.includes(x)) && !imports.includes('recordChanges');
		});
		expect(missing).toEqual([]);
	});
});
