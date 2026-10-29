# Kalender-Abo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An iCal subscription feed of Wednesday activities and Sunday classes, picked on the public youth page, with default times set under Einstellungen.

**Architecture:** A pure function in a new `src/lib/server/youth-calendar.ts` turns `listYouthEvents` rows into calendar entries (filtered by side, weekday or person) and renders them as RFC 5545 text by hand. The text only contains what `publicItem` lets through on the youth page. A `+server.ts` under `/j/[token]/kalender.ics` serves it behind the existing token check. The youth page gets a subscribe dialog that only shows up when all four default times are set.

**Tech Stack:** SvelteKit, drizzle/better-sqlite3, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-29-kalender-abo-design.md`

## Global Constraints

- Code, identifiers, comments and test titles are English. UI strings, URL paths and query params are German (`/j/<token>/kalender.ics?seite=jd&tag=mi&person=12`).
- No new npm dependency. iCal is written by hand.
- Tests use fictional names only.
- Run `npm test` and `npm run check` before every commit. Commits are authored by Philipp Spinnler, with no co-author lines.
- Time zone is Europe/Zurich. Times go out as UTC (`…Z`), so there is no need for a VTIMEZONE block.
- Window: from 1 month before today to 6 months after today (`addMonths`).
- No `youthBreaks` entries. Dates with `status === 'off'` are left out (this covers `erwachsene` and holidays). Basel kinds are included.
- The feed never answers with an error status for a valid token. A stale person id or missing times give an empty `VCALENDAR`.
- Before pushing, propose an entry for `src/lib/server/news.ts` and write it only after approval.

## Review Focus

- Text with commas, semicolons, newlines or umlauts in titles or details: it is escaped per RFC 5545 and lines are folded at 75 octets without splitting a UTF-8 character. Task 2 has the tests for this.
- A daylight-saving switch: a Wednesday 19:00 in summer is `170000Z`, in winter `180000Z`. Task 2 has the test.
- Sunday `text`/`details` are not in the feed, because `publicItem` hides them on the page too. Task 2 has the test.
- A token that was regenerated returns 404, and an old link stops working. Task 3 has the test.
- Two members with the same first name: the picker shows `Anna M.` and `Anna K.`, using the existing `shortNames`. Task 4 covers this by reusing that function, so there is no separate test.

---

### Task 1: Default times in settings

**Files:**
- Modify: `src/lib/server/settings.ts` (add keys to `SETTING_DEFAULTS`)
- Modify: `src/routes/(app)/einstellungen/+page.server.ts` (new action `times`)
- Modify: `src/routes/(app)/einstellungen/+page.svelte` (new section)
- Test: `src/lib/server/settings.test.ts`

**Interfaces:**
- Produces: setting keys `youth_wed_start`, `youth_wed_end`, `youth_sun_start`, `youth_sun_end` (default `''`, format `HH:MM`). Also `youthTimes(db: Db): { wed: [string, string]; sun: [string, string] } | null` in `settings.ts`, which returns null unless all four are set.

- [ ] **Step 1: Write the failing test** in `settings.test.ts`:

```ts
it('youth times are null until all four are set', () => {
	expect(youthTimes(db)).toBeNull();
	setSetting(db, 'youth_wed_start', '19:00'); setSetting(db, 'youth_wed_end', '21:00'); setSetting(db, 'youth_sun_start', '10:50');
	expect(youthTimes(db)).toBeNull();
	setSetting(db, 'youth_sun_end', '11:40');
	expect(youthTimes(db)).toEqual({ wed: ['19:00', '21:00'], sun: ['10:50', '11:40'] });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/server/settings.test.ts`. It should fail: `youthTimes` is not exported.
- [ ] **Step 3: Implement** the keys and `youthTimes` in `settings.ts`.
- [ ] **Step 4: Settings UI.** Add a section `<h2>Jugend-Zeiten</h2>` with four `<input type="time">` fields: „Mittwochsaktivität von/bis“ and „Sonntagsklasse von/bis“. They autosave on change like the existing `general` form (`submitOnChange`, `use:enhance`). The `times` action uses `requireRole(locals.user, 'settings.edit')`. It accepts `''` or `/^\d{2}:\d{2}$/` and otherwise returns `fail(400, { error: 'Ungültige Zeit.' })`. Below the fields goes this hint, word for word: „Diese Zeiten gelten für alle Termine im Kalender-Abo der Jugendseite. Erst wenn alle vier gesetzt sind, erscheint dort der Knopf „Im Kalender abonnieren“.“
  The version check and live channel are left out on purpose, the same as the existing `general` settings form: there is a single editor, and the values rarely change.
- [ ] **Step 5: Run** `npm test && npm run check`. Both should pass.
- [ ] **Step 6: Commit** `feat: default times for youth activities and classes in settings`

### Task 2: Calendar entries and iCal text

**Files:**
- Modify: `src/lib/server/youth-page.ts`: move `publicItem` and `tokenMatches` here from `src/routes/j/[token]/+page.server.ts` and export them. Also export `youthPageNames(db): Map<number, string>`, the names map that `youthPageItems` builds today, and have `youthPageItems` use it.
- Modify: `src/routes/j/[token]/+page.server.ts`: import the moved helpers.
- Create: `src/lib/server/youth-calendar.ts`
- Test: `src/lib/server/youth-calendar.test.ts`

**Interfaces:**
- Consumes: `youthTimes` (Task 1), `listYouthEvents`, `listYouth`, `listAdultsFor(db, 'jd')`, `toItem` (export it from `youth-page.ts`), `publicItem`.
- Produces:

```ts
export interface CalendarFilter { sides: ('jd' | 'jm')[]; days: ('mi' | 'so')[]; personId: number | null }
export interface CalendarEntry { uid: string; date: string; start: string; end: string; title: string; description: string; url: string | null }
export function parseCalendarFilter(params: URLSearchParams): CalendarFilter  // seite=jd|jm (missing/other → both), tag=mi|so (missing → both), person=<int>
export function youthCalendarEntries(db: Db, today: string, f: CalendarFilter): CalendarEntry[]
export function toIcs(entries: CalendarEntry[], ward: string, now: Date): string
export function zurichToUtc(date: string, hhmm: string): string  // → 'YYYYMMDDTHHMMSSZ'
```

**Entry rules** (from the spec):
- One entry for each part that `toItem` returns: `both` for joint dates, otherwise `jd` and `jm`. `uid` = `${date}-${side}@gemeindeplan`.
- Title prefix: `JD`, `JM` or `JD/JM` (for `both`). Then ` Aktivität` on Wednesday or ` Klasse` on Sunday. Then `: ${x}` when there is something to add, where x is `part.text` on Wednesday and the side's topic or the shared topic on Sunday. An unplanned date has the bare prefix, e.g. `JD Aktivität`.
- Description, one line each and only when present: `Thema: …` (Wednesday shared topic), `Leitung: …`, `Lehrer: …`, `Details: …` (part details, Wednesday only), `Snack: …`, `Gedanke: …`, `Erwachsene: …`, `Kein Seminar`. Always run the item through `publicItem` first. `url` = the side's topicUrl or the shared topicUrl.
- Filter without a person: `sides` and `days`. A `both` entry passes if either side is selected.
- Filter with a person (`sides` is ignored, `days` still applies):
  - Person in `listYouth` with side S: all Wednesday entries for S or `both`, plus the Sunday entries where `part.teacher.id === personId`.
  - Person in `listAdults`: their side is `jd` if they are in `listAdultsFor(db, 'jd')`, else `jm` (bishopric → JM). They get the Wednesday entries where they are `present` and the entry is their side or `both`, plus the Sunday entries where they teach.
  - Unknown id: `[]`.
- `youthTimes(db) === null` → `[]`.

`zurichToUtc` takes a first UTC guess, reads the Zurich offset at that instant with `Intl.DateTimeFormat('en', { timeZone: 'Europe/Zurich', hourCycle: 'h23', … }).formatToParts`, and subtracts it.

`toIcs` outputs `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//Gemeindeplan//Jugend//DE`, `X-WR-CALNAME:JD/JM ${ward}`, and one `VEVENT` per entry (`UID`, `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION`, optional `URL`). Lines end in CRLF. Text escapes `\` `;` `,` and newline as `\n`. Lines fold at 75 octets with CRLF+space, and never inside a UTF-8 sequence.

- [ ] **Step 1: Write failing tests** in `youth-calendar.test.ts`, using the setup style of `youth-page.test.ts` with fictional members (e.g. `Lea Muster` JD, `Tim Beispiel` JM, adult `Eva Probe` as `jd_beraterin`, a bishopric member `Max Test`). Set the times with `setSetting`. Tests:
  - `returns nothing until the default times are set`
  - `titles a planned and an unplanned Wednesday per side`: `JD Aktivität: Pizza backen`, `JM Aktivität`
  - `titles a joint Wednesday JD/JM and a Sunday class with its topic`: `JD/JM Aktivität: …`, `JD Klasse: Glaube`
  - `leaves out off dates and class with the adults`
  - `filters by side and weekday`
  - `a youth gets all activities of their side but only the classes they teach`
  - `an adult gets Wednesdays where present on their side; bishopric counts as JM`
  - `an unknown person id gives no entries`
  - `never puts Sunday text or details into the description`
  - `converts Zurich time to UTC across daylight saving`: `zurichToUtc('2026-10-21','19:00') === '20261021T170000Z'` and `zurichToUtc('2026-11-04','19:00') === '20261104T180000Z'`
  - `escapes and folds iCal text`: a summary `Grill, Spiele; mehr\nInfos` comes out as `Grill\, Spiele\; mehr\nInfos`. Every line has ≤ 75 octets, and joining the folded lines back together gives the original line for a 200-char umlaut string.
  - `parses the filter from query params`: `seite=jm&tag=so&person=7` → `{ sides: ['jm'], days: ['so'], personId: 7 }`, and an empty query → both/both/null.
- [ ] **Step 2: Run** `npx vitest run src/lib/server/youth-calendar.test.ts`. It should fail because the module is missing.
- [ ] **Step 3: Implement** the moves in `youth-page.ts`/`+page.server.ts` and then `youth-calendar.ts`.
- [ ] **Step 4: Run** `npm test && npm run check`. Both should pass, and the existing `youth-page.test.ts` should stay green.
- [ ] **Step 5: Commit** `feat: youth calendar entries and iCal output`

### Task 3: Feed endpoint

**Files:**
- Create: `src/routes/j/[token]/kalender.ics/+server.ts`
- Test: `src/lib/server/youth-calendar.test.ts` (add the token test there through an exported helper, if the repo has no route tests; check with `ls src/routes/**/*.test.ts`)

**Interfaces:**
- Consumes: `tokenMatches`, `getSetting(db, 'youth_page_token')`, `parseCalendarFilter`, `youthCalendarEntries`, `toIcs`, `todayIso`.
- Produces: `GET /j/<token>/kalender.ics` → `200 text/calendar; charset=utf-8`, with `Cache-Control: no-store` and `X-Robots-Tag: noindex`. An invalid or empty token returns `error(404, 'Nicht gefunden')`.

- [ ] **Step 1: Write failing test** `rejects a regenerated token`: export `youthFeed(db, token, params, today): string | null` from `youth-calendar.ts`, which returns null for a bad token. The test sets the token, regenerates it with `newYouthPageToken`, and expects the old token → null and the new token → a string starting with `BEGIN:VCALENDAR`.
- [ ] **Step 2: Run.** It should fail.
- [ ] **Step 3: Implement** `youthFeed` and the `+server.ts` GET, which is a thin wrapper.
- [ ] **Step 4: Run** `npm test && npm run check`, then `curl -s localhost:5173/j/<token>/kalender.ics | head` on the dev server. The output should begin with `BEGIN:VCALENDAR`.
- [ ] **Step 5: Commit** `feat: calendar feed under the youth page token`

### Task 4: Subscribe dialog on the youth page

**Files:**
- Modify: `src/routes/j/[token]/+page.server.ts`: also return `calendar: { people: { id: number; name: string; group: 'Jugendliche' | 'Leitung' }[] } | null`. It is null when `youthTimes(db)` is null. People come from `youthPageNames`, sorted by name: youth first, then adults.
- Create: `src/routes/j/[token]/CalendarSubscribe.svelte`
- Modify: `src/routes/j/[token]/+page.svelte`: render `<CalendarSubscribe>` only when `data.calendar`.

**Interfaces:**
- Consumes: `youthTimes`, `youthPageNames`, `listYouth`, `listAdults`.

- [ ] **Step 1: Build the component.** It has a button „Im Kalender abonnieren“ that opens a native `<dialog>` with:
  - `<select>` „Für wen?“ with the options „Alle“ and an optgroup each for Jugendliche and Leitung
  - checkboxes JD/JM, hidden while a person is chosen, with the hint „Bei einer Person ergibt sich das aus ihrer Seite.“
  - checkboxes Mittwoch/Sonntag
  The dialog shows the resulting link as `webcal://${location.host}/j/<token>/kalender.ics?…` with an „Abonnieren“ link (webcal) and a „Link kopieren“ button that copies the `https://` variant via `navigator.clipboard`, with the hint „Für Google Kalender: Link kopieren und unter ‚Per URL hinzufügen‘ einfügen.“ It omits params that equal the default (both sides, both days, no person).
- [ ] **Step 2: Run** `npm run check`. It should pass.
- [ ] **Step 3: Check in the browser on the dev server.**
  - Without times: no button.
  - With times: the button shows, and the link changes with the selection.
  - Opening the copied https link returns the iCal.
  - Subscribing via webcal on macOS Calendar shows the entries with the correct times.
- [ ] **Step 4: Commit** `feat: subscribe to the youth calendar from the youth page`

### Task 5: Wrap-up

- [ ] **Step 1:** Propose a „Was ist neu“ entry for `src/lib/server/news.ts` to the user, and write it after approval.
- [ ] **Step 2:** Run `npm test && npm run check`. Both should pass. Commit the news entry.
