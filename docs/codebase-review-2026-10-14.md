# Initial codebase review — October 14, 2026

## Resolution — October 14, 2026

All five findings below have been addressed in the source. Workspace credentials now live only in memory, come from the active workspace, and are cleared on identity changes and provider teardown; legacy unscoped browser keys are discarded. Settings confirms that a database update returned a workspace before reporting success. AI streaming requires an explicit completion event, resets clear all round risk fields, and aggregation preserves zero exposure. Workspace startup checks query errors, ignores abandoned results, and exposes retry through a dedicated error screen. Reset copy explicitly describes the artifacts retained.

The 15 unused imports were removed. There are 19 new regression tests (62 tests total), plus `npm test` and `npm run verify` commands. Combined verification passed. A second build with placeholder Supabase configuration also passed, checking the full application bundle rather than only the setup screen; normal build output was restored afterward. The tests exercise real application helpers with simulated streams and database responses; authenticated browser flows and live database policy enforcement still require deployment verification. The original findings and baseline below are preserved as review history.

The first refinement pass should address credentials and result integrity before expanding the interface. This review covers routing, authentication, workspace initialization, data access, AI streaming, session resets, risk aggregation, and existing automated checks. It is a source review with local reproductions; deployed database policies and authenticated browser flows were not exercised.

## Prioritized findings

### 1. P1 — API credentials survive account changes

`src/lib/WorkspaceContext.jsx:119–125` sets the module-level Anthropic key only when the newly loaded workspace has a nonempty key. There is no corresponding reset when the provider unmounts or the user signs out. `src/lib/llm.js:20–24` also falls back to the unscoped `agd_anthropic_key` browser entry. Settings reads that browser entry ahead of the current workspace key (`src/pages/Settings.jsx:52–59`).

After account A saves a key, signing out and entering account B's workspace without a key can leave A's key available to B's AI requests. Settings can display A's key and save it into B's workspace. This creates unintended credential disclosure and API spending on shared browser profiles.

Refinement: reset the in-memory key on account/provider changes, scope any local credential persistence by user and workspace, and populate Settings from the active workspace. Correct the Settings description at line 154: the implementation stores the key in Supabase and sends requests through the application proxy, while the text says it is stored locally and sent directly to Anthropic.

### 2. P1 — Interrupted AI streams are treated as successful results

`src/lib/llm.js:63–90` treats the response reader reaching EOF as success without requiring Anthropic's `message_stop` event. It returns accumulated text and calls `onDone`, even if only part of an assessment arrived. The function also discards the remaining unterminated buffer.

Local reproduction: mock a successful HTTP response containing one text delta, then EOF with no completion event. The function returns `unfinished assessment` and invokes its completion callback. Callers can persist incomplete assessments or synthesis text as successful results.

Refinement: track explicit stream completion, reject premature EOF, process final buffered events, and release the reader. Add tests for complete streams, interrupted streams, provider errors, and events split across chunks.

### 3. P2 — Reset retains previous quantified risk

`src/pages/Sessions.jsx:108–112` clears assessment text, severity, and confidence but omits `round1_likelihood`, `round1_impact`, `round2_likelihood`, and `round2_impact`. `aggregateSessionRisk` prefers round-two numeric values regardless of whether a round-two assessment exists (`src/lib/risk.js:61–69`).

A reset row with retained L4 × I5 still produces peak risk 20 and average exposure 12 despite having no assessment or severity. During a rerun, the old round-two scores can also override fresh round-one scores.

Refinement: clear all derived round fields together. Define which session artifacts a reset should preserve, including transcript, sources, chains, and mitigations, and make that behavior clear to the user. Verify reset followed by a partial rerun.

### 4. P2 — Zero confidence becomes full exposure

`src/lib/risk.js:69` uses `expectedExposure(ll, ii, conf) || s`, replacing a valid exposure of zero with the unweighted risk score.

Local reproduction: likelihood 5, impact 5, and confidence 0 yields `avgExposure: 25`, even though `expectedExposure` returns 0. This reverses the intended confidence weighting and can distort comparisons and recommendations.

Refinement: use a nullish fallback instead of a truthiness fallback. Test zero, missing, and full confidence.

### 5. P2 — Workspace startup errors have no recovery state

`src/lib/WorkspaceContext.jsx:41–114` ignores errors from membership/workspace reads and clears loading in `finally` even when no workspace could be activated. `src/App.jsx:51–55` gates only on loading, so it renders application pages with `db: null`. For example, Sessions returns early from its load effect while its page-level loading state remains true (`src/pages/Sessions.jsx:46–56`).

A membership read error can be mistaken for an absent workspace and trigger creation/repair logic. A creation or membership failure leaves the user without an actionable error or retry control.

Refinement: distinguish successful empty reads from failures, expose a workspace initialization error, require an active workspace before rendering protected pages, and offer retry. Guard against stale initialization requests after identity changes.

## Validation baseline

- Production build: passed after rerunning outside the sandbox because esbuild's parent-directory lookup was denied by the sandbox.
- Existing Node tests: 43 passed, 0 failed (`node --test scripts/*.test.mjs`). Coverage includes MCP tools/auth/rate limits, pagination, persona PDFs, and run/resume planning.
- Lint: failed with 15 unused-import errors across 12 files. These are straightforward cleanup items, separate from the behavioral findings above.
- Three small local reproductions confirmed premature-stream completion, retained reset risk, and zero-confidence aggregation. No live AI requests or database mutations were performed.

## Suggested refinement sequence

1. Fix credential lifecycle and accurately describe storage/request behavior.
2. Fix stream completion, reset semantics, and confidence aggregation with focused regression tests.
3. Add workspace/page error recovery and visible save failures.
4. Clean up lint and add a single verification script combining build, lint, and the existing Node tests.
5. Refine the session workflow and visual consistency after the underlying states are reliable.

The original review did not change application source files; the resolution above records the subsequent fixes. Deployed configuration may differ.

