# Guided analysis user guide

Open **Start analysis** in the Work sidebar. The complete walkthrough is also the first chapter of the in-app User Guide.

1. Choose Find risks, Challenge a plan, or Compare options. Enter the question, context, constraints, and assumptions. Comparisons need two to six described options and acceptance criteria.
2. Review the suggested panel. Suggestions match topic words and diversify disciplines without an LLM call. Select three to eight agents.
3. Review readiness, then run in the background. The local Node server uses its configured MITRE AIP model, retrieves relevant knowledge excerpts, and runs two rounds, synthesis, comparison when needed, and a brief.
4. You may close the browser. Keep the computer, database, and server running. After a server restart, interrupted jobs resume from persisted progress. Failed or stopped jobs can be resumed using saved inputs.
5. Read the brief, supporting quotations, unresolved questions, and conditions that could change the result. Open the full debate for detail. Supplied information is not independently verified; a matching quote is not proof. Same-model personas are not independent corroboration.
6. Add proposed actions to the tracker, assign owners and due dates, define completion criteria, and save. Repeated additions are idempotent. No owner notifications are sent.
7. Review current inputs and reassess after changes. Only unchanged option assessments with intact saved evidence are reused; comparison and brief run again. Compare changed inputs and prior/current conclusions. Record the human decision on the Decision page.

The snapshot includes scenario, criteria, assumptions, panel profiles, relevant knowledge, threats, model, and workflow version. Resume uses the old snapshot; reassess uses current records. The local queue runs one job at a time. Advanced browser-managed debates remain available and are not converted automatically.

## Operations

Run npm run db:migrate before starting the updated server (normal server startup also migrates). npm start starts the durable queue with the app. The analysis_jobs table stores checkpoints and results; preserve it with the rest of the PostgreSQL database. Jobs require current workspace membership and analyst/admin write permission. Read-only users can view results. No credentials are stored in job snapshots.


**Monitor the contextual progress card in Session Tracker; open Run details for the full record.** The progress card reports saved SME responses, completed syntheses, option comparison, the decision brief and final saving. Its percentage counts work units, not time remaining. The panel table distinguishes saved responses, the currently responding SME, and work still waiting. For comparisons, select a debate to inspect each option; reused debates are labeled. Elapsed time includes queue time and pauses. The page refreshes about every three seconds. A long model request is shown separately from a failed status refresh; server connectivity does not prove that the model is making progress.

**Watch the debate when useful.** Click **View debate as it develops** to read completed responses without leaving the analysis. Filter by round and expand an SME response or the synthesis. Text appears after each response is saved; it is not token-by-token streaming. Early conclusions are provisional. This view is read only and does not trigger additional LLM calls. **Open full debate in new tab** keeps the progress page available. Failed and stopped runs retain saved responses; resume continues unfinished work.


## Complete evidence and token recovery

Token limits and evidence preservation: SME rounds request 4,096 output tokens; synthesis, comparison and decision briefs request 6,144. MITRE AIP retries output-limit failures at most twice with a larger allowance, up to the server-configured ceiling (8,192 by default). The input stays unchanged; incomplete text is replaced and never marked complete. Completed SME turns remain saved. Oversized synthesis and brief inputs use section reviews with exact-quote and section-coverage checks. These checks do not guarantee semantic equivalence; review original evidence and disagreements before accepting conclusions. If sections cannot fit or validation fails, the analysis stops explicitly. The knowledge retriever still selects relevant chunks; it does not send the entire library. Retry attempts take additional time and model usage. Provider context limits and output limits are different; verify model support before increasing LLM_MAX_TOKENS. Changes apply to newly generated steps; completed results are not rewritten.
