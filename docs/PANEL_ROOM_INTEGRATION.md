# Panel Room integration

Panel Room is a distinct, analyst-facilitated mode within AgentDebate. Guided Agent Debate continues to run in the Node background worker. Both use the existing authenticated Node model endpoint and local PostgreSQL workspace.

Panel Room follows: prepare question/context and SME panel → opening positions → cross-examination → evidence check → closing positions → analyst resolution → Reports and Session Tracker. Live discussion is an alternative without fixed phases. The browser must remain open during a live turn; saved turns survive reloads.

Adapted pure reasoning modules in `src/lib/panel` originate from PanelRoomStandAlone (MIT license retained there). The integration uses floor selection, selective recall, bounded position updates, and the debate phase protocol. It does not import the source application's Supabase transport, browser-held MITRE credentials, or silent-save fallbacks.

Each accepted model turn saves its transcript, updated protocol state, and SME positions in one SessionMessage record. Failures remain visible and stop progression. Model positions are not verified facts. Phase advancement is deliberate and recorded; ending a phase is not evidence of consensus.

Reports are session-scoped. Saved transcript and evidence are available without model calls; generated reports use full-evidence section review when needed. Generated text remains a model draft until the analyst reviews it. Reports do not automatically create threats, mitigations, or an approved decision.


## Visual debate room and pulse

Panel Room now uses the visual debate room: SME avatars and the active-speaker stage above the transcript, structured phase controls, a Debate Pulse rail, straw polls, and an agenda/phase history.

Select an SME avatar to choose the next speaker, then Invite next SME contribution. Run remaining phase uses relevance, turn coverage, and cross-examination disagreement to select speakers. The speaker spotlight and provisional caption show a response in progress; it becomes part of the saved debate and pulse only after the complete response validates and saves. The waveform is a visual activity indicator, not audio.

Debate Pulse scores saved turns locally for new vocabulary relative to recent turns (novelty), engagement with other perspectives, and textual specificity such as figures or source references. These are facilitation heuristics, not proof of novelty, evidence quality, truth, or percentage complete. Colored bars identify speakers; the line smooths turn scores. Use Table for exact values and How to read for the legend.

Use Straw poll to ask every SME about the same explicit proposition. The first complete poll shows model stances; movement requires a repeat poll with the same proposition and roster. Poll information becomes stale after four subsequent saved SME turns. No poll means agreement and movement are unknown. A failed or cancelled poll creates no saved poll marker.

A low-value streak or settled poll can pause an automated cross-examination or live burst. Opening positions, evidence check, and closing positions still run their required SME coverage. The analyst decides whether to continue, advance early, seek evidence, or record an unresolved outcome. Pause after current turn saves the current contribution before pausing; Stop generation cancels the current request and retains previously saved turns. The pulse never approves a decision or completes the session.

Pulse bars and poll markers reconstruct from the saved record on reload. Reports includes Debate Pulse and straw polls for review and export. Choose an analyst resolution outcome explicitly; a model poll does not choose it for you.


### Automatic structured debate

Choose **Run debate automatically** in Panel Room to continue from the saved phase through opening positions, cross-examination, evidence check, and closing positions. Each contribution and phase change is saved before continuing. Repetitive cross-examination detected by Debate Pulse advances to the evidence check; opening, evidence, and closing coverage still run. Progress identifies the phase, turn, and active SME.

**Pause after current turn** saves the current contribution before pausing. **Stop generation** cancels the in-progress response and keeps completed turns. Resume with **Run debate automatically**; after a save failure, retry the unsaved contribution first. Keep the room open while it runs. Automatic runs stop after at most one hour; you can resume from saved progress.

Automation stops at **Resolution** for the analyst to record a conclusion or remaining uncertainties and complete the session. It does not approve a decision or complete the session on your behalf. **Run remaining phase** and single-SME contributions remain available for manual facilitation.


### Panel Room: prepare, run, review, follow up, export

1. In **Run → Panel Room**, choose a scenario, frame the question and context, and review the suggested SMEs. Choose **Start automatic debate** or **Open for manual facilitation**. The session list supports scenario/objective search, status and date filters.
2. Use the session tabs: **Overview**, **Debate**, **Findings & actions**, **Evidence**, and **Reports**. Automatic discussion stays active when switching room tabs; keep the browser open. The compact header shows the objective and current phase.
3. **Search this session** finds saved arguments, model positions, sources, findings, actions and analyst review notes. Open a match to see highlighted text and its origin; **Jump to this debate turn** opens the exact turn and surrounding phase. Debate filters select phase or SME; bookmarks and **Jump to latest** reduce scrolling. System events and straw-poll controls are collapsed by default.
4. After closing positions, review results before recording a resolution. **Generate results draft** proposes takeaways, disagreements, findings, threats, evidence-gap questions and follow-up actions. Each proposal must cite an exact saved quotation. Edit, accept or dismiss each item. Changed debate/source content requires regenerating unaccepted drafts; accepted items remain. Quotation matching proves provenance, not truth.
5. Use **Inspect evidence / capture** on any turn to read source passages and capture a relevant excerpt. Accepted findings/threats become session-linked records requiring evidence review. Actions need completion criteria and can verify, reduce risk or monitor. Questions are saved in Session Tracker’s open questions. Matching titles reuse existing records without overwriting them.
6. **Ask about this debate** uses the saved session and returns cited answers or an explicit insufficient-evidence response. Answers are model assistance; inspect the linked passages.
7. Record the analyst resolution and complete the debate. Completion opens the overview; it does not mark all findings verified or actions finished. Manage impact, verification and closeout in Session Tracker. **Reports → Panel Room reviewed results** exports the result list with selection status and quotations, alongside existing transcript, evidence, pulse and AI reports.
