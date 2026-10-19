import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Shield, Bot, Target, Link2, Swords, FileText, Globe, Lightbulb, AlertTriangle, CheckCircle2, Map, Brain, BarChart2, Search, Zap, Users, Scissors, LayoutDashboard, GitBranch, BookMarked, ShieldCheck } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';

const sections = [
  {id:'session-tracker', icon:LayoutDashboard, color:'#F0A500', title:'Session tracker — your analyst dashboard', content:"\nSession tracker is the main analyst dashboard and the landing page after login. Select one session, then use the same five-step workflow throughout: Overview, Findings, Follow-up, Evidence, Closeout. The radio controls support keyboard navigation; labeled fields, checkboxes, cards and buttons share one visual style. Existing /mitigations bookmarks still open Session tracker. Explore and prioritize provides three tools throughout the selected session. Search this session searches saved SME responses, live-debate messages, findings, chains, follow-up, sources, synthesis, current scenario context, saved analysis inputs, and the current closeout draft. Enter words and choose a content type; expand a result to read its full saved record or open the relevant workflow step. Parent-analysis material is labeled as shared. Search does not fetch unsaved streaming text or other sessions’ debate records. What changed? compares an earlier completed debate in the same scenario, suggesting the most recent one for the same decision option. Select another baseline if needed. Inspect context, analyst conclusions, model synthesis, SME responses, messages, sources, and added, changed, or absent findings and actions. Records match by ID or unique exact name after case/whitespace normalization. Ambiguous or renamed findings stay separate. Absence does not mean resolution, and these are current saved records, not immutable historical snapshots. Decision impact ranks active unresolved findings by your assessment: could reverse the decision, could change its conditions, not assessed, then limited impact. Record the affected criterion, reasoning, what would change the conclusion, and evidence needed next. Save decision impact persists your assessment; resolution requires supporting evidence. Changed findings or conclusions require reassessment. Reviewed findings remain eligible: review is not resolution. Impact assessments are included in the downloaded session brief and changes invalidate a completed analyst review.\n\nOverview shows the next useful task, review counts, chains, open actions and overdue work. Open the synthesis or parent analysis brief, and use the progress notice beneath the session selector to follow a running analysis. The session selector discovers new debates about every eight seconds. Active dashboards refresh about every eight seconds; Refresh session retrieves current records on demand. Parent-analysis summaries may combine multiple option debates and are labeled accordingly.\n\nFindings shows records explicitly linked to the selected session, plus chains linked through its threats. Select records and apply a review status in one operation. Inspect evidence and interventions through links that retain session context. Shared parent-analysis findings appear separately. Existing scenario material without session attribution can be explicitly attached; the app never assumes two debates share findings merely because they use the same scenario. New threats extracted from the session workspace now retain their source session.\n\nFollow-up replaces the old action-only dashboard. Add a session-wide action or link one to a finding or chain; define observable completion criteria. Search and filter Open, Overdue or All. Edit the action, date, status, criteria, and completion evidence using the shared controls. Manage your follow-up with status, due dates, completion criteria and evidence. Marking Verified requires completion criteria and verification evidence. Verification does not automatically lower risk. Unattributed scenario actions are shown separately and can be attached when appropriate.\n\nEvidence contains saved round-one assessments, round-two rebuttals and source records for this session. Open the full debate in a new tab when more detail is needed. Sources and model perspectives require analyst verification.\n\nCloseout records your conclusion, decision or disposition, unresolved questions, revisit conditions, and accepted risks or deferred work. Local drafts are retained per session in this browser; Save session review persists them in the database. Review complete requires a completed debate, a conclusion and a decision. If findings or follow-up remain open, document the outstanding work and explicitly acknowledge it. A completed analyst review does not resolve every risk or close the debate's actions. Changes to linked material or scenario context flag a completed review for rechecking after refresh. Download session brief exports Markdown using the current closeout text, findings, chains, follow-up and synthesis, including unsaved edits.\n"},
  { id: 'risk-review', icon: ShieldCheck, color: '#2E86AB', title: 'Threats and chains — review, act, reassess', content: "\n\n\nOpen Threats or Chains and select a scenario. The selection carries into the other library and Session tracker in this browser and workspace. Search names, descriptions, categories; filter by domain; sort by severity, name or recent changes. Views include Needs review, High priority (threats), No mitigation, Overdue actions, Monitoring and Archived. The URL preserves filters and the selected finding for bookmarking and returning to your work. Lists show 40 records per page.\n\nSelect a row to review details without leaving the list. Existing records start as Needs review. Record your evidence confidence, rationale and review status. Confidence is distinct from severity and is not a measured probability. Marking Reviewed records the current scenario context and time. New evidence or edits require review again. Changed scenario context or actions implemented/verified after review raise a reassessment flag. Reviewed does not mean that a threat has been resolved.\n\nOpen source analysis or source debate links to inspect provenance. Evidence you add is labeled supplied_unverified; generated chain evidence is model output. Suggested duplicate names are only candidates. Compare records, choose the record to keep, then Merge and archive current. Evidence and relationships move transactionally; the archived original retains its content and points to the kept record. Merges stay within one scenario. Chains require identical steps to preserve action references; distinct paths should remain separate.\n\nSelect records individually or select the current page to set domains and review status in bulk. Archive via review status; records are retained. Partial failures keep failed records selected for retry.\n\nFrom a threat, Build linked chain opens the builder with its scenario and threat relationship. Each step can record enabling conditions, sources, uncertainties and existing controls. From a chain, Find intervention points opens Chain Breaker with that chain and scenario selected. Create intervention links an action to a specific step; Create mitigation links an action to the whole finding. Enter an action and observable completion criteria, then set a due date and status. Repeated saves of the same action title on the same finding/step reuse the existing action; a distinct title creates another. Chain steps with linked actions cannot be deleted, reordered or rewritten; preserve the path or create a separate chain for a revised path.\n\nSession Tracker under Manage in the sidebar organizes work by session. Its Follow-up step provides Open, Overdue and All filters. The selected session shows progress while running and a Resume analysis button after failure. A Preparing your session card appears before a debate exists; other failures remain visible for attention. Completed analyses have no separate progress section. Implemented actions remain open until verified or rejected. Due dates are informational; the app does not send notifications. An action's completion does not automatically reduce severity or prove control effectiveness. Reassess through Analyze with SMEs.\n\nStart session offers Threats and chains to examine. Use relevant suggestions (scenario, domain and keyword matching), search, and check up to 30 of each type. Only checked findings enter the debate; selected chains are included in both rounds. Review the selection whenever the scenario changes. Archived or missing selected findings must be replaced. The snapshot includes selected records so changes to their content, evidence or review state invalidate reuse.\n\nCompleted guided analyses automatically save the brief's top findings and synthesis chains into Needs review. These are model proposals; severity remains unassessed for extracted brief findings until you assess it. Review threats and Review chains links lead from results to the library. Repeated worker resumes do not duplicate the same generated findings. Duplicate suggestions help reconcile findings from different analyses. The queue captures the brief's top findings, not every claim in the transcript; use the full debate for a comprehensive review. Existing completed analyses are not retrospectively imported.\n" },
  {
    id: 'guided-analysis', icon: Target, color: '#27AE60', title: 'Start session — from a question to action',
    content: `
Open **Start session** under **Run** in the sidebar. This is the recommended path for a new analysis. Expand Advanced: manual or live facilitation on this page for facilitated, live, and manually controlled debates. Guided debate pages are read-only transcripts; their run controls live on Analysis progress and brief.

**1. Describe the problem.** Choose **Find risks**, **Challenge a plan**, or **Compare options**. Write the question you need answered, select an existing scenario or supply context, and state constraints and assumptions. Draft setup is saved in this browser for the current workspace. Supporting information should name its source and distinguish facts from assumptions. In **Context and supporting information**, check **Context and supporting information is included in the scenario** to use the selected scenario as written. Leave it unchecked to enter additional context for this analysis; this does not change the saved scenario. The reminder appears as placeholder text inside the context text box. The checkbox is always visible and becomes available when the selected scenario has saved context. Switching scenarios resets the checkbox so you can review the new selection.

For a comparison, select an existing decision or enter two to six distinct options with descriptions. Acceptance criteria are required: say what an acceptable option must achieve. Existing options, assumptions, and criteria can be edited from the linked Decision page. A partially saved setup remains in Scenarios or Decisions if a later save fails; inspect it before retrying.

**2. Review the panel.** The app suggests up to five existing SMEs using topic matches and different disciplines. Each suggestion explains its selection. This is a local matching rule, not another LLM call. Keep three to eight SMEs, remove unsuitable suggestions, or search for replacements. A suggestion with no direct topic match needs particular review.

Token limits and evidence preservation: SME rounds request 4,096 output tokens; synthesis, comparison and decision briefs request 6,144. MITRE AIP retries output-limit failures at most twice with a larger allowance, up to the server-configured ceiling (8,192 by default). The input stays unchanged; incomplete text is replaced and never marked complete. Completed SME turns remain saved. Oversized synthesis and brief inputs use section reviews with exact-quote and section-coverage checks. These checks do not guarantee semantic equivalence; review original evidence and disagreements before accepting conclusions. If sections cannot fit or validation fails, the analysis stops explicitly. The knowledge retriever still selects relevant chunks; it does not send the entire library. Retry attempts take additional time and model usage. Provider context limits and output limits are different; verify model support before increasing LLM_MAX_TOKENS. Changes apply to newly generated steps; completed results are not rewritten.

Open Session Tracker → Verify findings to inspect model-assisted evidence strength. New guided analyses check findings after synthesis; existing sessions use Check new or changed findings. Inspect exact supporting and opposing passages, publication age, source quality and next checks. Add source text or retrieve HTML/plain text from an approved public URL. Scenario premises and generated SME agreement are not independent evidence. Changed checks are automatically rerun while this panel is open unless you clear the checkbox; this uses the configured LLM. Strong support is not a truth probability. Save your own per-claim judgment, rationale and exact quotations to collect analyst-reviewed examples. Export produces local JSONL and does not train or upload data. Prior checks remain available. Add verification follow-up creates an action in the selected session. See docs/VERIFICATION_AND_REVIEWED_EXAMPLES.md for rating rules, limits, dataset recommendations and the evaluation workflow.

**3. Check readiness and run.** The readiness screen blocks missing essential context, invalid panels, incomplete options, and missing acceptance criteria. It also highlights missing constraints and assumptions. Click **Run analysis in background** once. The server uses its configured MITRE AIP model and automatically retrieves relevant knowledge-base excerpts.

**4. Return to the results.** The Node server runs both rounds, synthesis, the option comparison when applicable, and a concise decision brief. Closing or refreshing the browser does not stop it. The computer, PostgreSQL, and Node server must remain available. After a server restart, interrupted running jobs are queued again; completed SME responses are preserved. Failed or stopped jobs offer **Resume saved inputs**. An unfinished model request may need to run again. **Stop analysis** cancels remaining work without deleting saved progress.



**Follow analysis progress.** The progress card reports saved SME responses, completed syntheses, option comparison, the decision brief and final saving. Its percentage counts work units, not time remaining. The panel table distinguishes saved responses, the currently responding SME, and work still waiting. For comparisons, select a debate to inspect each option; reused debates are labeled. Elapsed time includes queue time and pauses. The page refreshes about every three seconds. A long model request is shown separately from a failed status refresh; server connectivity does not prove that the model is making progress.

**Watch the debate when useful.** Click **View debate as it develops** to read completed responses without leaving the analysis. Filter by round and expand an SME response or the synthesis. Text appears after each response is saved; it is not token-by-token streaming. Early conclusions are provisional. This view is read only and does not trigger additional LLM calls. **Open full debate in new tab** keeps the progress page available. Failed and stopped runs retain saved responses; resume continues unfinished work.

**5. Understand the conclusion.** Read the three most important findings, practical impact, unresolved disagreements, and information that could change the conclusion. Comparisons may recommend an option, reject every option, or require more information. No option is forced to win. The full debate and saved evidence remain available below the brief.

Evidence labels distinguish **supplied evidence**, **model inference**, and **assumption**. Quotation links are retained only when the quoted text occurs in the referenced saved source. A matching quote does not prove the source is true or that the inference follows from it. Personas using the same model are not independent experts, and model confidence is not a measured probability.

**6. Act.** Review a proposed next step and click **Save suggested follow-up**. It starts as proposed. Set a due date, measurable completion criteria, completion evidence, and status, then click **Save action** in Session Tracker. Repeated clicks do not create duplicate actions. These are the same mitigation records used in the associated session. Move through accepted, in progress, implemented, and verified only as human work supports those states. Due dates help organize your work; they do not send notifications.

**7. Reassess changes.** The saved input snapshot records the scenario, criteria, assumptions, selected personas, relevant knowledge, selected threats and chains, model, and workflow version. A warning appears when current inputs differ. **Resume saved inputs** continues the old snapshot; **Review current inputs and reassess** evaluates the current records. Unchanged option assessments can be reused; changed inputs or edited evidence cause fresh assessment. The final comparison and brief are generated again. The results show what inputs changed and the previous conclusion alongside the current one. Record the final human choice on the linked Decision page.

Running and failed analyses appear on Session Tracker under Analysis progress; completed and stopped analyses are in its expandable history. Open one to resume, read results, or update its actions. Background work runs one job at a time on this local server. Earlier browser-managed sessions remain available through Sessions; they do not become background jobs automatically.
    `,
  },
  {
    id: 'what-is',
    icon: Globe,
    color: '#F0A500',
    title: 'What is AgentDebate?',
    content: `
AgentDebate is a **structured red-teaming platform** — a systematic way to stress-test plans, strategies, or decisions by simulating how adversaries, disruptors, or unexpected forces might exploit weaknesses.

Think of it like a **chess grandmaster reviewing a game before it's played**. Instead of reacting to problems after they happen, AgentDebate assembles a panel of expert "thinking styles" — called SMEs — and forces them to imagine every way things could go wrong, from every angle simultaneously.

The core insight: **no single expert sees everything**. A cybersecurity specialist thinks differently than an economist, who thinks differently than a geopolitical analyst. AgentDebate structures a conversation between these perspectives so blind spots become visible before they become crises.

**What AgentDebate is NOT:**
- It's not a chatbot. It's a structured analytical framework.
- It's not a prediction engine. It surfaces risk — it doesn't forecast futures.
- It's not a replacement for human judgment. It's a tool to sharpen it.
    `,
  },
  {
    id: 'workflow-map',
    icon: LayoutDashboard,
    color: '#27AE60',
    title: 'The Workflow at a Glance',
    content: `
The sidebar separates managing session results from preparing and running debates. Click the AgentDebate logo at any time to return to Session Tracker.

**Manage** — **Session Tracker**, your dashboard for reviewing findings, following up, inspecting evidence, and recording session conclusions.

**Prepare** — **Scenarios** (the situation to stress-test) and **Decisions** (the choice, options, and acceptance criteria).

**Run** — **Start session** is the single entry point for new work. Expand **Advanced: manual or live facilitation** there when needed. Open **Session history** from Session Tracker to browse existing debates.

**Library** — the reusable assets a session draws on: **SME** (your expert panel), **Domains** (broad categories), **Threats** (known risks), **Chains** (kill chains), the **Knowledge Base** (your own documents that ground the analysis), and **Prompt Library**.

Inside a session, a stepper walks the analysis lifecycle in order, and a **Next Step** bar always shows the one thing to do now:

**Setup → Round 1 → Round 2 → Synthesis → Findings → Act.** Findings holds the kill chains and threats the panel surfaced. Act holds this session's mitigations plus the tools that work them: **Chain Breaker** (mitigation roadmaps), the **What-If Simulator** (toggle countermeasures against the risk score), and the **Decision Brief** (executive report). Sources and Settings sit to the right of the stepper.

**Insights** is a collapsible group containing **Threat Map**, **SME Analytics**, and **Compare Sessions**. It opens automatically when one of those pages is active. Settings and this guide remain in the footer, while the menu scrolls on shorter screens.
    `,
  },
  {
    id: 'concepts',
    icon: Lightbulb,
    color: '#2E86AB',
    title: 'Core Concepts',
    subsections: [
      {
        icon: Globe,
        color: '#F0A500',
        title: 'Domains',
        body: `Open **Domains** to see the **SME distribution heatmap**. Each tile represents one domain and shows its assigned SME count and percentage of all SMEs in the library. The fixed color bands are 0, 1–5, 6–15, 16–30, and 31+ SMEs. Color means quantity, not expertise or adequacy. SMEs without a domain, including broken domain references, are counted separately.

Search or filter for empty domains and small groups, and sort by SME count or name. Select a tile to see its SMEs. Use **Manage list** for a compact table with edit and delete controls.

To organize SMEs, open a domain or **SMEs without a domain**, search the SME list, select individual profiles or the current page (50 at a time), choose an existing destination domain, and move the selection. Selections persist across SME searches and pages; the selected count is shown before saving. Personas remain unchanged. Partial failures are reported and failed SMEs remain selected for retry.

**Domain cleanup** contains the optional discipline-sync preview and duplicate-name review. Duplicate merging transfers linked SMEs, scenarios, threats, chains, and sessions before removing duplicate domains. Deleting a domain with linked records is blocked; reassign those records first. New and edited names are checked for duplicates, ignoring case and extra spaces.

Domains are **organizational categories** — the broad buckets that your work, threats, and SMEs live inside. Think of them like departments in a university: "Cybersecurity," "Geopolitics," "Supply Chain." They keep everything organized and color-coded, and they are the **connective tissue of the platform**: the Threat Map, coverage analysis, and SME filtering all link threats to SMEs through their shared domain.

**Set these up first.** Everything else (SMEs, scenarios, threats) can be tagged to a domain — and an untagged threat or SME is invisible to the Threat Map's coverage analysis.

**Keep domains broad.** Aim for 10–15 wide buckets ("Critical Infrastructure & Industrial Resilience") rather than one domain per specialty. Broad domains let you group many SMEs and threats together, which is what makes the map and coverage views readable.

**Sync from SMEs.** If your SMEs have disciplines but no domains, the "Sync from SMEs" button on the Domains page derives domain candidates from SME disciplines. A **preview popup** shows every domain that would be created — with a checkbox per domain and the number of SMEs it would receive — before anything is written to the database. Uncheck any junk candidates, then confirm. Nothing is saved until you do.`
      },
      {
        icon: Target,
        color: '#27AE60',
        title: 'Scenarios',
        body: `A Scenario is the **situation you want to stress-test**. It's your "what if" — the plan, decision, operation, or environment you're worried about.

Think of a scenario like the **brief given to a war game team**: "We are deploying a new LNG terminal in the Gulf of Aden. The context is X, the timeline is Y, and the constraints are Z."

The richer your scenario context document, the more targeted and useful the SME assessments will be. Use the AI Assist feature to expand a rough description into a full operational context document.

A scenario has a **status** (draft → active → archived) so you can track which ones are live.`
      },
      {
        icon: Bot,
        color: '#9B59B6',
        title: 'SME',
        body: `SMEs are **expert thinking archetypes** — personas that embody a specific discipline, cognitive style, and set of biases.

The analogy: imagine hiring a panel of consultants for a day. One is a former counterintelligence officer. One is a supply chain economist. One is a futurist. Each one looks at the same situation through a completely different lens. An SME in AgentDebate captures that lens.

Each SME has:
- **Discipline** — their professional identity (e.g., "HUMINT Officer," "Critical Infrastructure Engineer")
- **Domain** — the broad category they belong to (links them to threats on the Threat Map)
- **Persona Description** — who they are and how they think
- **Cognitive Bias** — what they systematically over- or under-weight (this is deliberate — biases create diversity of view)
- **Red Team Focus** — what specific threats they're hunting for
- **Vector Weights** — how much they emphasize Human, Technical, Physical, and Futures dimensions (0–100 each)
- **Default Severity** — their baseline risk posture (CRITICAL / HIGH / MEDIUM / LOW). This is the colored pill on the SME card. It is NOT a rating of the SME — it describes how alarmed this persona tends to be, and it is used as their fallback severity in debate rounds if a response doesn't declare one. Hover the pill for a full explanation.
- **Extended persona fields** — epistemic style, institutional background, conflict triggers, decision style, adversary model, institutional incentives, and analytical framework. These are injected into the debate prompts, so the richer they are, the more distinct and realistic each SME's voice becomes.

You can build SMEs manually, generate them with AI, or import batches from a formatted Markdown file. You can also **create a new SME directly inside the session builder** using the "+ New SME" button — it saves to your SME library and is immediately selected for the session.`
      },
      {
        icon: AlertTriangle,
        color: '#C0392B',
        title: 'Threats',
        body: `Threats are **named risk items** — specific, catalogued dangers associated with a scenario or domain. Think of them as entries in a risk register: "Supply chain compromise via tier-3 vendor," "Insider threat during transition period."

Threats live in the library and can be tagged, categorized, and linked to scenarios. They can also be AI-generated from a scenario context document. Threats are the *what* — SMEs assess the *how bad* and *why it matters*.

**Give every threat a Domain and a Category.** The Domain links it to the SMEs who can analyze it (this powers the Threat Map and coverage analysis); the Category groups it with similar threats (these become the heatmap columns). A threat without a domain shows up in the map's "Unassigned" row until you assign one.`
      },
      {
        icon: Link2,
        color: '#7B2D8B',
        title: 'Chains',
        body: `Chains are **compound multi-step sequences** — a structured narrative of how a threat unfolds over time, across multiple actors and disciplines.

The analogy: a Chain is like a **kill chain or attack tree**, but written in plain language. "Step 1: An insider with finance access exfiltrates procurement data. Step 2: A competitor uses that data to undercut bids. Step 3: Revenue erosion triggers a workforce reduction. Step 4: Key technical staff leave, creating a capability gap."

Each step can be attributed to an SME or labeled freely. Chains can be built manually or AI-generated from a scenario.

**Chains are automatically extracted from synthesis.** When you generate a synthesis report, AgentDebate parses out any compound threat chains identified by the AI and saves them directly to your chain library — tagged to that session and scenario. You don't need to do anything manually.

**Chains are now generated as true kill chains.** Each step is an adversary action with an explicit "enabled by" precondition tied to the previous step, so the chain reads as a dependency sequence a defender can attack: break any one step and the chain stops. Feed a chain into the **Chain Breaker** (next section) to turn it into a prioritized mitigation plan.`
      },
      {
        icon: Swords,
        color: '#2E86AB',
        title: 'Sessions',
        body: `Sessions are where the **live red-teaming actually happens**. A session brings together a Scenario and a selected group of SMEs to run a structured multi-round analysis.

Think of a Session like a **formal analytical war game**:
- You pick your scenario (the situation)
- You pick your panel (the SMEs)
- You run them through structured rounds of analysis
- You synthesize what they found

Sessions have two modes:
- **Classic Analysis** — structured two-round written assessment with synthesis
- **Live Debate** — real-time streaming debate where SMEs respond to each other turn by turn, and you can interject with facilitator questions

Sessions track a **status** as they progress: pending → round1 → round2 → complete.`
      },
    ]
  },
  {
    id: 'workflow',
    icon: Swords,
    color: '#D68910',
    title: 'Running a Session: Step by Step',
    steps: [
      {
        num: '01',
        title: 'Create a Session',
        what: 'Name the session, select a Scenario, optionally set a Phase Focus (e.g., "design phase," "deployment week"), and choose which SMEs will participate. You can select SMEs from your library or click "+ New SME" to create and add one on the spot.',
        system: 'AgentDebate creates a Session record and a SessionAgent record for each selected SME, all initialized to "pending" status. New SMEs created here are simultaneously saved to the SME library and added to the session.',
        tip: 'Choose SMEs with diverse vector weights. If all your SMEs are Technical-heavy, you\'ll miss human and geopolitical risks. Use the AI Recommendations feature to get suggestions tuned to your scenario.'
      },
      {
        num: '02',
        title: 'Generate Round 1 — Independent Assessments',
        what: 'Click "Generate All Round 1" to run all SMEs, or click the individual generate button on any SME card to run just that one. Already-completed SMEs are never re-run — "Generate All" only processes SMEs that don\'t yet have a Round 1 assessment.',
        system: `For each SME that needs generation:
1. Sets the SME's status to "generating_r1"
2. Constructs a detailed prompt using the SME's persona, cognitive bias, red team focus, the scenario context document, phase focus, and any pinned chains
3. Sends this prompt to Claude (Anthropic's AI model) via streaming
4. The model responds in character — a structured assessment with findings, assumptions, inline source citations, a severity rating, a **likelihood and impact band (1–5 each)**, and a **calibrated confidence score (0–100)**. If you've added Knowledge Base documents, the most relevant passages are injected into the prompt first, so the assessment is grounded in your material.
5. The assessment, severity, likelihood, impact, and confidence are saved; status updates to "r1_done"
6. When the last SME completes manually (without using Generate All), the session status auto-advances to "round1"

SMEs do NOT see each other's assessments in Round 1. This ensures independent thinking before cross-pollination.

**Two things each Round 1 assessment now includes by design:**
- **A cross-domain handoff** — every SME must name the OTHER discipline whose interaction with their findings worries them most and pose a direct question to that expert. This plants the hooks that Round 2 turns into compound risks.
- **A confidence score** — the SME's calibrated self-assessment (85+ only with direct evidence or deep expertise, 50–70 when extrapolating outside their domain, below 50 when speculating). Shown as a pill next to the severity badge.`,
        tip: 'Richer scenario context documents produce sharper, more targeted assessments. Use AI Assist on your scenario first. Watch the confidence pills: a CRITICAL rating at 40% confidence is a flag to dig in, not a settled finding.'
      },
      {
        num: '03',
        title: 'Review Round 1 Results',
        what: 'Read each SME\'s independent assessment. Look for overlapping concerns (consensus signals) and stark disagreements (contested areas — often the most interesting).',
        system: 'Nothing runs automatically here. This is a human review step. You can edit any assessment manually, regenerate individual SMEs, or leave them as-is before proceeding.',
        tip: 'SMEs that share very different severity ratings for similar threats are flagging genuine uncertainty — that\'s valuable intelligence.'
      },
      {
        num: '04',
        title: 'Generate Round 2 — Cross-Examination',
        what: 'Click "Generate All Round 2." Each SME now reads what every other SME found in Round 1 — including their severity and confidence — and produces a rebuttal that revises, reinforces, or challenges. Same smart skip logic applies: already-completed SMEs are never re-run.',
        system: `For each SME:
1. Compiles all other SMEs' Round 1 assessments (with their severity and confidence) into a single "others" block
2. Requires an **interaction risk** as the headline: one compound risk that exists ONLY because this SME's domain interacts with another's — a risk neither would list alone — with the coupling mechanism spelled out step by step
3. Asks who they most agree with, who they most disagree with (and where that SME's rating looks miscalibrated), and whether their own severity changes
4. The model responds with a revised severity, a **recalibrated confidence** (corroboration raises it, credible contradiction lowers it), the interaction risk, and a compound chain
5. All results saved; when the last SME completes, session status auto-advances to "round2" and synthesis is triggered automatically`,
        tip: 'The interaction-risk section is the whole point of the platform — it surfaces the risks a single-domain review can never see. If an SME\'s Round 2 doesn\'t name a genuine cross-domain coupling, that\'s a sign the panel lacks the right adjacent expertise.'
      },
      {
        num: '05',
        title: 'Generate Synthesis',
        what: 'Click "Generate Synthesis." AgentDebate reads all Round 1 and Round 2 assessments and produces a single consolidated report. This also runs automatically when Round 2 completes.',
        system: `AgentDebate sends all SME assessments (with their severity and confidence) to Claude with instructions to act as a senior analytical director. The model identifies:
- Compound chains (kill chains — how threats chain together, each step enabling the next, across disciplines)
- **Cross-domain interaction risks** — the core deliverable: risks that exist only because two or more domains interact, drawn from the Round 2 interaction findings. If none emerged, the synthesis flags that as a process failure
- Consensus findings (weighted by confidence — high-confidence agreement counts for more than hedged agreement)
- Contested findings (where SMEs disagree, noting each side's confidence)
- Blind spots (what was conspicuously absent)
- Priority mitigations (what to address first)
- Sharpest insights (the most incisive individual observations)

The synthesis is saved as a SessionSynthesis record, the session status moves to "complete," and any compound chains found are automatically saved to the chain library tagged to this session.`,
        tip: 'The synthesis is a starting point, not a final verdict. Use it to structure a human debrief. You can regenerate it at any time — re-running will update the existing synthesis record.'
      },
    ]
  },
  {
    id: 'decision-support',
    icon: GitBranch,
    color: '#27AE60',
    title: 'Decision Support & Quantified Risk',
    subsections: [
      {
        icon: GitBranch,
        color: '#27AE60',
        title: 'Framing a Decision & Comparing Options',
        body: `Analysis is most useful when it's tied to a **decision**, not just a scenario. The **Decisions** page (sidebar → Work) frames a design choice: the question, the **options** you're comparing (2–4), the **acceptance criteria**, and the **assumptions** it rests on.

**How it works:**
- Create a Decision and list the options (e.g. "Option A: managed identity provider" vs "Option B: build in-house").
- Open the decision, pick the **scenario** to stress-test against and the **expert bench**, and click **Run decision panel**. The same bench runs Round 1 → Round 2 → Synthesis against *every* option, each in its own session, with the decision framing and assumptions injected into every prompt.
- When the sessions finish, the panel writes a **reasoned recommendation**: which option, how confident, and why — each reason citing SMEs, severities, confidences or synthesis findings. Every option card gets a verdict (recommended / viable / not recommended), its key risks, whether it meets the acceptance criteria, which assumptions it puts at risk, and the risk you'd knowingly accept by choosing it. Trade-offs and "revisit if" conditions round it out.
- Track **key assumptions** with a criticality and a status (holds / monitoring / **invalidated**). An invalidated assumption is your trigger to re-run.
- Click **Record Decision**: the rationale is pre-filled from the assessment; edit it, pick the option, and capture who decided. That's a durable, auditable decision record.

Options that already have a complete session are reused on the next run, so adding an option or fixing one that failed doesn't redo the others. **Regenerate** re-writes the assessment from the existing sessions; **Re-run everything** starts fresh.`,
        usage: `
1. Sidebar → Decisions → New Decision. Name the choice and list 2–4 options.
2. Add the assumptions the decision depends on.
3. Open the decision, choose a scenario and bench, and click Run decision panel. Wait for the recommendation.
4. Read the recommendation and each option's verdict, key risks and accepted risk.
5. Click Record Decision, adjust the pre-filled rationale, and pick the option.
`
      },
      {
        icon: BarChart2,
        color: '#C0392B',
        title: 'Quantified Risk — Likelihood × Impact',
        body: `Severity (CRITICAL/HIGH/…) tells you *how bad*, but not *how likely*. Every assessment now also carries a **likelihood (1–5)** and **impact (1–5)** band, giving a **risk score of 1–25** you can sort and compare.

- **Likelihood**: 1 Rare · 2 Unlikely · 3 Possible · 4 Likely · 5 Almost Certain
- **Impact**: 1 Negligible · 2 Minor · 3 Moderate · 4 Major · 5 Severe
- **Risk score** = likelihood × impact, mapped to the standard 5-zone matrix (15+ critical, 9+ high, 4+ medium, else low)

Each assessment card shows an **L×I=score** chip. At the top of each round, a **Risk Matrix** plots every SME's top risk on the 5×5 grid, with the **peak risk** and a **confidence-weighted average exposure** — so a high-consequence, high-likelihood, high-confidence risk sorts above a hedged one. Threats in your catalog can carry likelihood/impact too. This is what makes per-option comparison in Decisions a real number, not a label.`,
        usage: `
1. Run a session — SMEs now emit likelihood and impact with their severity.
2. Read the Risk Matrix at the top of each round: the top-right zone is your worst risk.
3. Use peak risk and average exposure to compare rounds, options, and sessions.
`
      },
      {
        icon: BookMarked,
        color: '#2E86AB',
        title: 'Knowledge Base — Grounding Analysis in Your Documents',
        body: `By default, SMEs reason from their persona and general knowledge — which is why some cite little in the evidence ledger. The **Knowledge Base** (sidebar → Library) fixes that: add your own **design docs, incident postmortems, standards, and prior assessments**, and the analysis is grounded in *your* material.

**How it works:**
- Paste or upload (.txt/.md) a document. It's **chunked** and indexed on ingest.
- At analysis time, the most relevant chunks for the scenario are **automatically retrieved and injected** into every SME's prompt as an "Organizational Knowledge Base" block, with instruction to cite them.
- Those citations then show up in the **SME Evidence Ledger**, so the analysis is traceable to your documents rather than to general training knowledge.
- In Live Debate, the SMEs' knowledge-search tool also checks your Knowledge Base first.

The more you put in, the more grounded — and defensible — the assessments become.`,
        usage: `
1. Sidebar → Knowledge Base → Add Document. Paste or upload the text.
2. Run a session as normal — retrieval happens automatically.
3. Open the SOURCES tab (By SME) and confirm SMEs cited your documents.
`
      },
    ]
  },
  {
    id: 'chain-breaker',
    icon: Scissors,
    color: '#C0392B',
    title: 'Chain Breaker & Mitigation',
    subsections: [
      {
        icon: Scissors,
        color: '#C0392B',
        title: 'Turning a Kill Chain into a Defense Plan',
        body: `The **Chain Breaker** (open a session → Act stage → Chain Breaker) takes any compound chain and works out where a defender should intervene, in what order, and what each intervention costs.

The governing principle: **an attacker must complete every step, but a defender only has to break one.** So the tool hunts for the cheapest, most reliable place to cut — and it distinguishes steps the adversary can route around from true chokepoints they can't.

For each step it assesses:
- **Adversary objective** and **dependencies** (what must already be true)
- **Leverage** — how much breaking this step sets back the whole chain
- **Chokepoint** — flagged when the adversary has no realistic alternate path; cutting a chokepoint collapses the chain
- **Detectability** — how visible the step is with typical instrumentation (Observable / Partial / Stealthy)
- **Countermeasures** — each tagged with its control type (Preventive / Detective / Responsive), effort (Low / Medium / High), and time to deploy (Days / Weeks / Months)
- **Residual risk** — what still gets through even after those controls`,
        usage: `
1. Run at least one session so chains are extracted, or build a chain manually on the Chains page.
2. Go to **Chain Breaker** and select a chain.
3. Click **Run Analysis** — the tool dissects every step.
4. Read the **"Cut here first"** callout: the single best place to break the chain.
5. Work the **Mitigation Roadmap** top to bottom — it's already prioritized.
6. Click **Generate Report** for a print-ready PDF of the whole analysis.
`
      },
      {
        icon: Shield,
        color: '#27AE60',
        title: 'The Mitigation Roadmap',
        body: `Below the step-by-step analysis, the Chain Breaker produces a consolidated **Mitigation Roadmap** — the actionable payoff.

- **"Cut here first"** names the single highest-value first move (a high-leverage chokepoint that's cheap and fast to defend) with the rationale.
- The **roadmap** is a deduplicated, priority-ordered action plan. Countermeasures that recur across several steps are merged into one action, each tagged with control type, effort, time to deploy, **which steps it breaks**, and the effect on the adversary ("collapses the chain — no alternate path" vs "forces a noisier, slower approach").
- **Quick wins** are surfaced separately: low-effort, fast countermeasures you can start immediately.

The result is a prioritized list for your mitigation planning. It's included in the printed report.`
      },
      {
        icon: ShieldCheck,
        color: '#27AE60',
        title: 'The Mitigation Register — Closing the Loop',
        body: `A roadmap is a plan; the session's **Mitigation Register** (open the session → Act stage) tracks it to completion and shows your **net** risk.

- Breaking the kill chains under Findings generates mitigations automatically. On any Chain Breaker roadmap item, click **"+ Register"** to add it too. Inherent risk is seeded from the leverage of the steps it breaks.
- In the register, review your next steps and move each item through its lifecycle: proposed → accepted → in progress → implemented → verified (or rejected).
- Re-score **residual risk** (likelihood × impact) in the row once a control is in place. The register then shows **Net Risk Reduction** — summed inherent → residual across this session's mitigations.

This closes the loop: instead of "here are risks," you can show "here's the risk, here's what we're doing about it, here's who owns it, and here's the residual after mitigation" — which is exactly what governance and audit ask for.`,
        usage: `
1. Under Findings, break the kill chains — or run Chain Breaker and click "+ Register" on the roadmap items you'll act on.
2. Open the Act stage, plan your follow-up, and update status as work progresses.
3. Set residual likelihood × impact in the row once a control is implemented.
4. Report the Net Risk Reduction figure to stakeholders.
`
      },
    ]
  },
  {
    id: 'live-debate',
    icon: Zap,
    color: '#F0A500',
    title: 'Live Debate Mode',
    subsections: [
      {
        icon: Zap,
        color: '#F0A500',
        title: 'What is Live Debate?',
        body: `Live Debate is the **real-time alternative to Classic Analysis**. Instead of structured rounds, SMEs respond to each other in a flowing conversation — more like a panel discussion than a formal assessment.

Choose Live Debate when you want:
- Dynamic back-and-forth between SMEs (not just independent assessments)
- A facilitator-directed conversation where you can interject, redirect, and challenge
- An observable, streaming experience where you watch SMEs think in real time

**How it works:** You start the debate, SMEs take turns responding (their text streams onto the screen as they "think"), and you can intervene at any point with a facilitator message that redirects the conversation — challenge an assumption, ask a follow-up, or steer the panel toward a neglected angle.`
      },
    ]
  },
  {
    id: 'sources',
    icon: Search,
    color: '#27AE60',
    title: 'Session Sources & Evidence Tracking',
    subsections: [
      {
        icon: Search,
        color: '#27AE60',
        title: 'What are Session Sources?',
        body: `Every time an SME references a real-world source — a standard, a publication, a URL they fetched with a tool — AgentDebate captures it automatically and attaches it to the session. This creates a **complete evidence trail** for the session's analysis.

Sources are categorized into four credibility tiers:
- **Authoritative** — government agencies, military, academic institutions, official standards bodies (NIST, CISA, ENISA)
- **Credible** — established security publications, reputable news outlets, recognized research organizations (Reuters, SANS, MITRE, OWASP)
- **Speculative** — social media, blogs, opinion platforms (Reddit, Medium, LinkedIn)
- **Unverified** — domains that don't match known categories

Sources appear in the **SOURCES tab** of any session.`
      },
      {
        icon: Shield,
        color: '#2E86AB',
        title: 'How Sources are Captured',
        body: `Sources are captured in three ways:

**1. Tool-fetched URLs** — When an SME uses the fetch_url tool to retrieve a web page, the URL, domain, and a snippet of the content are automatically saved with the credibility score.

**2. Inline citations** — SMEs are instructed to append citations directly in their text using the format:
\`[SOURCE: "Title or Name" — https://url.example.com]\`
or for sources without URLs:
\`[SOURCE: "NIST SP 800-53 Rev 5"]\`
These are parsed from the response text and saved with the citing sentence as context.

**3. Facilitator entries** — You can manually add a source via the "Add Source" button in the SOURCES tab. Use this to pin reference documents, standards, or external reports relevant to the session.

Each source row shows: the domain with credibility tier badge, the SME that cited it, and the exact sentence that referenced it.`
      },
      {
        icon: Bot,
        color: '#F0A500',
        title: 'SME Evidence Ledger',
        body: `The SOURCES tab has a **By SME / By Tier** toggle. **By SME** (the default) is the evidence ledger: it groups everything each SME referenced this session so you can see exactly what each expert leaned on to support its knowledge and its debate positions.

For each SME the ledger shows:
- **Every source they cited**, best-tier-first, each with the credibility badge, the source type, and the **exact claim it was cited to support**
- A **credibility mix bar** and a **0–100 evidence-quality score** — a tier-weighted measure (authoritative counts most) that lets you rank which SMEs argued from strong evidence versus thin sourcing at a glance

Critically, it also surfaces **Unsupported Assessments** — SMEs that participated but cited nothing. Their conclusions rest on persona reasoning alone, which is exactly what you want flagged before weighting their findings or briefing leadership.

The ledger is only as rich as the citations SMEs produce, so it rewards scenarios where the citation instruction is doing its job. It works for both Classic and Live Debate sessions.`,
        usage: `
1. Open a completed session and go to the **SOURCES tab**.
2. Leave the toggle on **By SME** (the default).
3. Scan the evidence-quality scores — low scores mean thin sourcing.
4. Check the **Unsupported Assessments** callout at the bottom: those SMEs' conclusions have no evidence behind them.
5. Switch to **By Tier** when you want to audit overall source credibility instead of per-expert.
`
      },
      {
        icon: Brain,
        color: '#7B2D8B',
        title: 'AI Validity Analysis',
        body: `The **Run Validity Analysis** button in the SOURCES tab sends all captured sources and their citing claims to Claude for a cross-source analysis.

The AI evaluates:
- **Contradictions** — claims from different SMEs that are directly at odds with each other, along with an explanation of the conflict
- **Unsupported claims** — significant assertions made without any cited source
- **Key agreements** — claims that multiple sources independently corroborate
- **Overall confidence** — a HIGH / MEDIUM / LOW confidence rating for the session's evidence base

This analysis is particularly useful for auditing a session before presenting findings to leadership — it flags gaps and conflicts that need human judgment before the report is finalized.`,
        usage: `
1. Complete at least one debate round so SMEs have generated responses with citations.
2. Navigate to the **SOURCES tab** in the session workspace.
3. Review the automatically captured sources, grouped by credibility tier.
4. Add any missing reference documents using the **Add Source** button.
5. Click **Run Validity Analysis** — this sends all sources to AI for cross-analysis.
6. Review the Contradictions, Unsupported Claims, and Key Agreements sections.
7. Use findings to decide whether to regenerate specific SMEs with stronger sourcing instructions.
`
      },
    ]
  },
  {
    id: 'reports',
    icon: FileText,
    color: '#546E7A',
    title: 'Executive Report',
    subsections: [
      {
        icon: FileText,
        color: '#546E7A',
        title: 'Professional Report Format',
        body: `The **Print Report** button in the Synthesis tab generates a fully formatted multi-page executive report — suitable for leadership briefings, governance documentation, and audit trails.

The report is structured as four sections:

**1. Cover Page**
Session name, scenario name, phase focus, assessment date, number of participating SMEs, and a prominent overall risk badge (color-coded to the highest severity finding).

**2. Executive Dashboard**
- **Severity Distribution** — a donut chart showing how SME assessments distribute across CRITICAL / HIGH / MEDIUM / LOW
- **Risk Level Breakdown** — a horizontal bar chart showing SME counts per severity tier
- **SME Risk Matrix** — a table with every SME's Round 1 severity, Round 2 severity, and confidence score, with color-coded cells
- **SME Confidence Chart** — per-agent confidence bars with inline severity labels

**3. Compound Attack Chains**
Each chain identified in the synthesis is displayed as a numbered flowchart — step-by-step attack sequences with amber visual connectors.

**4. Synthesis Narrative**
The full AI-generated synthesis report with formatted headings, bullet points, and proper typography.

The report is fully print-ready — charts are inline SVG (no external dependencies) and render correctly in PDF export.`
      },
      {
        icon: CheckCircle2,
        color: '#27AE60',
        title: 'Use Cases',
        body: `**Leadership briefing** — the cover page and Executive Dashboard give decision-makers a one-page summary without requiring them to read the full analysis.

**Governance & audit** — the full report documents that structured pre-decision risk analysis was conducted, which SMEs participated, what they found, and what the consensus was.

**Project archive** — attach the PDF to a project record so you can revisit what risks were considered (and which were dismissed) at each phase.

**Stakeholder communication** — the Compound Attack Chains section is often the most persuasive part for non-technical audiences: it shows *how* a failure cascades, not just that a risk exists.`,
        usage: `
1. Complete a session through synthesis (session status must be "complete").
2. Navigate to the **SYNTHESIS tab** in the session workspace.
3. Click **🖨 Print Report** — a new window opens, auto-triggers the print dialog, then closes and returns focus to the app.
4. Choose **Save as PDF** in the print dialog to generate a PDF file.
5. The report opens with charts pre-rendered — no waiting for external assets.
`
      },
    ]
  },
  {
    id: 'threat-map',
    icon: Map,
    color: '#D68910',
    title: 'Threat Map — Visualization & Coverage',
    subsections: [
      {
        icon: Map,
        color: '#D68910',
        title: 'How the Threat Map Works',
        body: `The Threat Map answers one question: **where do your threats concentrate, and can your SME panel actually cover them?**

Everything on the page is built from one relationship: **threats link to SMEs through their shared Domain.** A threat tagged "Cybersecurity & Technology Risk" is covered by the SMEs in that same domain. This means the map is only as good as your domain assignments:
- A threat with **no domain** isn't spread across every row (that would inflate the numbers) — it lands in a single italic **"Unassigned" row** at the bottom, and an amber banner tells you how many threats need domains.
- An SME with no domain doesn't count toward any threat area's coverage.

**The toolbar controls every view:**
- **GROUP BY: Domain / Discipline** — Domain (the default) gives you 10–15 broad rows; Discipline breaks the same data into finer professional specialties. Use Domain for the big picture, Discipline to see exactly which specialty carries the load.
- **Severity pills (CRIT / HIGH / MED / LOW)** — click one to filter the whole page to that severity; click again to clear.
- **Session dropdown** — restrict the map to the threats and SMEs of a single session.

Your view, axis, and filter choices are stored in the page URL — copy the address bar to share the exact view you're looking at.`
      },
      {
        icon: BarChart2,
        color: '#C0392B',
        title: 'Heatmap View',
        body: `The **Threat Concentration Heatmap** is a grid of your risk landscape:
- **Rows** = domains (or disciplines, per the toggle)
- **Columns** = threat categories, with a total count under each header
- **Cell color** = the highest severity present at that intersection (red CRITICAL → amber HIGH → blue MEDIUM → green LOW)
- **Cell intensity** = volume — the darker the cell, the more threats concentrated there

Rows with zero mapped threats are hidden by default so the map stays dense and readable; a **"show N empty rows"** checkbox in the legend reveals them (useful for spotting domains you've staffed but never mapped threats to).

**Hover** any cell for a breakdown of its threats by severity with full titles. **Click** any cell (or a row name, or a row total) to open the **drill-down panel**.`,
        usage: `
1. Navigate to **Threat Map** from the sidebar — the heatmap is the default view.
2. Scan for dark red cells first: that's where critical threats concentrate.
3. Hover a cell to preview its threats; click it to open the drill-down panel.
4. Check the "Unassigned" row at the bottom — threats there need a domain before they can be analyzed for coverage.
5. Toggle GROUP BY to Discipline to see which specific specialty within a hot domain is carrying the load.
`
      },
      {
        icon: Brain,
        color: '#7B2D8B',
        title: 'Exposure Radar & Severity Breakdown Views',
        body: `**Exposure Radar** plots each domain (or discipline) as a spoke; the further the shape extends, the higher that group's **exposure score** (Critical×4 + High×3 + Medium×2 + Low×1). The radar shows the top 12 groups; a ranked list alongside it shows everything, each row with its severity mix bar and SME count. Use it to see, in one shape, which parts of your risk landscape dominate.

**Severity Breakdown** gives you three layers:
- **Summary cards** — total threats at each severity level with percentages
- **Stacked bars per group** — each row's threat load split by severity, sorted by exposure score
- **Group × Category matrix** — a compact grid of colored dots showing the highest severity at each intersection; empty dark cells are intersections with no recorded threats

All rows and matrix cells are clickable — everything opens the same drill-down panel as the heatmap.`
      },
      {
        icon: Users,
        color: '#27AE60',
        title: 'Panel Coverage — Threat Load vs SME Bench',
        body: `The coverage panel at the bottom of every view is the **actionable core of the Threat Map**. For each domain it compares the **threat load** (the weighted exposure score) against the **SME bench** (how many SMEs cover that domain), and sorts the results into:

- **COVERAGE GAPS** (red) — domains with real threat load but **zero or one SME**. Your panel cannot credibly analyze these. Each gap row has a **⚡SME button** that jumps straight to the SME page with the AI-generate modal already open and pre-seeded with the domain — see a gap, close a gap in two clicks.
- **STRETCHED BENCH** (amber) — domains carrying critical or heavy load with below-median staffing. Not empty, but thin.
- **COVERED** (green) — threat areas with a healthy bench.
- **IDLE BENCH** — domains where you have SMEs but zero mapped threats. Either genuinely low-risk, or a sign you haven't catalogued that area's threats yet.

Click any row to open the drill-down panel for that domain.`,
        usage: `
1. Scroll to the bottom of any Threat Map view — the coverage panel is always visible.
2. Start with COVERAGE GAPS: these are threats nobody on your panel can speak to.
3. Click ⚡SME on a gap to generate a matching expert — the AI modal opens pre-filled with the domain and a suggested expert type.
4. Review STRETCHED BENCH next: consider generating or cloning a second SME for domains carrying critical load alone.
5. Treat IDLE BENCH as a prompt: run AI threat generation for those domains, or accept them as low-priority.
`
      },
      {
        icon: Search,
        color: '#2E86AB',
        title: 'Drill-Down Panel & Housekeeping',
        body: `**Drill-down panel.** Clicking anything on the map opens a side panel listing the actual records behind that slice: every threat (severity-sorted, with category) and every SME (with discipline and default-severity pill) in the selected domain. Two links at the top — **Open in Threats** and **Open in SMEs** — jump to those pages with the matching filters already applied, so you can go from "this cell looks bad" to editing the underlying records in one click. A slice with threats but no SMEs is flagged in red as a coverage gap.

**Category merge nudge.** Threat categories are free text, so near-duplicates creep in ("Cyber" vs "Cybers") and fragment the heatmap columns. When the map detects similar category names, a blue banner appears offering a one-click **Merge** — it rewrites the category on the affected threats to the most common variant. You confirm before anything changes.

**Unassigned threats banner.** If any threats lack a domain, an amber banner reports the count with an "Open Threats" button. Assign domains there and the map recalculates immediately.`
      },
    ]
  },
  {
    id: 'tips',
    icon: CheckCircle2,
    color: '#27AE60',
    title: 'Best Practices & Tips',
    tips: [
      {
        title: 'Build your SME library before your first session',
        body: 'The richer and more diverse your SME library, the more powerful your sessions. Aim for at least 8–12 SMEs spanning different disciplines. Use the AI generator or import from markdown to build quickly. You can also create SMEs on the fly inside the session builder with the "+ New SME" button.'
      },
      {
        title: 'Write a thorough scenario context document',
        body: 'This is the single biggest lever on output quality. A thin scenario ("we\'re launching a product") produces thin assessments. A rich one ("we are launching X in market Y during period Z, with constraints A, B, C, and key dependencies D, E") produces sharp, specific findings. Use AI Assist to expand your draft.'
      },
      {
        title: 'Use Phase Focus to narrow scope',
        body: 'The "Phase Focus" field in a session lets you direct SMEs to a specific window of the scenario — "the first 90 days post-launch," "the procurement phase," "during board transition." This prevents generic analysis and forces SMEs to be precise.'
      },
      {
        title: 'Interpret severity disagreements as signals',
        body: 'When one SME rates a threat CRITICAL and another rates it LOW, that isn\'t noise — it\'s signal. It means the threat\'s impact is highly dependent on which domain lens you apply. Explore those gaps, not just the consensus.'
      },
      {
        title: 'Check the evidence ledger before presenting',
        body: 'Open the SOURCES tab (By SME view) after a session. The evidence-quality score and the Unsupported Assessments callout tell you which experts argued from real evidence and which relied on persona reasoning alone. Then run Validity Analysis to catch inter-agent contradictions. A CRITICAL finding at 40% confidence with no cited sources deserves far more scrutiny than a HIGH backed by authoritative citations.'
      },
      {
        title: 'Turn chains into mitigation plans',
        body: 'Synthesis auto-extracts kill chains to your library — but don\'t stop there. Feed each chain into the Chain Breaker to get a prioritized Mitigation Roadmap: where to cut first, which controls break which steps, and what each costs. Use that roadmap to prioritize your follow-up and verification.'
      },
      {
        title: 'Use Live Debate for stakeholder engagement',
        body: 'Classic Analysis is best for rigorous documented assessment. Live Debate is better when you want to demonstrate the process to stakeholders — watching SMEs challenge each other in real time makes the AI reasoning visible and engaging in a way that a written report cannot replicate.'
      },
      {
        title: 'Organize findings and SMEs by domain',
        body: 'Domains are how threats find their SMEs. A threat without a domain sits in the Threat Map\'s "Unassigned" row; an SME without a domain counts toward no coverage. After any bulk import, run "Sync from SMEs" on the Domains page (review the preview before confirming) and sweep the Threats page for missing domain assignments.'
      },
      {
        title: 'Tie analysis to a decision and feed the Knowledge Base',
        body: 'For design decisions, frame a Decision with the real options and run the panel against each — the side-by-side peak risk and exposure make the trade-off concrete. And load your design docs and past incidents into the Knowledge Base first: grounded assessments cite your material in the evidence ledger instead of leaning on general knowledge.'
      },
      {
        title: 'Close the loop in the Mitigation Register',
        body: 'Don\'t let Chain Breaker roadmaps evaporate. "+ Register" the ones you\'ll act on, then work them in the session\'s Act stage: track follow-up and re-score residual risk as controls land. The Net Risk Reduction figure — inherent → residual — is the number leadership actually wants.'
      },
      {
        title: 'Work the coverage gaps, not just the hot cells',
        body: 'The scariest part of the Threat Map isn\'t the dark red cells — it\'s the red COVERAGE GAPS list: threat areas where nobody on your panel is qualified to push back. Use the ⚡SME button on each gap to generate a matching expert before your next session.'
      },
      {
        title: 'Don\'t just run one session',
        body: 'The real power of AgentDebate accumulates over time. Run the same scenario with a different SME mix. Run sessions at different phases of a project. Compare how the severity distribution shifts as circumstances change. Use the Threat Map across sessions to spot trends.'
      },
    ]
  },
];

function SubsectionWithUsage({ sub }) {
  const [usageOpen, setUsageOpen] = useState(false);
  
  return (
    <div data-ui="surface" className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <sub.icon className="w-4 h-4 flex-shrink-0" style={{ color: sub.color }} />
        <h3 className="text-sm font-bold font-mono tracking-wide" style={{ color: sub.color }}>{sub.title}</h3>
      </div>
      <div className="space-y-1">
        {sub.body.trim().split('\n').map((line, j) => {
          if (line.startsWith('**') && line.endsWith('**') && !line.slice(2, -2).includes('**')) {
            return <h4 key={j} className="text-xs font-bold mt-3 mb-1" style={{ color: 'var(--wr-text-primary)' }}>{line.slice(2, -2)}</h4>;
          }
          if (line.startsWith('- ')) {
            return <li key={j} className="text-xs ml-4 list-disc" style={{ color: 'var(--wr-text-secondary)' }}>{renderInline(line.slice(2))}</li>;
          }
          if (line.trim() === '') return <div key={j} className="h-1.5" />;
          return <p key={j} className="text-sm leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>{renderInline(line)}</p>;
        })}
      </div>
      
      {sub.usage && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--wr-border)' }}>
          <button data-ui="action"
            onClick={() => setUsageOpen(!usageOpen)}
            className="flex items-center gap-2 text-xs font-bold tracking-widest font-mono transition-colors hover:opacity-80"
            style={{ color: sub.color }}>
            {usageOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            HOW TO USE
          </button>
          {usageOpen && (
            <div className="mt-3 pl-4 border-l-2 space-y-1" style={{ borderColor: `${sub.color}40` }}>
              {sub.usage.trim().split('\n').map((line, j) => {
                if (line.match(/^\d+\./)) {
                  const match = line.match(/^(\d+)\. (.+)/);
                  return (
                    <div key={j} className="flex gap-2 items-start">
                      <span className="text-xs font-mono font-bold flex-shrink-0" style={{ color: sub.color }}>{match[1]}.</span>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>{renderInline(match[2])}</p>
                    </div>
                  );
                }
                if (line.trim() === '') return <div key={j} className="h-1" />;
                return <p key={j} className="text-xs leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>{renderInline(line)}</p>;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionContent({ section }) {
  if (section.content) {
    return (
      <div className="prose-warroom">
        {section.content.trim().split('\n').map((line, i) => {
          if (line.startsWith('**') && line.endsWith('**') && !line.slice(2, -2).includes('**')) {
            return <h4 key={i} className="text-sm font-bold mt-4 mb-1" style={{ color: 'var(--wr-text-primary)' }}>{line.slice(2, -2)}</h4>;
          }
          if (line.startsWith('- ')) {
            return <li key={i} className="text-sm ml-4 list-disc" style={{ color: 'var(--wr-text-secondary)' }}>{renderInline(line.slice(2))}</li>;
          }
          if (line.trim() === '') return <div key={i} className="h-2" />;
          return <p key={i} className="text-sm leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>{renderInline(line)}</p>;
        })}
      </div>
    );
  }

  if (section.subsections) {
    return (
      <div className="space-y-5">
        {section.subsections.map((sub, i) => (
          <SubsectionWithUsage key={i} sub={sub} />
        ))}
      </div>
    );
  }

  if (section.steps) {
    return (
      <div className="space-y-4">
        {section.steps.map((step, i) => (
          <div data-ui="surface" key={i} className="rounded overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
            <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: 'var(--wr-bg-secondary)' }}>
              <span className="text-lg font-black font-mono" style={{ color: 'var(--wr-amber)' }}>{step.num}</span>
              <h3 className="text-sm font-bold" style={{ color: 'var(--wr-text-primary)' }}>{step.title}</h3>
            </div>
            <div className="p-4 space-y-4" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
              <div>
                <p className="text-xs font-bold tracking-widest mb-2 font-mono" style={{ color: 'var(--wr-text-muted)' }}>WHAT YOU DO</p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>{step.what}</p>
              </div>
              <div data-ui="surface" className="rounded p-3" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                <p className="text-xs font-bold tracking-widest mb-2 font-mono" style={{ color: '#2E86AB' }}>WHAT THE SYSTEM DOES</p>
                <div className="space-y-1">
                  {step.system.trim().split('\n').map((line, j) => {
                    if (line.match(/^\d+\./)) {
                      const num = line.match(/^(\d+)\. (.+)/);
                      return (
                        <div key={j} className="flex items-start gap-2">
                          <span className="text-xs font-mono font-bold flex-shrink-0 mt-0.5" style={{ color: '#2E86AB' }}>{num[1]}.</span>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>{renderInline(num[2])}</p>
                        </div>
                      );
                    }
                    if (line.trim() === '') return <div key={j} className="h-1" />;
                    return <p key={j} className="text-xs leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>{renderInline(line)}</p>;
                  })}
                </div>
              </div>
              {step.tip && (
                <div data-ui="surface" className="flex items-start gap-2 p-2 rounded" style={{ backgroundColor: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)' }}>
                  <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--wr-amber)' }} />
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>{step.tip}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (section.tips) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {section.tips.map((tip, i) => (
          <div data-ui="surface" key={i} className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
            <div className="flex items-start gap-2 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#27AE60' }} />
              <h4 className="text-xs font-bold" style={{ color: 'var(--wr-text-primary)' }}>{tip.title}</h4>
            </div>
            <p className="text-xs leading-relaxed ml-5" style={{ color: 'var(--wr-text-secondary)' }}>{tip.body}</p>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: 'var(--wr-text-primary)' }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function Section({ section }) {
  const [open, setOpen] = useState(true);
  const Icon = section.icon;

  return (
    <div data-ui="surface" className="rounded overflow-hidden" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
      <button data-ui="disclosure"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${section.color}18` }}>
            <Icon className="w-3.5 h-3.5" style={{ color: section.color }} />
          </div>
          <h2 className="text-sm font-bold tracking-wide font-mono" style={{ color: 'var(--wr-text-primary)' }}>{section.title}</h2>
        </div>
        {open ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} /> : <ChevronRight className="w-4 h-4" style={{ color: 'var(--wr-text-muted)' }} />}
      </button>
      {open && (
        <div className="px-6 pb-6 border-t" style={{ borderColor: 'var(--wr-border)' }}>
          <div className="pt-5">
            <SectionContent section={section} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function UserGuide() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
      <PageHeader
        icon={BookOpen}
        title="USER GUIDE"
        subtitle="How to use AgentDebate — concepts, workflows, and best practices"
      />
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div data-ui="surface" className="rounded p-5 flex items-start gap-4" style={{ backgroundColor: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)' }}>
          <Shield className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: 'var(--wr-amber)' }} />
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--wr-amber)' }}>Welcome to AgentDebate</p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>
              This guide will walk you through every concept and workflow in the platform. If you're new, begin with <strong style={{ color: 'var(--wr-text-primary)' }}>Start session — from a question to action</strong>, then explore the concepts and advanced workflows as needed.
            </p>
          </div>
        </div>

        <div data-ui="surface" className="rounded p-4 flex flex-wrap gap-2" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <span className="text-xs font-mono font-bold self-center mr-1" style={{ color: 'var(--wr-text-muted)' }}>JUMP TO:</span>
          {sections.map(s => (
            <a data-ui="action" key={s.id} href={`#${s.id}`}
              className="text-xs px-2.5 py-1 rounded transition-colors hover:opacity-80"
              style={{ backgroundColor: `${s.color}18`, color: s.color, border: `1px solid ${s.color}30` }}>
              {s.title}
            </a>
          ))}
        </div>

        {sections.map(section => (
          <div key={section.id} id={section.id}>
            <Section section={section} />
          </div>
        ))}

        <div className="text-center py-6">
          <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>AgentDebate — Structured Red Team Intelligence Platform</p>
        </div>
      </div>
    </div>
  );
}
