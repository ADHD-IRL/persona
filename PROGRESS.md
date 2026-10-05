# PROGRESS

Per-requirement status for work done under `AGENTS.md`. Newest first.

## R-N10 — Long-running analysis survives leaving the page

**Status:** implemented and verified locally (2026-10-05).

**Verification (verbatim summary)**
- `node scripts/runState.test.mjs` → `tests 12 · pass 12 · fail 0`. Note: Node 24 rejects `node --test scripts/` with a directory argument; run the file directly or `node --test scripts/*.test.mjs`.
- `npm run build` → `✓ 2595 modules transformed … ✓ built in 5.81s`, exit 0.
- `npm run lint` → 27 errors, all `unused-imports/no-unused-imports`, all pre-existing on `main` in files outside this change (WhatIfSimulator, SessionComparison, WorkspaceManagement, UserGuide, etc.). The two in `SessionWorkspace.jsx` were fixed here. The rest are left for a lint-cleanup task so this diff stays scoped to R-N10.
- Process note: the acceptance test and the implementation were authored in the same pass rather than test-first-then-fail; the test was run against the finished library and passed on first run.

**Requirement (proposed, not yet in the workbook):** a multi-step model-driven run (Round 1, Round 2, Synthesis, decision panel) survives in-app navigation, page reload, tab close and app remount. On return the user sees either live progress from the tab still driving it, or an "interrupted" state they can resume from the last finished step. No agent is ever left stuck in a `generating_*` status with no way forward.

**Acceptance criterion used:** reload the session workspace mid-Round 1 → the page shows an Interrupted banner naming the stage and agent → Resume continues from the next unfinished agent and carries on through Synthesis → no agent row shows a spinner that never finishes. Same for the decision panel: Resume continues partial option sessions instead of recreating them.

**What was built**
- `src/lib/runState.js` — pure functions (Node-testable, relative imports only): run keys, record make/touch, `classifyRun` (none / own / alive / stale), `nextSessionStage`, `sessionResumePlan`, `hasStuckAgents`, `decisionResumePlan`, `describeRun`.
- `scripts/runState.test.mjs` — 12 `node:test` cases covering the above.
- `src/lib/appConfigKV.js` — read/write/delete JSON values in the AppConfig store (chosen over a new table per owner decision; no migration).
- `src/hooks/useRunRecord.js` — polls the record, heartbeats it while this tab owns a run, warns visibly when a heartbeat write fails, and arms `beforeunload` while owning a run.
- `src/pages/SessionWorkspace.jsx` — Round and Synthesis loops start / beat / finish the record; refuses to start while another tab is alive; Interrupted and Running-elsewhere banners; Resume heals stuck statuses and chains to the end; active tab and unsent facilitator note persist per tab in sessionStorage.
- `src/lib/decisionRunner.js` + `src/pages/DecisionDetail.jsx` — same record for the decision panel; `runOptionSession` can resume a partial session (skips finished agents and an existing synthesis).

**What's left**
- Add R-N10 to the requirements workbook with the acceptance criterion above.
- Manual acceptance pass in the browser (reload mid-Round 1 → Interrupted → Resume → completes). Not automatable without a Playwright harness, which this repo does not have yet.
- Merge-order note: this branch is based on `feat/decision-auto-panel`; `feat/session-hub-ux` also edits `SessionWorkspace.jsx` and will conflict on the banner region.

**Surprises**
- There was no record anywhere that a loop was in flight; "is it running?" was inferred from agent statuses, which is exactly the T5/T6 failure mode in AGENTS.md §5.1. The run record is now the thing that knows.
- The owner tab must never see its own run as stale, otherwise a slow model call (longer than the stale window) would prompt the user to resume a run that is still going. `classifyRun` returns `own` for the owning tab regardless of age.
