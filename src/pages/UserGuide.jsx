import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Shield, Bot, Target, Link2, Swords, FileText, Globe, Lightbulb, AlertTriangle, CheckCircle2, Map, Brain, BarChart2, Search, Zap, Sparkles, Users, Scissors, LayoutDashboard, GitBranch, BookMarked, ShieldCheck } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';

const sections = [
  {
    id: 'what-is',
    icon: Globe,
    color: '#F0A500',
    title: 'What is AgentDebate?',
    content: `
AgentDebate is a **structured red-teaming platform** — a systematic way to stress-test plans, strategies, or decisions by simulating how adversaries, disruptors, or unexpected forces might exploit weaknesses.

Think of it like a **chess grandmaster reviewing a game before it's played**. Instead of reacting to problems after they happen, AgentDebate assembles a panel of expert "thinking styles" — called Agents — and forces them to imagine every way things could go wrong, from every angle simultaneously.

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
The **session is the hub**. Everything analytical happens inside one session, and the sidebar only has two ideas:

**Work** — **Sessions** (where you'll spend most of your time), **Decisions** (the design choice and options you're comparing), and **Scenarios** (the situation to stress-test).

**Library** — the reusable assets a session draws on: **Agents** (your expert panel), **Domains** (broad categories), **Threats** (known risks), **Chains** (kill chains), and the **Knowledge Base** (your own documents that ground the analysis).

Inside a session, a stepper walks the analysis lifecycle in order, and a **Next Step** bar always shows the one thing to do now:

**Setup → Round 1 → Round 2 → Synthesis → Findings → Act.** Findings holds the kill chains and threats the panel surfaced. Act holds this session's mitigations plus the tools that work them: **Chain Breaker** (mitigation roadmaps), the **What-If Simulator** (toggle countermeasures against the risk score), and the **Decision Brief** (executive report). Sources and Settings sit to the right of the stepper.

**More** in the sidebar holds the cross-session views (**Threat Map**, **Agent Analytics**, **Compare**) and the **Prompt Library**. Settings and this guide live in the footer.
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
        body: `Domains are **organizational categories** — the broad buckets that your work, threats, and agents live inside. Think of them like departments in a university: "Cybersecurity," "Geopolitics," "Supply Chain." They keep everything organized and color-coded, and they are the **connective tissue of the platform**: the Threat Map, coverage analysis, and agent filtering all link threats to agents through their shared domain.

**Set these up first.** Everything else (agents, scenarios, threats) can be tagged to a domain — and an untagged threat or agent is invisible to the Threat Map's coverage analysis.

**Keep domains broad.** Aim for 10–15 wide buckets ("Critical Infrastructure & Industrial Resilience") rather than one domain per specialty. Broad domains let you group many agents and threats together, which is what makes the map and coverage views readable.

**Sync from Agents.** If your agents have disciplines but no domains, the "Sync from Agents" button on the Domains page derives domain candidates from agent disciplines. A **preview popup** shows every domain that would be created — with a checkbox per domain and the number of agents it would receive — before anything is written to the database. Uncheck any junk candidates, then confirm. Nothing is saved until you do.`
      },
      {
        icon: Target,
        color: '#27AE60',
        title: 'Scenarios',
        body: `A Scenario is the **situation you want to stress-test**. It's your "what if" — the plan, decision, operation, or environment you're worried about.

Think of a scenario like the **brief given to a war game team**: "We are deploying a new LNG terminal in the Gulf of Aden. The context is X, the timeline is Y, and the constraints are Z."

The richer your scenario context document, the more targeted and useful the agent assessments will be. Use the AI Assist feature to expand a rough description into a full operational context document.

A scenario has a **status** (draft → active → archived) so you can track which ones are live.`
      },
      {
        icon: Bot,
        color: '#9B59B6',
        title: 'Agents',
        body: `Agents are **expert thinking archetypes** — personas that embody a specific discipline, cognitive style, and set of biases.

The analogy: imagine hiring a panel of consultants for a day. One is a former counterintelligence officer. One is a supply chain economist. One is a futurist. Each one looks at the same situation through a completely different lens. An Agent in AgentDebate captures that lens.

Each Agent has:
- **Discipline** — their professional identity (e.g., "HUMINT Officer," "Critical Infrastructure Engineer")
- **Domain** — the broad category they belong to (links them to threats on the Threat Map)
- **Persona Description** — who they are and how they think
- **Cognitive Bias** — what they systematically over- or under-weight (this is deliberate — biases create diversity of view)
- **Red Team Focus** — what specific threats they're hunting for
- **Vector Weights** — how much they emphasize Human, Technical, Physical, and Futures dimensions (0–100 each)
- **Default Severity** — their baseline risk posture (CRITICAL / HIGH / MEDIUM / LOW). This is the colored pill on the agent card. It is NOT a rating of the agent — it describes how alarmed this persona tends to be, and it is used as their fallback severity in debate rounds if a response doesn't declare one. Hover the pill for a full explanation.
- **Extended persona fields** — epistemic style, institutional background, conflict triggers, decision style, adversary model, institutional incentives, and analytical framework. These are injected into the debate prompts, so the richer they are, the more distinct and realistic each agent's voice becomes.

You can build agents manually, generate them with AI, or import batches from a formatted Markdown file. You can also **create a new agent directly inside the session builder** using the "+ New Agent" button — it saves to your agent library and is immediately selected for the session.`
      },
      {
        icon: AlertTriangle,
        color: '#C0392B',
        title: 'Threats',
        body: `Threats are **named risk items** — specific, catalogued dangers associated with a scenario or domain. Think of them as entries in a risk register: "Supply chain compromise via tier-3 vendor," "Insider threat during transition period."

Threats live in the library and can be tagged, categorized, and linked to scenarios. They can also be AI-generated from a scenario context document. Threats are the *what* — Agents assess the *how bad* and *why it matters*.

**Give every threat a Domain and a Category.** The Domain links it to the agents who can analyze it (this powers the Threat Map and coverage analysis); the Category groups it with similar threats (these become the heatmap columns). A threat without a domain shows up in the map's "Unassigned" row until you assign one.`
      },
      {
        icon: Link2,
        color: '#7B2D8B',
        title: 'Chains',
        body: `Chains are **compound multi-step sequences** — a structured narrative of how a threat unfolds over time, across multiple actors and disciplines.

The analogy: a Chain is like a **kill chain or attack tree**, but written in plain language. "Step 1: An insider with finance access exfiltrates procurement data. Step 2: A competitor uses that data to undercut bids. Step 3: Revenue erosion triggers a workforce reduction. Step 4: Key technical staff leave, creating a capability gap."

Each step can be attributed to an Agent or labeled freely. Chains can be built manually or AI-generated from a scenario.

**Chains are automatically extracted from synthesis.** When you generate a synthesis report, AgentDebate parses out any compound threat chains identified by the AI and saves them directly to your chain library — tagged to that session and scenario. You don't need to do anything manually.

**Chains are now generated as true kill chains.** Each step is an adversary action with an explicit "enabled by" precondition tied to the previous step, so the chain reads as a dependency sequence a defender can attack: break any one step and the chain stops. Feed a chain into the **Chain Breaker** (next section) to turn it into a prioritized mitigation plan.`
      },
      {
        icon: Swords,
        color: '#2E86AB',
        title: 'Sessions',
        body: `Sessions are where the **live red-teaming actually happens**. A session brings together a Scenario and a selected group of Agents to run a structured multi-round analysis.

Think of a Session like a **formal analytical war game**:
- You pick your scenario (the situation)
- You pick your panel (the agents)
- You run them through structured rounds of analysis
- You synthesize what they found

Sessions have two modes:
- **Classic Analysis** — structured two-round written assessment with synthesis
- **Live Debate** — real-time streaming debate where agents respond to each other turn by turn, and you can interject with facilitator questions

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
        what: 'Name the session, select a Scenario, optionally set a Phase Focus (e.g., "design phase," "deployment week"), and choose which Agents will participate. You can select agents from your library or click "+ New Agent" to create and add one on the spot.',
        system: 'AgentDebate creates a Session record and a SessionAgent record for each selected agent, all initialized to "pending" status. New agents created here are simultaneously saved to the agent library and added to the session.',
        tip: 'Choose agents with diverse vector weights. If all your agents are Technical-heavy, you\'ll miss human and geopolitical risks. Use the AI Recommendations feature to get suggestions tuned to your scenario.'
      },
      {
        num: '02',
        title: 'Generate Round 1 — Independent Assessments',
        what: 'Click "Generate All Round 1" to run all agents, or click the individual generate button on any agent card to run just that one. Already-completed agents are never re-run — "Generate All" only processes agents that don\'t yet have a Round 1 assessment.',
        system: `For each agent that needs generation:
1. Sets the agent's status to "generating_r1"
2. Constructs a detailed prompt using the agent's persona, cognitive bias, red team focus, the scenario context document, phase focus, and any pinned chains
3. Sends this prompt to Claude (Anthropic's AI model) via streaming
4. The model responds in character — a structured assessment with findings, assumptions, inline source citations, a severity rating, a **likelihood and impact band (1–5 each)**, and a **calibrated confidence score (0–100)**. If you've added Knowledge Base documents, the most relevant passages are injected into the prompt first, so the assessment is grounded in your material.
5. The assessment, severity, likelihood, impact, and confidence are saved; status updates to "r1_done"
6. When the last agent completes manually (without using Generate All), the session status auto-advances to "round1"

Agents do NOT see each other's assessments in Round 1. This ensures independent thinking before cross-pollination.

**Two things each Round 1 assessment now includes by design:**
- **A cross-domain handoff** — every agent must name the OTHER discipline whose interaction with their findings worries them most and pose a direct question to that expert. This plants the hooks that Round 2 turns into compound risks.
- **A confidence score** — the agent's calibrated self-assessment (85+ only with direct evidence or deep expertise, 50–70 when extrapolating outside their domain, below 50 when speculating). Shown as a pill next to the severity badge.`,
        tip: 'Richer scenario context documents produce sharper, more targeted assessments. Use AI Assist on your scenario first. Watch the confidence pills: a CRITICAL rating at 40% confidence is a flag to dig in, not a settled finding.'
      },
      {
        num: '03',
        title: 'Review Round 1 Results',
        what: 'Read each agent\'s independent assessment. Look for overlapping concerns (consensus signals) and stark disagreements (contested areas — often the most interesting).',
        system: 'Nothing runs automatically here. This is a human review step. You can edit any assessment manually, regenerate individual agents, or leave them as-is before proceeding.',
        tip: 'Agents that share very different severity ratings for similar threats are flagging genuine uncertainty — that\'s valuable intelligence.'
      },
      {
        num: '04',
        title: 'Generate Round 2 — Cross-Examination',
        what: 'Click "Generate All Round 2." Each agent now reads what every other agent found in Round 1 — including their severity and confidence — and produces a rebuttal that revises, reinforces, or challenges. Same smart skip logic applies: already-completed agents are never re-run.',
        system: `For each Agent:
1. Compiles all other agents' Round 1 assessments (with their severity and confidence) into a single "others" block
2. Requires an **interaction risk** as the headline: one compound risk that exists ONLY because this agent's domain interacts with another's — a risk neither would list alone — with the coupling mechanism spelled out step by step
3. Asks who they most agree with, who they most disagree with (and where that agent's rating looks miscalibrated), and whether their own severity changes
4. The model responds with a revised severity, a **recalibrated confidence** (corroboration raises it, credible contradiction lowers it), the interaction risk, and a compound chain
5. All results saved; when the last agent completes, session status auto-advances to "round2" and synthesis is triggered automatically`,
        tip: 'The interaction-risk section is the whole point of the platform — it surfaces the risks a single-domain review can never see. If an agent\'s Round 2 doesn\'t name a genuine cross-domain coupling, that\'s a sign the panel lacks the right adjacent expertise.'
      },
      {
        num: '05',
        title: 'Generate Synthesis',
        what: 'Click "Generate Synthesis." AgentDebate reads all Round 1 and Round 2 assessments and produces a single consolidated report. This also runs automatically when Round 2 completes.',
        system: `AgentDebate sends all agent assessments (with their severity and confidence) to Claude with instructions to act as a senior analytical director. The model identifies:
- Compound chains (kill chains — how threats chain together, each step enabling the next, across disciplines)
- **Cross-domain interaction risks** — the core deliverable: risks that exist only because two or more domains interact, drawn from the Round 2 interaction findings. If none emerged, the synthesis flags that as a process failure
- Consensus findings (weighted by confidence — high-confidence agreement counts for more than hedged agreement)
- Contested findings (where agents disagree, noting each side's confidence)
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
- For each option, click **"Run panel for this option"** — it launches a Session pre-scoped to that option. Run your normal two-round analysis.
- The Decision detail page then shows the options **side by side**, each with its **peak risk (out of 25)**, **average exposure**, and severity mix — aggregated from that option's sessions. The lowest-risk option is auto-flagged.
- Track **key assumptions** with a criticality and a status (holds / monitoring / **invalidated**). An invalidated assumption is your trigger to re-assess.
- When you decide, click **Record Decision**: choose the option, capture who decided and the rationale — including what risk is being *knowingly accepted*. That's a durable, auditable decision record.

This is what turns the platform from "threat brainstorming" into defensible decision support: you can show *why* an option was chosen and what was known at the time.`,
        usage: `
1. Sidebar → Decisions → New Decision. Name the choice and list 2–4 options.
2. Add the assumptions the decision depends on.
3. On each option card, click "Run panel for this option" and complete a session.
4. Compare the options' peak risk and exposure side by side.
5. Click Record Decision, pick the option, and capture the rationale.
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
1. Run a session — agents now emit likelihood and impact with their severity.
2. Read the Risk Matrix at the top of each round: the top-right zone is your worst risk.
3. Use peak risk and average exposure to compare rounds, options, and sessions.
`
      },
      {
        icon: BookMarked,
        color: '#2E86AB',
        title: 'Knowledge Base — Grounding Analysis in Your Documents',
        body: `By default, agents reason from their persona and general knowledge — which is why some cite little in the evidence ledger. The **Knowledge Base** (sidebar → Library) fixes that: add your own **design docs, incident postmortems, standards, and prior assessments**, and the analysis is grounded in *your* material.

**How it works:**
- Paste or upload (.txt/.md) a document. It's **chunked** and indexed on ingest.
- At analysis time, the most relevant chunks for the scenario are **automatically retrieved and injected** into every agent's prompt as an "Organizational Knowledge Base" block, with instruction to cite them.
- Those citations then show up in the **SME Evidence Ledger**, so the analysis is traceable to your documents rather than to general training knowledge.
- In Live Debate, the agents' knowledge-search tool also checks your Knowledge Base first.

The more you put in, the more grounded — and defensible — the assessments become.`,
        usage: `
1. Sidebar → Knowledge Base → Add Document. Paste or upload the text.
2. Run a session as normal — retrieval happens automatically.
3. Open the SOURCES tab (By SME) and confirm agents cited your documents.
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

The result is a defender's to-do list you can hand to a team, rather than a flat list of controls with no priority. It's included in the printed report.`
      },
      {
        icon: ShieldCheck,
        color: '#27AE60',
        title: 'The Mitigation Register — Closing the Loop',
        body: `A roadmap is a plan; the session's **Mitigation Register** (open the session → Act stage) tracks it to completion and shows your **net** risk.

- Breaking the kill chains under Findings generates mitigations automatically. On any Chain Breaker roadmap item, click **"+ Register"** to add it too. Inherent risk is seeded from the leverage of the steps it breaks.
- In the register, set an **owner** and move each item through its lifecycle: proposed → accepted → in progress → implemented → verified (or rejected).
- Re-score **residual risk** (likelihood × impact) in the row once a control is in place. The register then shows **Net Risk Reduction** — summed inherent → residual across this session's mitigations.

This closes the loop: instead of "here are risks," you can show "here's the risk, here's what we're doing about it, here's who owns it, and here's the residual after mitigation" — which is exactly what governance and audit ask for.`,
        usage: `
1. Under Findings, break the kill chains — or run Chain Breaker and click "+ Register" on the roadmap items you'll act on.
2. Open the Act stage, assign owners, and update status as work progresses.
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
        body: `Live Debate is the **real-time alternative to Classic Analysis**. Instead of structured rounds, agents respond to each other in a flowing conversation — more like a panel discussion than a formal assessment.

Choose Live Debate when you want:
- Dynamic back-and-forth between agents (not just independent assessments)
- A facilitator-directed conversation where you can interject, redirect, and challenge
- An observable, streaming experience where you watch agents think in real time

**How it works:** You start the debate, agents take turns responding (their text streams onto the screen as they "think"), and you can intervene at any point with a facilitator message that redirects the conversation — challenge an assumption, ask a follow-up, or steer the panel toward a neglected angle.`
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
        body: `Every time an agent references a real-world source — a standard, a publication, a URL they fetched with a tool — AgentDebate captures it automatically and attaches it to the session. This creates a **complete evidence trail** for the session's analysis.

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

**1. Tool-fetched URLs** — When an agent uses the fetch_url tool to retrieve a web page, the URL, domain, and a snippet of the content are automatically saved with the credibility score.

**2. Inline citations** — Agents are instructed to append citations directly in their text using the format:
\`[SOURCE: "Title or Name" — https://url.example.com]\`
or for sources without URLs:
\`[SOURCE: "NIST SP 800-53 Rev 5"]\`
These are parsed from the response text and saved with the citing sentence as context.

**3. Facilitator entries** — You can manually add a source via the "Add Source" button in the SOURCES tab. Use this to pin reference documents, standards, or external reports relevant to the session.

Each source row shows: the domain with credibility tier badge, the agent that cited it, and the exact sentence that referenced it.`
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

The ledger is only as rich as the citations agents produce, so it rewards scenarios where the citation instruction is doing its job. It works for both Classic and Live Debate sessions.`,
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
- **Contradictions** — claims from different agents that are directly at odds with each other, along with an explanation of the conflict
- **Unsupported claims** — significant assertions made without any cited source
- **Key agreements** — claims that multiple sources independently corroborate
- **Overall confidence** — a HIGH / MEDIUM / LOW confidence rating for the session's evidence base

This analysis is particularly useful for auditing a session before presenting findings to leadership — it flags gaps and conflicts that need human judgment before the report is finalized.`,
        usage: `
1. Complete at least one debate round so agents have generated responses with citations.
2. Navigate to the **SOURCES tab** in the session workspace.
3. Review the automatically captured sources, grouped by credibility tier.
4. Add any missing reference documents using the **Add Source** button.
5. Click **Run Validity Analysis** — this sends all sources to AI for cross-analysis.
6. Review the Contradictions, Unsupported Claims, and Key Agreements sections.
7. Use findings to decide whether to regenerate specific agents with stronger sourcing instructions.
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
Session name, scenario name, phase focus, assessment date, number of participating agents, and a prominent overall risk badge (color-coded to the highest severity finding).

**2. Executive Dashboard**
- **Severity Distribution** — a donut chart showing how agent assessments distribute across CRITICAL / HIGH / MEDIUM / LOW
- **Risk Level Breakdown** — a horizontal bar chart showing agent counts per severity tier
- **Agent Risk Matrix** — a table with every agent's Round 1 severity, Round 2 severity, and confidence score, with color-coded cells
- **Agent Confidence Chart** — per-agent confidence bars with inline severity labels

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

**Governance & audit** — the full report documents that structured pre-decision risk analysis was conducted, which agents participated, what they found, and what the consensus was.

**Project archive** — attach the PDF to a project record so future teams can see what risks were considered (and which were dismissed) at each phase.

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
        body: `The Threat Map answers one question: **where do your threats concentrate, and can your agent panel actually cover them?**

Everything on the page is built from one relationship: **threats link to agents through their shared Domain.** A threat tagged "Cybersecurity & Technology Risk" is covered by the agents in that same domain. This means the map is only as good as your domain assignments:
- A threat with **no domain** isn't spread across every row (that would inflate the numbers) — it lands in a single italic **"Unassigned" row** at the bottom, and an amber banner tells you how many threats need domains.
- An agent with no domain doesn't count toward any threat area's coverage.

**The toolbar controls every view:**
- **GROUP BY: Domain / Discipline** — Domain (the default) gives you 10–15 broad rows; Discipline breaks the same data into finer professional specialties. Use Domain for the big picture, Discipline to see exactly which specialty carries the load.
- **Severity pills (CRIT / HIGH / MED / LOW)** — click one to filter the whole page to that severity; click again to clear.
- **Session dropdown** — restrict the map to the threats and agents of a single session.

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
        body: `**Exposure Radar** plots each domain (or discipline) as a spoke; the further the shape extends, the higher that group's **exposure score** (Critical×4 + High×3 + Medium×2 + Low×1). The radar shows the top 12 groups; a ranked list alongside it shows everything, each row with its severity mix bar and agent count. Use it to see, in one shape, which parts of your risk landscape dominate.

**Severity Breakdown** gives you three layers:
- **Summary cards** — total threats at each severity level with percentages
- **Stacked bars per group** — each row's threat load split by severity, sorted by exposure score
- **Group × Category matrix** — a compact grid of colored dots showing the highest severity at each intersection; empty dark cells are intersections with no recorded threats

All rows and matrix cells are clickable — everything opens the same drill-down panel as the heatmap.`
      },
      {
        icon: Users,
        color: '#27AE60',
        title: 'Panel Coverage — Threat Load vs Agent Bench',
        body: `The coverage panel at the bottom of every view is the **actionable core of the Threat Map**. For each domain it compares the **threat load** (the weighted exposure score) against the **agent bench** (how many agents cover that domain), and sorts the results into:

- **COVERAGE GAPS** (red) — domains with real threat load but **zero or one agent**. Your panel cannot credibly analyze these. Each gap row has a **⚡SME button** that jumps straight to the Agents page with the AI-generate modal already open and pre-seeded with the domain — see a gap, close a gap in two clicks.
- **STRETCHED BENCH** (amber) — domains carrying critical or heavy load with below-median staffing. Not empty, but thin.
- **COVERED** (green) — threat areas with a healthy bench.
- **IDLE BENCH** — domains where you have agents but zero mapped threats. Either genuinely low-risk, or a sign you haven't catalogued that area's threats yet.

Click any row to open the drill-down panel for that domain.`,
        usage: `
1. Scroll to the bottom of any Threat Map view — the coverage panel is always visible.
2. Start with COVERAGE GAPS: these are threats nobody on your panel can speak to.
3. Click ⚡SME on a gap to generate a matching expert — the AI modal opens pre-filled with the domain and a suggested expert type.
4. Review STRETCHED BENCH next: consider generating or cloning a second agent for domains carrying critical load alone.
5. Treat IDLE BENCH as a prompt: run AI threat generation for those domains, or accept them as low-priority.
`
      },
      {
        icon: Search,
        color: '#2E86AB',
        title: 'Drill-Down Panel & Housekeeping',
        body: `**Drill-down panel.** Clicking anything on the map opens a side panel listing the actual records behind that slice: every threat (severity-sorted, with category) and every agent (with discipline and default-severity pill) in the selected domain. Two links at the top — **Open in Threats** and **Open in Agents** — jump to those pages with the matching filters already applied, so you can go from "this cell looks bad" to editing the underlying records in one click. A slice with threats but no agents is flagged in red as a coverage gap.

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
        title: 'Build your agent library before your first session',
        body: 'The richer and more diverse your agent library, the more powerful your sessions. Aim for at least 8–12 agents spanning different disciplines. Use the AI generator or import from markdown to build quickly. You can also create agents on the fly inside the session builder with the "+ New Agent" button.'
      },
      {
        title: 'Write a thorough scenario context document',
        body: 'This is the single biggest lever on output quality. A thin scenario ("we\'re launching a product") produces thin assessments. A rich one ("we are launching X in market Y during period Z, with constraints A, B, C, and key dependencies D, E") produces sharp, specific findings. Use AI Assist to expand your draft.'
      },
      {
        title: 'Use Phase Focus to narrow scope',
        body: 'The "Phase Focus" field in a session lets you direct agents to a specific window of the scenario — "the first 90 days post-launch," "the procurement phase," "during board transition." This prevents generic analysis and forces agents to be precise.'
      },
      {
        title: 'Interpret severity disagreements as signals',
        body: 'When one agent rates a threat CRITICAL and another rates it LOW, that isn\'t noise — it\'s signal. It means the threat\'s impact is highly dependent on which domain lens you apply. Explore those gaps, not just the consensus.'
      },
      {
        title: 'Check the evidence ledger before presenting',
        body: 'Open the SOURCES tab (By SME view) after a session. The evidence-quality score and the Unsupported Assessments callout tell you which experts argued from real evidence and which relied on persona reasoning alone. Then run Validity Analysis to catch inter-agent contradictions. A CRITICAL finding at 40% confidence with no cited sources deserves far more scrutiny than a HIGH backed by authoritative citations.'
      },
      {
        title: 'Turn chains into mitigation plans',
        body: 'Synthesis auto-extracts kill chains to your library — but don\'t stop there. Feed each chain into the Chain Breaker to get a prioritized Mitigation Roadmap: where to cut first, which controls break which steps, and what each costs. That roadmap is the hand-off to your defensive team.'
      },
      {
        title: 'Use Live Debate for stakeholder engagement',
        body: 'Classic Analysis is best for rigorous documented assessment. Live Debate is better when you want to demonstrate the process to stakeholders — watching agents challenge each other in real time makes the AI reasoning visible and engaging in a way that a written report cannot replicate.'
      },
      {
        title: 'Assign domains to everything',
        body: 'Domains are how threats find their agents. A threat without a domain sits in the Threat Map\'s "Unassigned" row; an agent without a domain counts toward no coverage. After any bulk import, run "Sync from Agents" on the Domains page (review the preview before confirming) and sweep the Threats page for missing domain assignments.'
      },
      {
        title: 'Tie analysis to a decision and feed the Knowledge Base',
        body: 'For design decisions, frame a Decision with the real options and run the panel against each — the side-by-side peak risk and exposure make the trade-off concrete. And load your design docs and past incidents into the Knowledge Base first: grounded assessments cite your material in the evidence ledger instead of leaning on general knowledge.'
      },
      {
        title: 'Close the loop in the Mitigation Register',
        body: 'Don\'t let Chain Breaker roadmaps evaporate. "+ Register" the ones you\'ll act on, then work them in the session\'s Act stage: assign owners and re-score residual risk as controls land. The Net Risk Reduction figure — inherent → residual — is the number leadership actually wants.'
      },
      {
        title: 'Work the coverage gaps, not just the hot cells',
        body: 'The scariest part of the Threat Map isn\'t the dark red cells — it\'s the red COVERAGE GAPS list: threat areas where nobody on your panel is qualified to push back. Use the ⚡SME button on each gap to generate a matching expert before your next session.'
      },
      {
        title: 'Don\'t just run one session',
        body: 'The real power of AgentDebate accumulates over time. Run the same scenario with a different agent mix. Run sessions at different phases of a project. Compare how the severity distribution shifts as circumstances change. Use the Threat Map across sessions to spot trends.'
      },
    ]
  },
];

function SubsectionWithUsage({ sub }) {
  const [usageOpen, setUsageOpen] = useState(false);
  
  return (
    <div className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
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
          <button
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
          <div key={i} className="rounded overflow-hidden" style={{ border: '1px solid var(--wr-border)' }}>
            <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: 'var(--wr-bg-secondary)' }}>
              <span className="text-lg font-black font-mono" style={{ color: 'var(--wr-amber)' }}>{step.num}</span>
              <h3 className="text-sm font-bold" style={{ color: 'var(--wr-text-primary)' }}>{step.title}</h3>
            </div>
            <div className="p-4 space-y-4" style={{ backgroundColor: 'var(--wr-bg-primary)' }}>
              <div>
                <p className="text-xs font-bold tracking-widest mb-2 font-mono" style={{ color: 'var(--wr-text-muted)' }}>WHAT YOU DO</p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>{step.what}</p>
              </div>
              <div className="rounded p-3" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
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
                <div className="flex items-start gap-2 p-2 rounded" style={{ backgroundColor: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)' }}>
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
          <div key={i} className="rounded p-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
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
    <div className="rounded overflow-hidden" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
      <button
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
        <div className="rounded p-5 flex items-start gap-4" style={{ backgroundColor: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)' }}>
          <Shield className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: 'var(--wr-amber)' }} />
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--wr-amber)' }}>Welcome to AgentDebate</p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--wr-text-secondary)' }}>
              This guide will walk you through every concept and workflow in the platform. If you're new, start with <strong style={{ color: 'var(--wr-text-primary)' }}>What is AgentDebate?</strong>, then read <strong style={{ color: 'var(--wr-text-primary)' }}>Core Concepts</strong> before running your first session.
            </p>
          </div>
        </div>

        <div className="rounded p-4 flex flex-wrap gap-2" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <span className="text-xs font-mono font-bold self-center mr-1" style={{ color: 'var(--wr-text-muted)' }}>JUMP TO:</span>
          {sections.map(s => (
            <a key={s.id} href={`#${s.id}`}
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
