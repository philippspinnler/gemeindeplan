# Gemeindeplan – conventions

- Code, identifiers, comments and test titles are English. UI strings, URLs (`/sonntag`, `/fragen`) and persisted enum values stay German – they are user-facing.
- Comments only where the code cannot explain itself (a non-obvious decision, a trap, a `ponytail:` ceiling). No comments that restate the code.
- Every feature that edits data follows the same pattern: autosave on change (no save button), per-section version check against overwrites, and a change event through the live channel (`src/lib/server/live.ts`) so other open browsers refresh immediately and presence is shown. See `src/routes/(app)/sonntag/[date]` for the reference implementation.
- Tests: vitest, fictional names only (no real member data). Run `npm test` and `npm run check` before committing.
- Commits are authored by Philipp Spinnler only; no co-author lines, no personal data in the repo.
