# AgentDebate — User Guide

AgentDebate runs structured red-team sessions using a panel of AI expert agents. Each agent has a unique discipline, cognitive bias, and analytical focus. You set the scenario; they argue about it.

There are two ways to run a session:

- **Classic** — agents write full assessments in two rounds; you read and synthesize offline
- **Live Debate Room** — agents stream their responses in real time while you facilitate, ask follow-up questions, and surface threats on demand

---

## Getting started

### 1. Set your API key

Go to **Settings** to select and test your model connection. For MITRE AIP, the local server manages credentials. A working model connection is required for AI features.

### 2. Create domains

Domains are the subject-area buckets your agents belong to — think of them as disciplines or departments.

Go to **Domains → New Domain** and add categories relevant to your work, such as:

- Cybersecurity
- Supply Chain
- Human Factors
- Geopolitical
- Physical Security
- Legal & Compliance

Agents are tagged to one or more domains; domains are used to group and filter agents when building a panel.

### 3. Build your agent panel

Go to **Agents → New Agent**. Each agent needs:

| Field | What it does |
|---|---|
| Name | The agent's identity (e.g. "Dr. Elena Vasquez") |
| Discipline | Their expertise (e.g. "Cybersecurity — Offensive Operations") |
| Persona | How they think and what they prioritize |
| Cognitive Bias | What they systematically underweight or over-apply |
| Primary Focus | The specific threat class they hunt for |
| Severity Default | Their baseline risk calibration (CRITICAL / HIGH / MEDIUM / LOW) |
| Domain | Which domain(s) this agent belongs to |

**AI Generate** — paste a short description and the model will fill out a complete agent profile for you.

**Import from Markdown** — bulk-load agents from a `.md` file where each `##` heading is one agent. See [README.md](README.md) for the full import format.

The table above is the essentials. An agent can carry ~35 fields in total, including the advanced "optimal SME" dimensions — competence boundaries, analytic tradecraft, risk posture, and debate behavior — that make its reasoning more human-like. For the complete list of every field, what it means, and how each one influences the debate and the risk scores, see the [SME field reference](#appendix-sme-field-reference) appendix.

### 4. Define scenarios

Go to **Scenarios → New Scenario**. A scenario has a **name** and a **context document** — a plain-text description of the system, situation, or threat environment being assessed. The context document is injected into every agent's prompt, so write it like a briefing: what the system does, who operates it, what's at stake, and any known constraints.

**Example context document:**

> Acme Corp operates a hybrid cloud ERP platform serving 40,000 employees across 12 countries. The system processes payroll, procurement, and HR data. A planned migration from on-prem Oracle to Azure will run over 18 months starting Q3 2025. The migration team is 60% third-party contractors with mixed clearance levels.

---

## Classic sessions

Classic sessions run agents through two structured rounds and produce a synthesis report.

### Create a session

1. Go to **Sessions → New Session**
2. Choose **Classic** mode
3. Name the session and optionally add a phase focus (e.g. "Pre-launch risk window")
4. Select a scenario
5. Add agents to the panel
6. Click **Launch Session**

### Round 1 — independent assessments

Click **Generate All Round 1** to send all agents their initial assessment task simultaneously. Each agent independently evaluates the scenario through their disciplinary lens and returns:

- A full written assessment
- A severity rating (CRITICAL / HIGH / MEDIUM / LOW)

You can also click **Generate** on individual agent cards to run them one at a time, or **Regen** to retry a specific agent.

Agents with access to a **threat catalog** (see [Threat management](#threat-management)) will reference known threats by T-number in their assessments, flagging which catalog entries they've confirmed, escalated, or found inapplicable.

### Round 2 — cross-agent rebuttals

After Round 1, click **Generate All Round 2**. Each agent now reads the other agents' Round 1 assessments before writing their rebuttal. They can:

- Agree and reinforce another agent's finding
- Challenge an assessment with evidence from their own discipline
- Revise their severity rating up or down

This cross-pollination surfaces compound risks that no single agent would have caught alone.

### Synthesis

Once Round 2 is complete, go to the **Synthesis** tab and click **Generate Synthesis**. The synthesis engine:

1. Reads all Round 1 and Round 2 assessments
2. Identifies consensus findings and contested positions
3. Maps compound threat chains across disciplines
4. Surfaces blind spots where no agent flagged a vector
5. Formulates priority mitigations

The synthesis report can be printed directly from the browser using the **Print Report** button.

### THREATS tab — extracting and saving threats

After any session with at least Round 1 complete, go to the **Threats** tab inside the session workspace.

**Viewing scenario threats**

The top section shows all threats already assigned to the session's scenario. These are automatically fed into agent prompts in future sessions — agents reference them by T-number and validate, escalate, or dismiss each one.

**Extracting new threats**

Click **Extract Threats** to run an LLM analysis over the agent assessments. The model reads everything the agents wrote and returns a structured list of distinct threats, each with:

- Name
- Description (mechanism and impact)
- Severity
- Category

Threats are shown as selectable cards — all are pre-selected by default. Uncheck any you don't want to save. Click **Save N Selected** to write the chosen threats to the scenario's threat catalog. They will appear in future sessions automatically.

---

## Live Debate Room

The Live Debate Room runs a session in real time. Agent responses stream word-by-word as they're generated. You can interrupt, redirect, and question agents at any point.

### Starting a live session

**Option A — from the dashboard**

Click the **Live Debate Room** card (the dark one with the NEW badge). This opens the new session form with Live mode pre-selected.

**Option B — from New Session**

Go to **Sessions → New Session** and click the **Live** mode card in the mode picker.

### Session setup for Live mode

Fill in the session details:

- **Name** — the session name
- **Scenario** — which scenario to assess
- **Agents** — which agents join the panel
- **Phase Focus** — optional focus string appended to every prompt (e.g. "Focus on the 90-day post-merger window")

**Pinned source documents**

You can pin specific URLs that agents should treat as authoritative references. In the **Source Documents** section, add a URL and an optional label, then click **Add**. Examples:

- A threat intelligence report PDF
- An internal architecture document
- A regulatory guidance page

Pinned sources are listed in the debate sidebar so you can see them at a glance. Agents with tool use enabled will fetch these URLs automatically when relevant to a question.

Click **Enter Debate Room** to open the live session.

### The debate room interface

The room has three areas:

**Left sidebar** — agents, sources, status, and threats

- Each agent card shows their current status: Waiting / Thinking / Researching / Speaking / Done
- A pulsing green dot means an agent is actively streaming a response
- The **SOURCES** section lists your pinned URLs; click any to open it
- The **STATUS** indicator shows the current phase
- The **THREATS** section (when threats exist for the scenario) lists each threat with a **Surface** button

**Center panel** — live transcript

All messages appear here in order:
- System dividers mark phase transitions (Round 1, Round 2, etc.)
- Agent bubbles show the agent's name, discipline, severity rating (when available), and any research chips from tool calls
- Facilitator bubbles (your questions) appear right-aligned in amber

**Bottom input bar** — your controls

- **Agent selector** — choose to address all agents or direct your question at one specific agent
- **Question input** — type your question or paste a URL
- **Ask button** — sends the question; press Enter to submit

### Running rounds

Click **Round 1** in the header to start the first round. All agents stream their assessments simultaneously. The left panel shows which agent is currently speaking.

When Round 1 completes, a system divider appears in the transcript. Click **Round 2** to begin the rebuttal round — agents have now read each other's Round 1 output.

When Round 2 completes, click **Synthesize** to go to the Classic session view and generate the synthesis report.

### Asking questions

You can ask questions at any time — before, between, or after rounds.

- **Broadcast** — leave the selector on "All Agents" and every agent in the panel responds
- **Direct** — pick a specific agent from the dropdown; only they respond

Each agent's reply streams in as they generate it. If **Tool Use** is enabled, agents can go off to research before answering — you'll see a teal chip appear showing what they searched or fetched.

### Tool use

The **TOOLS ON/OFF** toggle in the header controls whether agents can access external information.

**Tools ON** — agents run an agentic loop. Before answering, they can:

- **Search** — query Wikipedia for relevant facts, definitions, or historical context
- **Fetch URL** — retrieve the content of any URL, including your pinned source documents

When an agent uses a tool, their status switches to **Researching** and a chip appears in their message showing what they looked up. After up to four tool iterations, they write their final answer incorporating what they found.

**Tools OFF** — agents answer purely from their trained knowledge and the session context. Faster, but no live research.

**Tip:** paste a URL directly into your question ("What does this say about our scenario? https://...") and the model will fetch and read it automatically when tool use is on.

### Surfacing threats from the sidebar

If threats exist for the session's scenario, they appear in the left sidebar under **THREATS**.

Click **Surface** next to any threat to pre-fill the question input with a directed prompt about that threat:

> *"Regarding the threat 'Insider credential harvesting': [description]. What are the implications for this scenario?"*

Edit the question if you want, then click Ask to send it to the selected agent(s). This is the fastest way to probe whether agents think a known threat is applicable — and to force a real-time debate about it.

---

## Threat management

Threats are structured risk entries tied to a scenario. They serve two purposes:

1. **Fed into agent prompts** — agents reference known threats by T-number in their assessments, validating or dismissing each one
2. **Surfaced in Live Debate** — the sidebar lets you instantly direct a question at any known threat

### Viewing the threat catalog

In any scenario workspace (or via the **Threats** tab in a session), you can see all threats currently assigned to a scenario.

### Extracting threats from a session

Go to a session's **Threats** tab and click **Extract Threats**. The model reads all agent assessments and returns a structured list. Review the results, deselect anything that's not useful, and save the rest. Saved threats are immediately available to all future sessions using that scenario.

### How threats appear to agents

In Classic and Live sessions, threats are injected into agent system prompts as a numbered catalog:

```
[T1] CRITICAL — Insider credential harvesting
[T2] HIGH — Third-party contractor access sprawl
[T3] MEDIUM — Unpatched legacy API endpoints
```

Agents are instructed to explicitly validate, escalate, or dismiss each T-number entry in their assessments, making threat catalog coverage traceable across rounds.

---

## Results and reporting

### Session results page

Click **Results** from any session workspace to view:

- **Systemic Critical Risk Score (SCRS)** — a live composite score derived from all agent severity ratings and consensus weighting
- **Consensus findings** — threats that multiple agents independently flagged
- **Contested positions** — where agents disagreed significantly
- **Agent breakdowns** — per-agent severity and key finding summaries

### What-If Simulator

Toggle countermeasures on or off and watch the SCRS update in real time. Use this to answer "how much does patching X actually move the needle?" before committing resources.

### Chain Breaker

Select any threat chain from the results view. The Chain Breaker tool shows:

1. The full chain of events from trigger to impact
2. The weakest link in the chain (highest disruption / lowest cost)
3. Defensive options at each step

### Print Report

From the Synthesis tab, click **Print Report** to open a print-formatted version of the full synthesis in a new browser tab. Use your browser's print dialog to save as PDF or send to a printer.

---

## Tips

**Mix disciplines deliberately.** A panel of five cybersecurity agents will agree with each other. Include at least one human factors, supply chain, or geopolitical agent to get genuine cross-disciplinary friction.

**Use phase focus to sharpen scope.** The phase focus field is appended to every agent prompt. "Focus on the 48-hour window following a public breach announcement" produces sharper output than leaving it blank.

**Seed the threat catalog before running sessions.** Create a few known threats for a scenario before running Round 1 — agents will explicitly validate or dismiss them, giving you coverage traceability from the first round.

**Surface threats early in Live Debate.** Hit Surface on your highest-severity catalog threats in the opening Q&A to get agent positions on the record before Round 2. Use Round 2 to let them challenge each other's positions.

**Save agent-discovered threats immediately.** After a strong session, go to the Threats tab and extract before you close the window. The model's extraction quality is highest when the assessments are fresh context.

**Tool use is best for specific questions.** Broad prompts ("assess everything") don't benefit much from research. Targeted questions ("what does current NIST guidance say about third-party contractor access controls?") get much better answers when tools are on.

---

## Appendix: SME field reference

An SME (agent) is a persona built from ~35 fields across nine groups. The richer "optimal SME" fields exist specifically to make reasoning human-like: knowing your limits, calibrating confidence, and moving honestly in debate. Most fields are optional — a sparsely-filled agent still works, it just reasons with less structure.

Bracketed values like **+18** are the points a field contributes to the Live Debate Room's floor-control score (who speaks next). "Persona header" means the field is injected into every debate prompt for that agent.

### 1. Identity & core

| Field | Type | Values / default | Meaning | How it's used |
|---|---|---|---|---|
| `name` | text · required | — | Display name of the expert | Everywhere; persona header opening line |
| `discipline` | text · required | — | Primary field (e.g. "Cybersecurity") | Persona header; floor-control relevance (**+18**) |
| `persona_description` | text | — | One-line character sketch | Persona header opening line |
| `professional_background` | text | — | Career history / credentials | Persona header |
| `role_type` | text | `sme` \| `red-team` \| `devil's-advocate` \| `facilitator` (def. `sme`) | Debate archetype | Floor control: contrarian/devil **+12**, challenger **+8** |
| `is_ai_generated` | bool | `false` | Whether AI-authored | Provenance badge |
| `domain_id` | uuid | — | Links the SME to a Domain | Filtering, Threat Map coverage |

### 2. Expertise & competence

| Field | Type | Values / default | Meaning | How it's used |
|---|---|---|---|---|
| `expertise_level` | enum | `Junior` \| `Mid-Level` \| `Senior` \| `Principal` \| `World-Class` (def. `Senior`) | Seniority tier | **SCRS base-score weight** (World-Class ×1.0 … Junior ×0.6); persona header |
| `domain_expertise` | jsonb map | `{ "topic": 0–10 }` | Self-rated fluency per sub-topic | Floor-control fluency score (hit × 3); persona "reason with confidence only where fluency is high" |
| `expertise_boundaries` | jsonb | `{ strong[], moderate[], weak[], defer_to[], forbidden_overreach }` | Declared lane — where strong, where to hedge, where to defer, what never to assert | Floor-control **relevance** (strong ×40) & **suppression** (weak −25, forbidden −45 + forces defer); persona "competence boundaries" |
| `tags` | text[] | `{}` | Free-form keywords | Floor-control soft relevance (**+8**); filtering |

### 3. Epistemics & analytic tradecraft

| Field | Type | Values / default | Meaning | How it's used |
|---|---|---|---|---|
| `reasoning_style` | enum | `Analytical` \| `Intuitive` \| `Contrarian` \| `Systematic` \| `Probabilistic` (def. `Analytical`) | How they argue | Persona header — shapes tone/argumentation |
| `epistemic_style` | text | — | How they treat evidence & certainty | Persona header |
| `analytical_framework` | text | — | Named method they apply | Persona header — "apply this method explicitly" |
| `source_preferences` | text | — | Evidence types they weight | Persona header — flags reliance on weaker sources |
| `tradecraft` | jsonb | `{ common_indicators[], common_false_positives[], failure_modes[] }` | What they look for, what fools them, how their discipline errs | Persona header self-check "before rating severity" |

### 4. Risk posture & adversary

| Field | Type | Values / default | Meaning | How it's used |
|---|---|---|---|---|
| `severity_default` | enum | `CRITICAL` \| `HIGH` \| `MEDIUM` \| `LOW` (def. `HIGH`) | Their prior before evidence | Persona "move off it only when warranted"; fallback severity when markers are missing |
| `risk_posture` | jsonb | `{ risk_sensitivity, false_negative_tolerance, false_positive_tolerance, escalation_bias }` | The false-positive / false-negative asymmetry that calibrates their ratings | Persona header — "calibrate your CONFIDENCE / LIKELIHOOD / IMPACT accordingly" |
| `adversary_model` | text | — | The threat actor they assume | Persona header |
| `decision_style` | text | — | How they commit to a call | Persona header |

### 5. Institutional context

| Field | Type | Meaning | How it's used |
|---|---|---|---|
| `institutional_background` | text | Org / sector they come from | Persona header |
| `institutional_incentives` | text | Pressures that bias them | Persona header |
| `conflict_triggers` | text | What they push back on hardest | Floor-control trigger (**+22**); persona header |

### 6. Cognitive bias & debiasing

| Field | Type | Meaning | How it's used |
|---|---|---|---|
| `cognitive_bias` | text | Their characteristic blind spot | Persona header (paired with debiasing) |
| `debiasing_instruction` | text | The countermeasure to apply deliberately | Persona header — the bias / debias **pair** |
| `red_team_focus` | text | The angle they attack from | Floor control (**+10**); persona header |

### 7. Debate behavior & belief update (drives Round 2)

| Field | Type | Shape | How it's used |
|---|---|---|---|
| `debate_behavior` | jsonb | `{ debate_role, rebuttal_style, what_changes_mind }` | Floor control (what_changes_mind **+10**, contrarian role **+12**); persona header (Round 2 only) |
| `update_triggers` | jsonb | `{ fast_when, slow_when, resistant_when }` | Persona header Round 2 — "move if genuinely persuaded, hold if not" |

### 8. Threat-vector emphasis

| Field | Type | Default | Meaning |
|---|---|---|---|
| `vector_human` | int 0–100 | 50 | Weight on human / social threats |
| `vector_technical` | int 0–100 | 50 | Weight on technical threats |
| `vector_physical` | int 0–100 | 30 | Weight on physical threats |
| `vector_futures` | int 0–100 | 40 | Weight on emerging / future threats |

Used by the Threat Map for bench-vs-landscape coverage.

### 9. Calibration, track record & meta

| Field | Type | Default | Meaning |
|---|---|---|---|
| `weighting_adjustment` | numeric | 1.0 | Declared multiplier to scale the SME's influence from track record |
| `historical_strengths` | jsonb[] | `[]` | Where this SME has been reliable |
| `historical_weaknesses` | jsonb[] | `[]` | Where it has erred |
| `quality_score` | numeric | — | Aggregate performance score (analytics) |
| `usage_count` | int | 0 | Times deployed in sessions |
| `source` | text | `workspace` | Origin of the persona |
| `is_library_sme` | bool | `false` | Shared-library flag (largely deprecated) |
| `cloned_from_id` | uuid | — | Lineage if duplicated |
| `scenario_tags` | jsonb | `[]` | Scenarios this SME suits |
| `id` / `workspace_id` / `created_by` / `created_at` / `updated_at` | — | — | System identity, tenancy, timestamps |

**Two things worth knowing:**

- **Only three fields directly touch the numbers.** `expertise_level` weights the SCRS base score; `risk_posture` and `severity_default` calibrate the likelihood / impact / confidence each SME emits. Everything else shapes *reasoning*, which then flows into those numbers.
- **Graceful degradation.** Every persona line is conditional, so a partly-filled SME still works — it just reasons with less structure. The `jsonb` fields default to `{}` / `[]` and never break a session.


## Token limits and evidence preservation

Token limits and evidence preservation: SME rounds request 4,096 output tokens; synthesis, comparison and decision briefs request 6,144. MITRE AIP retries output-limit failures at most twice with a larger allowance, up to the server-configured ceiling (8,192 by default). The input stays unchanged; incomplete text is replaced and never marked complete. Completed SME turns remain saved. Oversized synthesis and brief inputs use section reviews with exact-quote and section-coverage checks. These checks do not guarantee semantic equivalence; review original evidence and disagreements before accepting conclusions. If sections cannot fit or validation fails, the analysis stops explicitly. The knowledge retriever still selects relevant chunks; it does not send the entire library. Retry attempts take additional time and model usage. Provider context limits and output limits are different; verify model support before increasing LLM_MAX_TOKENS. Changes apply to newly generated steps; completed results are not rewritten.


## Verify findings and collect reviewed examples

Open Session Tracker → Verify findings to inspect model-assisted evidence strength. New guided analyses check findings after synthesis; existing sessions use Check new or changed findings. Inspect exact supporting and opposing passages, publication age, source quality and next checks. Add source text or retrieve HTML/plain text from an approved public URL. Scenario premises and generated SME agreement are not independent evidence. Changed checks are automatically rerun while this panel is open unless you clear the checkbox; this uses the configured LLM. Strong support is not a truth probability. Save your own per-claim judgment, rationale and exact quotations to collect analyst-reviewed examples. Export produces local JSONL and does not train or upload data. Prior checks remain available. Add verification follow-up creates an action in the selected session. See docs/VERIFICATION_AND_REVIEWED_EXAMPLES.md for rating rules, limits, dataset recommendations and the evaluation workflow.

## Single-analyst workflow

Use Session Tracker to manage your own findings, follow-up, evidence and conclusions. Threats, chains and mitigation lists use review status, rationale and evidence confidence. Follow-up actions use due dates, completion criteria and verification notes. In the expert panel, your transcript name and optional analytical focus describe your contributions; the remaining speakers are AI SMEs. Organize SMEs by domain from the SME library or Domains heatmap.

## Streamlined analyst workflow

The streamlined Session Tracker opens with a decision summary and the highest-priority unresolved findings. Review next finding opens a side panel with review status, confidence, analyst notes, decision impact, evidence verification and linked follow-up. Save and next moves through findings without leaving the session. The panel confirms before discarding unsaved review edits. Search and comparison tools are collapsed; comparisons appear only when an earlier completed debate exists. The analysis brief and suggested actions are available in Overview. Evidence contains the debate, live messages, and saved knowledge passages; Run details provides advanced controls.

Choose your session groups debates by scenario and shows the question, date, debate state and saved analyst-review state. Recent, Needs attention and Completed debates filters help narrow the list. Needs attention includes unfinished debates and sessions without a completed analyst review; the open dashboard checks whether saved reviews need reassessment. The last selected session is remembered.

Closeout notes autosave to the local database as a draft after a short pause. Saving, Saved and Failed feedback reports the result; Retry draft save is available after a failure. A browser copy protects pending edits. Save session review explicitly confirms the selected review state; autosave never completes a review.

Start session begins with the scenario, then the question and recommended SME panel. Saved context is included by default when available. Uncheck the context box to add session-specific information. Edit this scenario and Edit options, criteria, and assumptions open a drawer without losing the setup draft. Constraints, assumptions, threats/chains and source selection are optional disclosures. Source selection can use automatic retrieval or an explicit selection from Knowledge Base; an empty explicit selection uses no knowledge documents. Up to five matching passages enter a guided analysis. Evidence lists which selected sources contributed passages and shows the saved text. Verification can reuse a Knowledge Base document by reference, so edits to the original require rechecking; this does not establish its reliability.

The sidebar reports local server/database connectivity, not LLM health. Test the model connection in Settings. Tracker polling checks run status and reloads session material when progress changes; wider scenario material is fetched when its attachment controls are opened.


## Agent Debate, Panel Room, and Reports

AgentDebate now manages two distinct ways to work. Under Run, choose **Agent Debate** for guided analysis that continues on the Node server, or **Panel Room** for an interactive discussion that you facilitate in the browser. Both share scenarios, SMEs, Knowledge Base, Session Tracker, Session Summary, and Reports.

**Panel Room workflow**
1. Choose a scenario or standalone question, enter the objective and supporting context, then select Structured debate or Live discussion and a stance.
2. Review the suggested panel of 3–8 SMEs. Topic relevance and discipline diversity help select perspectives; the analyst reviews suitability.
3. In a structured debate, work through opening positions, cross-examination, evidence check, closing positions, and analyst resolution. Use Run remaining phase to automate the remaining turns, or invite one SME at a time. Advance deliberately; completing a phase does not establish consensus. Live discussion lets you ask questions without fixed phases.
4. Add analyst input as facts or questions become available. Each turn can retrieve up to three relevant Knowledge Base passages; expand the contribution to see the passages actually supplied. New sessions snapshot scenario context and SME profiles. Recent turns, selected earlier remarks, and persistent model positions guide subsequent responses; the complete saved transcript remains available in Reports.
5. Review SME positions and changes. Confidence is subjective model belief, not a measured truth probability. Updates are bounded per turn, and the display explains what evidence could change a position.
6. Record an analyst resolution, including unresolved disagreements when appropriate, and complete the session. This saves the conclusion into Session Tracker, but does not mark all findings or the entire session review as verified.
7. Open Reports, review the output, then use Session Tracker to record findings and follow-up.

Keep the browser open during Panel Room turns and report generation. Stop generation cancels the current request and retains completed saved turns. A failed contribution save blocks further turns and provides Retry saving contribution. Refresh resumes the last saved phase; there is no automatic restart of a model request.

**Shared Reports**
Choose a session from either mode, then select Session overview, Full debate record, SME positions and changes, Evidence and source context, Decision memo, or Mitigation and follow-up recommendations. The first four are built from saved records without a model call. AI reports are available after completion, review the full saved record using section review when necessary, and are saved as model drafts with model/time provenance. Regenerating replaces that report’s prior draft. Changes to the source record make the draft outdated. Mark report reviewed records your review; it does not verify every underlying claim or approve recommended actions. Download Markdown or Print / save PDF to share a report. No report automatically creates threats or mitigation actions.


## Visual debate room and Debate Pulse

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

### Cyber umbrella category

Cyber groups Enterprise IT and Digital Services and Tech Platforms. Select Cyber in the SME domain tree to include both children, or select a child to narrow the list. Domain management shows the same hierarchy and rolls child SME counts up to Cyber. Library totals count each SME once; umbrella and child counts overlap. Primary SME assignments remain in their child domains. Tech Platforms can remain empty until relevant SMEs are assigned.
