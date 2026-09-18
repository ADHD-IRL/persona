# AgentDebate

Structured multi-agent risk assessment and decision-support platform. Frame a design decision, assemble a panel of expert agents, run two-round red-team sessions, and turn what they surface into quantified risk, kill chains, and a tracked mitigation plan — or drop into the **Live Debate Room** for a real-time streaming debate you can facilitate on the fly.

Multi-user, workspace-aware deployment backed by Supabase. All AI calls go directly from your browser to the Anthropic API using your own key.

---

## What it does

- **Multidisciplinary panels** — build expert agents (or generate them with AI), each a distinct discipline, cognitive bias, and risk posture. The debate is engineered to surface **cross-domain interaction risks** that no single-discipline review would find.
- **Two-round analysis** — independent Round 1 assessments, then cross-examination in Round 2, then an AI synthesis with consensus, contested findings, blind spots, and priority mitigations.
- **Quantified risk** — every assessment carries a **likelihood × impact** band (1–5 each) and a calibrated **confidence** score, plotted on a per-round risk matrix.
- **Decisions** — frame a design choice with 2–4 options, run the panel against every option in one click, and get a reasoned recommendation that cites the evidence, flags assumptions at risk, and states the risk you accept. Then record an auditable decision.
- **Threat Map** — coverage analysis of your threat landscape against your agent bench, with drill-down and Generate-SME gap closing.
- **Chain Breaker & Mitigation Register** — dissect kill chains into a prioritized mitigation roadmap, then track each mitigation through its lifecycle and re-score residual risk.
- **Evidence ledger** — every source an agent cites is captured per-SME with a credibility tier, so findings are traceable.
- **Knowledge Base** — ingest your own design docs, incidents, and standards; the most relevant passages are retrieved and injected into each agent's prompt to ground the analysis.

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or higher
- A [Supabase](https://supabase.com/) project (free tier is sufficient)
- An [Anthropic API key](https://console.anthropic.com/) with Messages API access

---

## Supabase setup

### 1. Create a Supabase project

Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project. Note your **Project URL** and **anon public key** from **Project Settings → API**.

### 2. Run the database migrations

The schema lives in [`supabase/migrations/`](supabase/migrations). Every migration is idempotent (`create table if not exists`, `drop policy if exists` before each `create policy`, guarded realtime/publication adds), so applying them is safe and repeatable. Pick **one** of the two paths below — don't mix them (see the warning).

**Path A — Supabase GitHub integration (recommended for any deployed/CI setup).**
Connect the repo in **Supabase dashboard → Integrations → GitHub** and point it at your deploy branch. The integration applies the files in `supabase/migrations/` in order and records them in `supabase_migrations.schema_migrations`. Let the pipeline own the schema — **do not also paste SQL into the editor**, or the tracking table drifts out of sync with the actual schema and the next deploy fails with `relation "…" already exists`.

- The incremental files `001`–`016` are the source of truth for this path.
- `000_full_schema.sql` is a manual convenience only (see Path B). Because it duplicates `001`–`010`, the integration applies it too — harmless since everything is idempotent, but redundant. If you never run Path B you can ignore it.

**Path B — Manual, in the SQL editor (quick local / one-off project).**
Open the [SQL editor](https://supabase.com/dashboard/project/_/sql/new) and run:

1. [`supabase/migrations/000_full_schema.sql`](supabase/migrations/000_full_schema.sql) — consolidated base: schema, RLS, Realtime, and everything through migration `010` (workspaces, agents, sessions, sources, SME library, extended personas). Equivalent to running `001`–`010` in order.
2. [`011_quantified_risk.sql`](supabase/migrations/011_quantified_risk.sql) — likelihood/impact bands on assessments and threats
3. [`012_mitigation_register.sql`](supabase/migrations/012_mitigation_register.sql) — mitigation register with residual re-scoring
4. [`013_decisions.sql`](supabase/migrations/013_decisions.sql) — decisions, options, assumptions
5. [`014_knowledge_base.sql`](supabase/migrations/014_knowledge_base.sql) — knowledge documents and chunks
6. [`015_mitigation_session_link.sql`](supabase/migrations/015_mitigation_session_link.sql) — links mitigations to their originating session
7. [`016_optimal_sme.sql`](supabase/migrations/016_optimal_sme.sql) — optimal-SME reasoning fields (competence boundaries, tradecraft, risk posture, debate behavior)
8. [`017_remove_sme_library.sql`](supabase/migrations/017_remove_sme_library.sql) — removes the retired SME Library (drops `sme_tokens`, the library-only agent columns, and the shared library workspace)

> ⚠️ **Don't run Path B on a project managed by the GitHub integration.** Pasting SQL by hand creates objects the integration hasn't recorded, so its next run tries to re-create them and fails. If that already happened, the migrations are idempotent — re-running through the integration now reconciles it (it applies them as no-ops and records them).

### 3. Configure authentication

In your Supabase dashboard go to **Authentication → URL Configuration** and add your app's URL (e.g. `http://localhost:5173`) to **Redirect URLs**.

Optionally enable **Google OAuth** under **Authentication → Providers → Google** by supplying your Google OAuth client credentials.

---

## Local setup

### 1. Clone and install

```bash
git clone https://github.com/ADHD-IRL/AgentDebate.git
cd AgentDebate
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Both values are found under **Project Settings → API**.

> If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing, the app shows a **Setup Required** screen with instructions rather than a blank page.

### 3. Add the splash page hero image (optional)

Place your hero image at `public/splash-hero.jpg`. It's the full-bleed background on the login/splash page. The app works without it (dark fallback background).

### 4. Start the development server

```bash
npm run dev
```

The app is available at `http://localhost:5173`.

---

## First-time use

1. Open the app — the splash page is always shown first
2. Click **Request access** to create an account, or sign in with Google
3. A workspace is automatically created and you are added as admin
4. Go to **Settings** and add your **Anthropic API key** — required for all AI analysis (stored in your workspace record, shared with members)
5. The **Dashboard** shows a getting-started checklist that tracks your setup and points to the next step

---

## Workflow

The sidebar is organized as the workflow, top to bottom.

### 1 · Build

- **Domains** — broad categories that link threats to the agents who can analyze them
- **Agents** — your expert panel; build manually, **AI Generate**, or **Import** from Markdown
- **Knowledge Base** — add your own documents so analysis is grounded in your material

### 2 · Plan

- **Decisions** — frame the design choice and the options you're comparing
- **Scenarios** — describe the system or threat environment to stress-test
- **Threats** — optionally catalog known risks (with likelihood/impact)

### 3 · Run

- **Sessions → New Session → Classic Analysis** — pick agents and a scenario, then run **Round 1 → Round 2 → Synthesize**. Each assessment carries severity, likelihood × impact, and confidence; a risk matrix plots the panel's ratings.
- **Live Debate Room** — a real-time streaming alternative where agents respond turn by turn and you facilitate: interject with notes, direct a question at a specific agent, and steer the debate.
- **What-If Simulator** — explore how changes shift the risk picture.

### 4 · Act on Findings

- **Threat Map** — where threats concentrate vs. where your agent bench actually covers them; drill into any slice, close gaps with Generate-SME
- **Chains** — kill chains auto-extracted from synthesis
- **Chain Breaker** — turn a chain into a prioritized **Mitigation Roadmap** (where to cut first, control type, effort, residual risk)
- **Mitigations** — the register: track each mitigation through its lifecycle and re-score net residual risk
- **Reports** — print-ready executive PDF

---

## Session states

| State | Meaning |
|---|---|
| **DRAFT** | Created but not yet run — shown with dashed border |
| **ROUND 1** | Round 1 assessments in progress or complete |
| **ROUND 2** | Rebuttal round in progress or complete |
| **COMPLETE** | Both rounds done and synthesis generated |

Findings (severity counts) only appear once agents have produced assessments — draft sessions show none.

---

## Evidence & sources

Every source an agent references — a tool-fetched URL, an inline `[SOURCE: "…"]` citation, or a facilitator entry — is captured on the session with a credibility tier (Authoritative / Credible / Speculative / Unverified). The session **SOURCES** tab shows this two ways:

- **By SME** (the evidence ledger) — what each expert relied on, with an evidence-quality score and an *Unsupported Assessments* flag for agents that cited nothing
- **By Tier** — grouped by credibility, with a **Run Validity Analysis** button that cross-checks sources for contradictions and unsupported claims

---

## Agent import format

Agents can be bulk-imported from a `.md` file. Each block starts with an `##` heading:

```markdown
## Agent Name / Discipline

**Persona:** Who this expert is and how they think

**Cognitive Bias:** What they systematically underweight

**Primary Focus:** What they hunt for in an assessment

**Severity:** CRITICAL | HIGH | MEDIUM | LOW

**Vectors:**
- Human: 85
- Technical: 40
- Physical: 50
- Futures: 30

**Tags:** comma, separated, keywords

**Domain Tags:** Domain Name, Another Domain
```

Domains are matched by name (case-insensitive) or auto-created if they don't exist.

---

## Build for production

```bash
npm run build
```

Output goes to `dist/`. Deploy to any static host (Vercel, Netlify, GitHub Pages, S3, etc.). Set the Supabase environment variables in your hosting platform's settings:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

The Anthropic API key is entered by each workspace in Settings and stored in the workspace record — it does not need to be set at build time.

---

## Tech stack

| Layer | Technology |
|---|---|
| UI framework | React 18 + Vite |
| Styling | Tailwind CSS + CSS variables (`--wr-*` tokens) |
| Routing | React Router v6 |
| Auth & database | Supabase (PostgreSQL + Row Level Security) |
| Realtime | Supabase Realtime (sessions, session agents, live transcripts) |
| AI — analysis | Anthropic API — `claude-sonnet-4-6`, `claude-opus-4-7`, `claude-haiku-4-5` |
| Knowledge retrieval | Organizational Knowledge Base (Postgres full-text); Wikipedia API fallback for agent tool calls |
| Charts | Recharts |
| Icons | Lucide React |
