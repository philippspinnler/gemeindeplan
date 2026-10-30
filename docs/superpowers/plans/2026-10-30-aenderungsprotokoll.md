# Änderungsprotokoll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every change made through the app is logged per data section (who, when, before/after) and can be reset to an earlier state, shown per Sunday/youth date and in an overall list.

**Architecture:** A section registry (`change-sections.ts`) knows for each loggable data section how to read its current snapshot, write a snapshot back, describe a difference and link to it. `recordChanges()` (`changes.ts`) wraps every route write: it snapshots the declared sections before and after, inside one transaction, and stores an entry per section that actually changed (merging same-user edits within 5 minutes, pruning entries older than 90 days). A request-scoped guard (AsyncLocalStorage set in `hooks.server.ts`) makes every logged write function throw when called from a request outside `recordChanges`, so a forgotten save path fails loudly. Reset goes through `recordChanges` too, so it is logged and triggers the existing live reload (hooks already publish on every POST).

**Tech Stack:** SvelteKit (Svelte 5 runes), drizzle-orm + better-sqlite3, vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-aenderungsprotokoll-design.md`

## Global Constraints

- English code/identifiers/comments/test titles; German UI strings, URLs and persisted values (section ids below are persisted → German).
- Comments only where the code cannot explain itself.
- vitest with fictional names only; `npm test` and `npm run check` green before every commit.
- Commits authored by Philipp Spinnler only, no co-author lines.
- Retention: 90 days. Merge window: 5 minutes, same user, same section+key, nobody else in between.
- Not logged: user accounts, roles, invites, logins, sessions, news-seen, `ensureSundays`/`ensureYouthEvents`, `createMeeting`.
- Imports: one entry "Import" without user, not resettable.
- A change and its log entry are written together or not at all.
- Visibility and reset right per section = the edit permission listed in the registry below.

## Section registry (decided here, used by all tasks)

| id (persisted) | area | label | permission | key | resettable |
|---|---|---|---|---|---|
| `sonntag.programm` | Sonntag | Programm | `meeting.program` | date | yes (general fields, talks, announcements, callings – **not** prayers) |
| `sonntag.gebete` | Sonntag | Gebete | `meeting.prayers` | date | yes |
| `sonntag.musik` | Sonntag | Musik | `meeting.music` | date | yes (hymns, organist, music note – **not** conductor) |
| `sonntag.leitung` | Sonntag | Dirigent | `meeting.conductor` | date | yes |
| `jugend.gemeinsam` | Jugend | Allgemein | `youth.common` | date | yes – snapshot = common fields **plus all parts**, so undoing a joint toggle restores the separate texts |
| `jugend.jd` / `jugend.jm` / `jugend.beide` | Jugend | JD / JM / Gemeinsam | `youth.jd` / `youth.jm` / `youth.common` | date | yes |
| `jugend.erwachsene` | Jugend | Erwachsene | `youth.common` | date | yes |
| `idee` | Jugend | Idee | `youth.common` | idea id | status changes yes; creation no |
| `ausfall` | Jugend | Ausfall/Pfahlanlass | `youth.common` | break id | yes, incl. create (→ delete) and delete (→ recreate with same id) |
| `mitglied` | Mitglieder | Mitglied | `members.edit` | member id | changes yes; creation no (no member delete in the app) |
| `notiz.ansprache` / `notiz.gebet` | Notizen | Notiz Ansprache / Notiz Gebet | `notes.talk` / `notes.prayer` | member id | yes (snapshot: the note field only) |
| `berufungen` | Einstellungen | Berufungen | `settings.edit` | `''` | yes (bishopric + music callings + youth leaders in one snapshot) |
| `jugendliche` | Einstellungen | Jugendliche | `settings.edit` | member id | yes (`{side, group}` or null) |
| `pfahlbeamte` | Einstellungen | Pfahlbeamte | `settings.edit` | stake calling id | yes, incl. delete (→ recreate with same id) |
| `lied` | Lieder | Lied | `hymns.edit` | hymn number | changes yes; creation no |
| `einstellungen` | Einstellungen | Allgemein | `settings.edit` | `''` | yes (ward name + the four youth times) |
| `jugendseite` | Einstellungen | Jugendseiten-Link | `settings.edit` | `''` | no – snapshot is `versionHash(token)`, described as "Link neu erzeugt", value never stored |
| `import` | Einstellungen | Import | `settings.edit` | `''` | no |

"Resettable" for an entry: the section has `write`, and (`before !== null` or the section allows deleting created objects).

## Shared interfaces

```ts
// src/lib/server/change-sections.ts
export type SectionId = 'sonntag.programm' | 'sonntag.gebete' | ... ; // the ids above
export interface ChangeRef { section: SectionId; key: string }
export interface SectionDef {
	area: 'Sonntag' | 'Jugend' | 'Mitglieder' | 'Notizen' | 'Lieder' | 'Einstellungen';
	label: string;
	permission: Action;
	read(db: Db, key: string): unknown | null;          // null = does not exist; must be deterministic (stable order)
	write?(db: Db, key: string, snapshot: unknown | null): void;
	deletesCreated?: boolean;                            // reset of a "created" entry deletes the object
	describe(db: Db, before: unknown | null, after: unknown | null): string[]; // human lines, names not ids
	target(db: Db, key: string): { label: string; href: string | null };
}
export const SECTIONS: Record<SectionId, SectionDef>;

// src/lib/server/changes.ts
export function recordChanges<T>(db: Db, userId: number | null, refs: ChangeRef[], fn: (created: (ref: ChangeRef) => void) => T, now?: Date): T;
export function recordImport(db: Db, summary: string, now?: Date): void;
export function requestScope<T>(fn: () => T): T;  // hooks wrap resolve() in it
export function assertRecording(): void;           // throws inside a requestScope when not inside recordChanges
export interface ChangeView { id: number; at: string; userName: string | null; section: SectionId; area: string; label: string; target: { label: string; href: string | null }; lines: string[]; resettable: boolean }
export function listChanges(db: Db, role: Role, filter?: { key?: string; sections?: SectionId[]; area?: string; userId?: number }, limit?: number): ChangeView[];
export function resetChange(db: Db, user: { id: number; role: Role }, id: number, force: boolean, now?: Date): { ok: true } | { conflict: { name: string | null; at: string } };
```

`created(ref)` registers an object created inside `fn` (its before snapshot is null). `resetChange` throws `UserError` for unknown, not permitted or not resettable entries.

## Review Focus

1. A save that changes nothing (autosave of an unchanged form, the program form re-saving unchanged prayers) must produce no entry – test in Task 1.
2. A save that throws halfway (e.g. `UserError` inside `fn`) must leave neither data change nor entry – test in Task 1.
3. Resetting an entry whose object was deleted or changed since must ask first (conflict), and `force` must still work (recreate) – test in Task 2 (`ausfall`).
4. A role without the section's permission must neither see nor reset its entries, including notes for `jugend`/`musik` roles – tests in Tasks 1 and 3.
5. Merging must not swallow another person's save in between, and must drop an entry whose merged after equals its before – test in Task 1.

---

### Task 1: Change log core with the Sunday sections

**Files:**
- Modify: `src/lib/server/db/schema.ts` (table `changes`), new migration `drizzle/0025_*.sql` via `npx drizzle-kit generate`
- Create: `src/lib/server/change-sections.ts` (types + the four `sonntag.*` sections), `src/lib/server/changes.ts`
- Test: `src/lib/server/changes.test.ts`

**Interfaces:** Produces everything in "Shared interfaces". Table `changes`: `id` pk, `at` text ISO, `user_id` → users (on delete set null), `section` text, `key` text, `before` text JSON nullable, `after` text JSON nullable; index on (`section`, `key`, `id`).

- [ ] **Step 1: Write the failing tests** (`changes.test.ts`, fictional members e.g. Anna Muster, Max Test; two users created via `createUser` from `auth.ts`)
  - `logs one entry per changed section`: inside `recordChanges(db, u1, [programm, gebete], () => { saveGeneral(theme:'Glaube'); savePrayers(unchanged) })` → exactly one entry, section `sonntag.programm`.
  - `writes nothing when nothing changed`: same call with identical data → 0 entries.
  - `rolls back data and entry when the save throws`: fn changes theme then throws `UserError` → theme unchanged, 0 entries.
  - `merges the same user's saves within 5 minutes`: two saves at t and t+4min → 1 entry, before = original, after = latest; at t+10min → 2 entries.
  - `does not merge across another user's save`: u1, u2, u1 within 2 minutes → 3 entries.
  - `drops a merged entry that ends where it started`: u1 sets theme A→B, then B→A within 5 min → 0 entries.
  - `prunes entries older than 90 days`: entry at now-91d, record a new one → old gone.
  - `describes changes with names`: prayers 2 from none to Max → `listChanges(...)[0].lines` equals `['Schlussgebet: – → Max Test']`.
  - `shows entries only to roles with the section's permission`: `listChanges(db,'dirigent')` sees `sonntag.leitung`, not `sonntag.gebete`.
  - `resets a section to the state before the entry`: reset → prayers back, a new entry exists for the reset.
  - `asks before overwriting a newer change`: u2 changes prayers after the entry → `resetChange(..., false)` returns `{conflict: {name: <u2 name>, at}}`, data unchanged; with `force` → reset done.
  - `refuses reset without permission`: role `musik` resetting a `sonntag.gebete` entry throws `UserError`.
  - `guard throws for a write in a request scope outside recordChanges`: `requestScope(() => savePrayers(...))` throws; inside `recordChanges` it passes; outside any scope (tests, scripts) it passes.

- [ ] **Step 2: Run** `npx vitest run src/lib/server/changes.test.ts` – Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** schema + migration, `change-sections.ts` with the four Sunday sections (`read` built from `loadMeetingFullByDate`; `write` via `saveGeneral`/`saveTalks`/`saveAnnouncements`/`saveCallings`, `savePrayers`, `saveMusic` with the current conductor kept, `saveConductor`), and `changes.ts`.
  - Wrap `fn` and the bookkeeping in `db.transaction`; the save functions' own `db.transaction` nests as a savepoint in better-sqlite3 – the rollback test proves it.
  - Compare snapshots via `JSON.stringify`.
  - Merge = update the latest entry for (section,key) when it is the same user and younger than 5 min, otherwise insert.
  - Guard: `AsyncLocalStorage<{ depth: number }>`; `recordChanges` increments depth inside a scope.
  - Add `assertRecording()` as first line of `saveGeneral`, `savePrayers`, `saveTalks`, `saveAnnouncements`, `saveCallings`, `saveMusic`, `saveConductor`.

- [ ] **Step 4: Run** `npx vitest run src/lib/server/changes.test.ts` – Expected: PASS. Then `npm test` – Expected: all pass (existing tests call save functions outside a scope).

- [ ] **Step 5: Commit** `feat: change log core with Sunday sections`

### Task 2: Youth sections (date sections, ideas, breaks)

**Files:**
- Modify: `src/lib/server/change-sections.ts`
- Modify (guard line): `src/lib/server/youth.ts` (`saveYouthCommon`, `saveYouthPart`, `saveYouthAdults`), `youth-ideas.ts` (`createIdea`, `dismissIdea`, `planIdea`), `youth-breaks.ts` (`createBreak`, `updateBreak`, `deleteBreak`)
- Test: `src/lib/server/changes.test.ts` (new `describe('youth sections')`)

**Interfaces:** Consumes Task 1. `jugend.gemeinsam.write` sets the common fields and replaces all parts of the event with the snapshot's parts (direct table writes in one transaction, not `saveYouthCommon`, which would merge them again).

- [ ] **Step 1: Write the failing tests**
  - `undoing a joint toggle restores both sides`: JD text 'Velotour', JM text 'Fussball'; record `saveYouthCommon(joint:true)` under `jugend.gemeinsam`; reset → `joint` false, parts jd 'Velotour', jm 'Fussball', no `both` part.
  - `a part edit after the toggle makes the reset ask first`: after the toggle, edit `both` under `jugend.beide` → reset of the gemeinsam entry returns conflict.
  - `JD leaders see JD but not JM entries`: `listChanges(db,'jd_leitung')` contains `jugend.jd`, not `jugend.jm`.
  - `a deleted break comes back with the same id`: create (via `created`), update, delete; reset the delete entry → break exists with same id and the updated values.
  - `resetting a created break deletes it`; `a created idea is not resettable` (`resettable === false`).
  - `a reset of a changed-then-deleted break asks first`: reset the *update* entry after deletion → conflict; with force → recreated with the old values.

- [ ] **Step 2: Run** the file – Expected: FAIL on the new tests.
- [ ] **Step 3: Implement** the sections listed in the registry for Jugend; `describe` lines use the youth labels already in the app (`KIND_LABELS`, side names); `target` → `/jugend/<date>` resp. `/jugend/ausfaelle/<id>`, ideas → `/jugend/ideen`.
- [ ] **Step 4: Run** file, then `npm test` – Expected: PASS.
- [ ] **Step 5: Commit** `feat: change log for youth dates, ideas and breaks`

### Task 3: Master data, settings and imports

**Files:**
- Modify: `src/lib/server/change-sections.ts`, `src/lib/server/changes.ts` (`recordImport`)
- Modify (guard line): `members.ts` (`createMember`, `updateMember`), `bishopric.ts`, `music-callings.ts`, `youth-people.ts` (`setYouth`, `removeYouth`, `setLeaders`), `stake-callings.ts` (create, rename, presides, delete, move), `hymns.ts` (`createHymn`, `updateHymn`), `settings.ts` (`setSetting`)
- Modify: `scripts/import-sheets.ts`, `scripts/import-youth.ts` (call `recordImport` once with a short summary)
- Test: `src/lib/server/changes.test.ts` (new `describe('master data')`)

- [ ] **Step 1: Write the failing tests**
  - `member notes are their own sections`: `updateMember(noteTalk)` under `[mitglied, notiz.ansprache]` → only a `notiz.ansprache` entry; visible to `bischofschaft`, not to `jm_berater`; `mitglied` entry for a name change visible only to `admin`.
  - `the youth page token is logged without its value`: regenerate token → entry lines `['Link neu erzeugt']`, stored before/after do not contain the token, `resettable === false`.
  - `a deleted stake calling comes back with the same id` (members referencing it keep pointing to it).
  - `callings reset restores bishopric, music callings and leaders together`.
  - `an import entry has no user and cannot be reset`.
- [ ] **Step 2: Run** – Expected: FAIL.
- [ ] **Step 3: Implement** the remaining sections from the registry and `recordImport`. If `setSetting` is reached from `/setup` (it is not today – verify), wrap that call in `recordChanges` with the new user's id.
- [ ] **Step 4: Run** file, then `npm test` – Expected: PASS.
- [ ] **Step 5: Commit** `feat: change log for members, callings, hymns, settings and imports`

### Task 4: Wire every route write through recordChanges

**Files:**
- Modify: `src/hooks.server.ts` (wrap `resolve(event)` in `requestScope`)
- Modify: every action that calls a guarded function:
  - `sonntag/[date]`: `program` → refs programm + gebete; `prayers`; `music` → musik + leitung; `conductor`.
  - `fragen/[kind]`: `note` → `notiz.*`; `ask` → `sonntag.programm` (talk) resp. `sonntag.gebete` (prayer).
  - `jugend/[date]`: `common` → gemeinsam; `jd`/`jm`/`both` → the side plus `idee:<id>` when an idea is planned; `adults`.
  - `jugend/ausfaelle`, `jugend/ausfaelle/[id]`, `jugend/ideen`.
  - `mitglieder/[id]` (`update` → mitglied + both notiz refs).
  - `einstellungen/*`: `general`, `times`, `berufungen/*`, `jugendliche/*` (incl. `youthToken` → jugendseite), `mitglieder/create`, `pfahlbeamte/*` (`create` → mitglied).
  - `lieder`, `lieder/[number]`.
- Test: `src/lib/server/changes.test.ts`

- [ ] **Step 1: Write the failing test** `every route that imports a guarded write function also imports recordChanges`: read all `src/routes/**/+page.server.ts` with `fs`, and for each file that imports one of the guarded function names, expect it to import `recordChanges`. (Guarded names = one exported array `GUARDED` in `changes.ts`, kept next to the guard.)
- [ ] **Step 2: Run** – Expected: FAIL listing the route files.
- [ ] **Step 3: Implement** the wrapping. Keep the version check before `recordChanges`. Pass `locals.user!.id`. For create actions use `created({ section, key: String(newId) })`.
- [ ] **Step 4: Run** `npm test` and `npm run check` – Expected: PASS. Then start the dev server on a scratch DB, click through one save per page above, and verify no guard error appears and entries are written (`sqlite3`/drizzle query or the Task 5 page).
- [ ] **Step 5: Commit** `feat: log every save through recordChanges`

### Task 5: History UI and overall list

**Files:**
- Create: `src/lib/components/ChangeList.svelte` (list of `ChangeView` with reset button and inline conflict question)
- Create: `src/routes/(app)/aenderungen/+page.server.ts`, `+page.svelte`
- Modify: `src/routes/(app)/sonntag/[date]/+page.server.ts` + `+page.svelte`, `src/routes/(app)/jugend/[date]/+page.server.ts` + `+page.svelte`, `src/routes/(app)/+layout.svelte` (user menu link "Änderungen")
- Test: `src/lib/server/changes.test.ts` (load-side helpers only)

**Decisions:**
- Overall list lives at `/aenderungen` (not under Einstellungen, whose nav is admin-only); linked from the user menu for every role that can see at least one section.
- Filters via query params `?person=<userId>&bereich=<area>`; shows the newest 200.
- Each date page loads `listChanges(db, role, { key: date, sections: <its sections> })`, shows "Zuletzt geändert von {name}, {Wochentag HH:MM}" under the title and a `<details>` "Verlauf" with `ChangeList`.
- Reset is one form action `reset` on `/aenderungen`; `ChangeList` posts to `/aenderungen?/reset` with `id` and optional `force=1`. On `{conflict}` the action returns `fail(409, { conflict: { id, name, at } })`; `ChangeList` then shows "Seither von {name} geändert ({zeit}). Trotzdem zurücksetzen?" with a second button that posts `force=1`. No browser `confirm()`.
- Button text "Auf diesen Stand zurücksetzen"; hint under it: "Setzt den Abschnitt auf den Stand vor dieser Änderung zurück."
- Live reload of other browsers is already done by `hooks.server.ts` for every POST.

- [ ] **Step 1: Write the failing test** `lists the newest entry first with a readable user name and target link` (`listChanges` returns `userName`, `target.href === '/sonntag/2026-11-01'`).
- [ ] **Step 2: Run** – Expected: FAIL if not yet covered, otherwise note it and continue.
- [ ] **Step 3: Implement** UI as decided; reuse existing styles (`.hint`, list styles from the settings pages).
- [ ] **Step 4: Verify** `npm test`, `npm run check`; dev server: change a prayer as one user, reset it as admin from the Sunday page and from `/aenderungen`, trigger the conflict path with a second browser, check a `jd_leitung` user sees no Sunday entries.
- [ ] **Step 5: Commit** `feat: change history on dates and overall change list with reset`

---

Before pushing: propose a "Was ist neu" entry for `src/lib/server/news.ts` and write it only after approval.
