# MCP-Themen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can connect Claude Desktop/Claude Code to `/mcp` with a personal key and read/set Sunday themes and Sunday-class topics, under the app's permissions and change log.

**Architecture:** A personal key (hash on `users`) authenticates a minimal MCP JSON-RPC endpoint (`src/routes/mcp/+server.ts`, Streamable HTTP answered as plain JSON, no SSE). The four tools live in `src/lib/server/mcp-topics.ts` as plain functions taking the acting user; they check `can()`, write through `recordChanges`, and report per date. The endpoint only parses JSON-RPC, authenticates and dispatches.

**Tech Stack:** SvelteKit, drizzle-orm + better-sqlite3, vitest. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-30-mcp-themen-design.md`

## Global Constraints

- English code/comments/test titles; German UI strings, tool names, tool results.
- vitest, fictional names; `npm test` + `npm run check` green before each commit; commits by Philipp only, no co-author lines.
- Keys only for admins (`users.role === 'admin'`, real role, never "Ansicht als"); inactive or non-admin account → key invalid.
- Key stored as SHA-256 hex only; never logged, never in the change log.
- Default "only fill empty", per field; empty input never deletes; `thema_jm` on a joint class is refused; joint is never toggled.
- Every write via `recordChanges` (`sonntag.programm` / `jugend.gemeinsam`) with the key's user; other fields untouched.
- Read range at most 12 months; links only `http(s)://`.
- No personal data in tool results.

## Decisions made here

- **No MCP SDK:** the endpoint needs `initialize`, `notifications/*`, `ping`, `tools/list`, `tools/call` over POST with a JSON response; that is a few dozen lines. `GET /mcp` → 405. Protocol version: echo the client's `protocolVersion` if it is `2025-06-18` or `2025-03-26`, otherwise answer `2025-06-18`.
- **No login throttling for keys:** keys are 256-bit random; guessing is not feasible. Unknown key → HTTP 401 with `WWW-Authenticate: Bearer`.
- **Key format:** `gp_` + 32 random bytes base64url. Columns `users.mcp_key_hash` (unique, nullable) and `users.mcp_key_used_at`.
- **Live reload:** `hooks.server.ts` excludes `/mcp` from the automatic POST publish; the tools call `live.changed('/mcp')` only when they wrote something.
- **Narrow write functions:** `setMeetingTheme(db, meetingId, theme)` in `meetings.ts` and `setClassTopics(db, eventId, patch)` in `youth.ts`, both with `assertRecording()` and listed in `GUARDED`.

## Shared interfaces

```ts
// src/lib/server/auth.ts
export function createMcpKey(db: Db, userId: number): string;             // returns raw key, replaces an old one
export function revokeMcpKey(db: Db, userId: number): void;
export function mcpKeyInfo(db: Db, userId: number): { active: boolean; usedAt: string | null };
export function userForMcpKey(db: Db, raw: string, now?: Date): SessionUser | null; // admin + active only; sets usedAt

// src/lib/server/mcp-topics.ts
export type McpUser = { id: number; role: Role };
export interface DateResult { datum: string; status: 'eingetragen' | 'übersprungen' | 'abgelehnt' | 'teilweise'; eingetragen?: string[]; uebersprungen?: Record<string, string>; grund?: string }
export function readSundays(db: Db, user: McpUser, von: string, bis: string): { datum: string; art: string; programm: boolean; thema: string | null }[];
export function setSundayThemes(db: Db, user: McpUser, eintraege: { datum: string; thema: string }[], ueberschreiben: boolean, today: string): DateResult[];
export function readClasses(db: Db, user: McpUser, von: string, bis: string): { datum: string; findetStatt: boolean; grund: string | null; gemeinsam: boolean; thema: string | null; link: string | null; themaJm: string | null; linkJm: string | null }[];
export function setClassTopics(db: Db, user: McpUser, eintraege: { datum: string; thema?: string; link?: string; thema_jm?: string; link_jm?: string }[], ueberschreiben: boolean, today: string): DateResult[];
```

Read functions throw `UserError` for a range over 12 months, invalid dates or missing permission; `setSundayThemes`/`setClassTopics` throw `UserError` only for missing permission and report everything else per date.

## Review Focus

1. A theme set via MCP must not change any other field of the Sunday/class (kind, joint, snack, presiding …) – tests in Task 2.
2. Overwrite off must never replace a non-empty field, per field – tests in Task 2.
3. Revoked/replaced keys and demoted/deactivated admins must get 401 – tests in Task 1 and 3.
4. Notifications (no `id`) must get HTTP 202 with no body; unknown methods a JSON-RPC error, not a 500 – tests in Task 3.
5. A Sunday/class not yet stored but in the regular grid gets created and set; a non-Sunday date is refused – tests in Task 2.

---

### Task 1: Personal MCP key

**Files:** `src/lib/server/db/schema.ts` + `drizzle/0026_*.sql`; `src/lib/server/auth.ts`; `src/lib/server/auth.test.ts`; `src/routes/(app)/konto/+page.server.ts` + `+page.svelte`.

- [ ] **Step 1: Failing tests** in `auth.test.ts`:
  - `creates a key, stores only its hash and finds the admin by it`: raw starts with `gp_`; `users.mcpKeyHash` ≠ raw; `userForMcpKey(raw)` returns the user and sets `mcpKeyUsedAt`.
  - `a new key replaces the old one; revoke ends it`.
  - `a key stops working for a deactivated or demoted account` (role `bischofschaft` → null; `active=false` → null).
  - `an unknown or empty key finds nobody`.
- [ ] **Step 2: Run** `npx vitest run src/lib/server/auth.test.ts` – Expected: FAIL.
- [ ] **Step 3: Implement** columns, migration (`npx drizzle-kit generate --name mcp_key`), the four functions (reuse `tokenKey`).
- [ ] **Step 4: Konto UI (admin only, `locals.accountRole === 'admin'`):** section "Claude (MCP)"; text: "Mit einem persönlichen Schlüssel kann Claude Desktop oder Claude Code Sonntags- und Klassenthemen lesen und eintragen. Alles erscheint unter deinem Namen im Verlauf."; actions `mcpKey` (create/replace; returns the raw key once) and `mcpRevoke`; shows "Zuletzt benutzt …"/"Noch nie benutzt". After creating: the key, a copy button, the Claude Code command `claude mcp add --transport http gemeindeplan <origin>/mcp --header "Authorization: Bearer <key>"`, and the Desktop JSON block using `npx mcp-remote <origin>/mcp --header "Authorization:Bearer <key>"`, with the hint "Der Schlüssel wird nur jetzt angezeigt."
- [ ] **Step 5: Verify** `npm test`, `npm run check` – PASS.
- [ ] **Step 6: Commit** `feat: personal MCP key for admins`

### Task 2: Topic tools as server functions

**Files:** `src/lib/server/meetings.ts` (`setMeetingTheme`), `src/lib/server/youth.ts` (`setClassTopics`), `src/lib/server/recording.ts` (`GUARDED`), new `src/lib/server/mcp-topics.ts` + `mcp-topics.test.ts`.

- [ ] **Step 1: Failing tests** (`mcp-topics.test.ts`, admin user inserted, `today = '2026-10-30'`):
  - `reads Sundays with kind and theme, and refuses more than 12 months`.
  - `sets an empty Sunday theme and logs it under the user` (one `sonntag.programm` entry, `listChanges` userName).
  - `does not overwrite a theme unless asked` → `übersprungen` with `{ Thema: 'alt' }`; with `ueberschreiben` → `eingetragen`.
  - `changes nothing but the theme` (kind, specialNote, presiding stay).
  - `refuses a Sunday without a program and a non-Sunday date` (`generalkonferenz` → abgelehnt "keine Versammlung mit Programm"; `2026-11-04` → "kein Sonntag").
  - `creates a regular Sunday that is not stored yet` (date 13 months ahead → eingetragen, row exists).
  - `fills only empty class fields` (topic set, link empty → status `teilweise`, eingetragen `['Link']`, uebersprungen `{ Thema: … }`).
  - `refuses a JM topic on a joint class and never toggles joint`.
  - `keeps an existing JM topic when none is given, even with overwrite`.
  - `refuses a link without http(s)` (per date, abgelehnt).
  - `refuses a class that does not take place` (Sunday kind `erwachsene` or meeting `generalkonferenz` → abgelehnt).
  - `creates a class that is not stored yet` (8 months ahead).
  - `refuses without permission` (role `musik` → `UserError`).
- [ ] **Step 2: Run** – FAIL.
- [ ] **Step 3: Implement.** Writes in one `recordChanges` per date (so each date is its own change-log entry); `ensure` the row inside that call. Class "findet statt" = `listYouthEvents` entry is a Sunday with `status !== 'off'`; `grund` = its `offLabel`. Kinds in plain text via `KIND_LABELS`.
- [ ] **Step 4: Verify** `npm test`, `npm run check` – PASS.
- [ ] **Step 5: Commit** `feat: read and set Sunday and class topics as server functions`

### Task 3: MCP endpoint

**Files:** new `src/routes/mcp/+server.ts`, `src/lib/server/mcp.ts` (JSON-RPC handling, tool definitions), `src/lib/server/mcp.test.ts`; `src/hooks.server.ts` (`/mcp` public, excluded from auto publish).

- [ ] **Step 1: Failing tests** (`mcp.test.ts`, call `handleMcp(db, request)` directly):
  - `rejects a request without a valid key with 401`.
  - `initializes with the requested protocol version and lists four tools` (names `sonntage_lesen`, `sonntagsthemen_setzen`, `klassen_lesen`, `klassenthemen_setzen`, each with `inputSchema`).
  - `answers a notification with 202 and no body`.
  - `calls a tool and returns its result as text content` (`sonntagsthemen_setzen` → `content[0].type === 'text'`, JSON with `eingetragen`).
  - `reports tool errors as isError results, unknown methods as JSON-RPC -32601`.
  - `publishes a live change only when something was written`.
- [ ] **Step 2: Run** – FAIL.
- [ ] **Step 3: Implement** `handleMcp(db, request, now?)`; route `POST` delegates; `GET`/`DELETE` → 405. Tool descriptions in German, saying what each tool does and that existing themes are kept unless `ueberschreiben` is true.
- [ ] **Step 4: Verify** `npm test`, `npm run check`; dev server on a scratch DB: create a key, then `curl` `initialize`, `tools/list`, one `tools/call` each; finally `claude mcp add` against the dev server and list tools.
- [ ] **Step 5: Commit** `feat: MCP endpoint for Sunday and class topics`

---

Before pushing: propose a "Was ist neu" entry (area `settings.edit`) and write it after approval.
