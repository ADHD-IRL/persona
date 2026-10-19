-- Standalone PostgreSQL schema derived from the final application tables.
-- Supabase Auth, publications, policies, and cloud library seeds are intentionally absent.
CREATE TABLE public.local_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.local_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.local_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX local_sessions_user ON public.local_sessions(user_id);
CREATE INDEX local_sessions_expiry ON public.local_sessions(expires_at);

create table if not exists public.profiles (
  id           uuid references public.local_users(id) on delete cascade primary key,
  display_name text,
  avatar_url   text,
  created_at   timestamptz default now() not null
);

create table if not exists public.workspaces (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  owner_id          uuid references public.profiles(id) on delete set null,
  anthropic_api_key text,
  invite_code       text unique,
  created_at        timestamptz default now() not null
);

create table if not exists public.workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  role         text not null default 'analyst'
                 check (role in ('admin','analyst','viewer')),
  invited_by   uuid references public.profiles(id),
  created_at   timestamptz default now() not null,
  unique (workspace_id, user_id)
);

create table if not exists public.domains (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  name         text not null,
  description  text,
  color        text,
  icon         text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz default now() not null
);

create table if not exists public.agents (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid references public.workspaces(id) on delete cascade not null,
  domain_id               uuid,
  name                    text not null,
  discipline              text not null,
  persona_description     text,
  cognitive_bias          text,
  red_team_focus          text,
  professional_background text,
  expertise_level         text default 'Senior'
                            check (expertise_level in ('Junior','Mid-Level','Senior','Principal','World-Class')),
  reasoning_style         text default 'Analytical'
                            check (reasoning_style in ('Analytical','Intuitive','Contrarian','Systematic','Probabilistic')),
  severity_default        text default 'HIGH'
                            check (severity_default in ('CRITICAL','HIGH','MEDIUM','LOW')),
  vector_human            integer default 50,
  vector_technical        integer default 50,
  vector_physical         integer default 30,
  vector_futures          integer default 40,
  is_ai_generated         boolean default false,
  tags                    text[] default '{}',
  
  epistemic_style          text,
  institutional_background text,
  conflict_triggers        text,
  decision_style           text,
  adversary_model          text,
  institutional_incentives text,
  
  source                   text default 'workspace',
  is_library_sme           boolean default false,
  usage_count              integer default 0,
  quality_score            numeric(4,1),
  cloned_from_id           uuid,
  scenario_tags            jsonb default '[]',
  domain_expertise         jsonb default '{}',
  analytical_framework     text,
  source_preferences       text,
  
  created_by  uuid references public.profiles(id),
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now()
);

alter table public.agents add column if not exists epistemic_style          text;

alter table public.agents add column if not exists institutional_background text;

alter table public.agents add column if not exists conflict_triggers        text;

alter table public.agents add column if not exists decision_style           text;

alter table public.agents add column if not exists adversary_model          text;

alter table public.agents add column if not exists institutional_incentives text;

alter table public.agents add column if not exists source                   text default 'workspace';

alter table public.agents add column if not exists is_library_sme           boolean default false;

alter table public.agents add column if not exists usage_count              integer default 0;

alter table public.agents add column if not exists quality_score            numeric(4,1);

alter table public.agents add column if not exists cloned_from_id           uuid;

alter table public.agents add column if not exists scenario_tags            jsonb default '[]';

alter table public.agents add column if not exists domain_expertise         jsonb default '{}';

alter table public.agents add column if not exists analytical_framework     text;

alter table public.agents add column if not exists source_preferences       text;

alter table public.agents add column if not exists updated_at               timestamptz default now();

create index if not exists agents_sme_search_idx
  on public.agents
  using gin(to_tsvector('english',
    coalesce(name, '') || ' ' ||
    coalesce(discipline, '') || ' ' ||
    coalesce(persona_description, '') || ' ' ||
    coalesce(red_team_focus, '') || ' ' ||
    coalesce(analytical_framework, '')
  ));

create index if not exists agents_scenario_tags_idx on public.agents using gin(scenario_tags);

create index if not exists agents_is_library_idx    on public.agents (is_library_sme) where is_library_sme = true;

create table if not exists public.scenarios (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid references public.workspaces(id) on delete cascade not null,
  domain_id        uuid,
  name             text not null,
  description      text,
  context_document text,
  status           text default 'draft'
                     check (status in ('draft','active','archived')),
  tags             text[] default '{}',
  created_by       uuid references public.profiles(id),
  created_at       timestamptz default now() not null
);

create table if not exists public.threats (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  domain_id    uuid,
  scenario_id  uuid,
  name         text not null,
  description  text,
  severity     text check (severity in ('CRITICAL','HIGH','MEDIUM','LOW')),
  category     text,
  tags         text[] default '{}',
  created_by   uuid references public.profiles(id),
  created_at   timestamptz default now() not null
);

create table if not exists public.chains (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid references public.workspaces(id) on delete cascade not null,
  domain_id        uuid,
  scenario_id      uuid,
  session_id       uuid,
  threat_id        uuid,
  name             text not null,
  description      text,
  steps            jsonb default '[]',
  is_ai_generated  boolean default false,
  tags             text[] default '{}',
  chain_resilience text,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz default now() not null
);

create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid references public.workspaces(id) on delete cascade not null,
  scenario_id      uuid,
  domain_id        uuid,
  name             text not null,
  status           text default 'pending'
                     check (status in ('pending','round1','round2','complete')),
  mode             text not null default 'classic'
                     check (mode in ('classic','live')),
  phase_focus      text,
  context_override text,
  agent_ids        text[] default '{}',
  source_pins      jsonb not null default '[]',
  facilitator_note text,
  pinned_chain_ids text[] default '{}',
  created_by       uuid references public.profiles(id),
  created_at       timestamptz default now() not null
);

alter table public.sessions add column if not exists mode             text not null default 'classic';

alter table public.sessions add column if not exists source_pins      jsonb not null default '[]';

alter table public.sessions add column if not exists facilitator_note text;

alter table public.sessions add column if not exists pinned_chain_ids text[] default '{}';

create table if not exists public.session_agents (
  id                                 uuid primary key default gen_random_uuid(),
  workspace_id                       uuid references public.workspaces(id) on delete cascade not null,
  session_id                         uuid references public.sessions(id) on delete cascade not null,
  agent_id                           uuid not null,
  round0_briefing                    text,
  round1_assessment                  text,
  round1_severity                    text check (round1_severity in ('CRITICAL','HIGH','MEDIUM','LOW')),
  round1_confidence                  integer,
  round2_rebuttal                    text,
  round2_revised_severity            text check (round2_revised_severity in ('CRITICAL','HIGH','MEDIUM','LOW')),
  round2_confidence                  integer,
  round2_strongest_ally_agent_id     uuid,
  round2_strongest_disagree_agent_id uuid,
  compound_chain_text                text,
  status                             text default 'pending'
                                       check (status in ('pending','generating_r1','r1_done','generating_r2','complete')),
  created_at                         timestamptz default now() not null
);

alter table public.session_agents add column if not exists round0_briefing   text;

alter table public.session_agents add column if not exists round1_confidence integer;

alter table public.session_agents add column if not exists round2_confidence integer;

create table if not exists public.session_syntheses (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid references public.workspaces(id) on delete cascade not null,
  session_id           uuid references public.sessions(id) on delete cascade not null,
  raw_text             text,
  consensus_findings   jsonb default '[]',
  contested_findings   jsonb default '[]',
  compound_chains      jsonb default '[]',
  blind_spots          jsonb default '[]',
  priority_mitigations jsonb default '[]',
  sharpest_insights    jsonb default '[]',
  created_at           timestamptz default now() not null
);

create table if not exists public.session_messages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  session_id   uuid references public.sessions(id)   on delete cascade not null,
  agent_id     uuid,
  role         text not null check (role in ('agent','user','system')),
  content      text not null,
  round        integer,
  metadata     jsonb default '{}',
  created_at   timestamptz default now() not null
);

create table if not exists public.session_sources (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid references public.workspaces(id) on delete cascade not null,
  session_id       uuid references public.sessions(id) on delete cascade not null,
  message_id       uuid,
  agent_id         uuid,
  source_type      text not null,
  url              text,
  title            text,
  domain           text,
  credibility_tier  text,
  credibility_score integer,
  cited_claim      text,
  content_snippet  text,
  created_at       timestamptz default now() not null
);

create table if not exists public.app_configs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  key          text not null,
  value        text,
  label        text,
  created_at   timestamptz default now() not null,
  unique (workspace_id, key)
);

create table if not exists public.sme_tokens (
  id           uuid primary key default gen_random_uuid(),
  token        text unique not null default gen_random_uuid()::text,
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  name         text,
  permissions  text[] default '{read,write}',
  created_by   uuid references public.profiles(id),
  created_at   timestamptz default now(),
  last_used_at timestamptz,
  expires_at   timestamptz
);

alter table public.session_agents add column if not exists round1_likelihood integer check (round1_likelihood between 1 and 5);

alter table public.session_agents add column if not exists round1_impact     integer check (round1_impact between 1 and 5);

alter table public.session_agents add column if not exists round2_likelihood integer check (round2_likelihood between 1 and 5);

alter table public.session_agents add column if not exists round2_impact     integer check (round2_impact between 1 and 5);

alter table public.threats add column if not exists likelihood integer check (likelihood between 1 and 5);

alter table public.threats add column if not exists impact     integer check (impact between 1 and 5);

create table if not exists public.mitigations (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid references public.workspaces(id) on delete cascade not null,
  
  session_id          uuid references public.sessions(id) on delete set null,
  chain_id            uuid references public.chains(id) on delete set null,
  scenario_id         uuid references public.scenarios(id) on delete set null,

  title               text not null,
  description         text,
  control_type        text check (control_type in ('PREVENTIVE','DETECTIVE','RESPONSIVE')),
  effort              text check (effort in ('LOW','MEDIUM','HIGH')),
  time_to_deploy      text check (time_to_deploy in ('DAYS','WEEKS','MONTHS')),
  breaks_steps        jsonb default '[]',          
  effect              text,                         

  owner               text,
  status              text default 'proposed'
                        check (status in ('proposed','accepted','in_progress','implemented','verified','rejected')),

  
  inherent_likelihood  integer check (inherent_likelihood between 1 and 5),
  inherent_impact      integer check (inherent_impact between 1 and 5),
  residual_likelihood  integer check (residual_likelihood between 1 and 5),
  residual_impact      integer check (residual_impact between 1 and 5),

  source              text default 'manual',        
  notes               text,
  created_at          timestamptz default now() not null,
  updated_at          timestamptz default now() not null
);

create index if not exists mitigations_workspace on public.mitigations (workspace_id);

create index if not exists mitigations_session   on public.mitigations (session_id);

create index if not exists mitigations_status     on public.mitigations (status);

create table if not exists public.decisions (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid references public.workspaces(id) on delete cascade not null,
  title               text not null,
  description         text,
  acceptance_criteria text,
  status              text default 'framing'
                        check (status in ('framing','analyzing','decided','archived')),
  chosen_option_id    uuid,                       
  decision_rationale  text,
  decided_by          text,
  decided_at          timestamptz,
  created_at          timestamptz default now() not null,
  updated_at          timestamptz default now() not null
);

create table if not exists public.decision_options (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  decision_id  uuid references public.decisions(id) on delete cascade not null,
  name         text not null,
  description  text,
  sort_order   integer default 0,
  created_at   timestamptz default now() not null
);

create table if not exists public.decision_assumptions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  decision_id  uuid references public.decisions(id) on delete cascade not null,
  text         text not null,
  criticality  text default 'MEDIUM' check (criticality in ('LOW','MEDIUM','HIGH')),
  status       text default 'holds' check (status in ('holds','monitoring','invalidated')),
  created_at   timestamptz default now() not null
);

alter table public.sessions add column if not exists decision_id        uuid references public.decisions(id) on delete set null;

alter table public.sessions add column if not exists decision_option_id uuid references public.decision_options(id) on delete set null;

create index if not exists decisions_workspace on public.decisions (workspace_id);

create index if not exists decision_options_decision on public.decision_options (decision_id);

create index if not exists decision_assumptions_decision on public.decision_assumptions (decision_id);

create index if not exists sessions_decision on public.sessions (decision_id);

create table if not exists public.knowledge_documents (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  title        text not null,
  source       text,                          
  tags         text[] default '{}',
  content      text,
  created_at   timestamptz default now() not null
);

create table if not exists public.knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  document_id  uuid references public.knowledge_documents(id) on delete cascade not null,
  title        text,
  content      text not null,
  chunk_index  integer default 0,
  created_at   timestamptz default now() not null
);

create index if not exists knowledge_chunks_workspace on public.knowledge_chunks (workspace_id);

create index if not exists knowledge_chunks_document  on public.knowledge_chunks (document_id);

create index if not exists knowledge_chunks_fts on public.knowledge_chunks
  using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));

alter table public.mitigations
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

create index if not exists mitigations_session on public.mitigations (session_id);

ALTER TABLE public.agents
  
  ADD COLUMN IF NOT EXISTS expertise_boundaries jsonb   DEFAULT '{}',   
  
  ADD COLUMN IF NOT EXISTS tradecraft           jsonb   DEFAULT '{}',   
  
  ADD COLUMN IF NOT EXISTS risk_posture         jsonb   DEFAULT '{}',   
  
  ADD COLUMN IF NOT EXISTS debate_behavior      jsonb   DEFAULT '{}',   
  ADD COLUMN IF NOT EXISTS update_triggers      jsonb   DEFAULT '{}',   
  
  ADD COLUMN IF NOT EXISTS role_type            text    DEFAULT 'sme',  
  ADD COLUMN IF NOT EXISTS debiasing_instruction text,
  
  ADD COLUMN IF NOT EXISTS historical_strengths  jsonb  DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS historical_weaknesses jsonb  DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS weighting_adjustment  numeric(4,2) DEFAULT 1.0;

drop index if exists public.agents_is_library_idx;

drop index if exists public.agents_sme_search_idx;

alter table public.agents
  drop column if exists is_library_sme,
  drop column if exists quality_score,
  drop column if exists usage_count,
  drop column if exists cloned_from_id;

drop table if exists public.sme_tokens cascade;

alter table public.sessions drop constraint if exists sessions_mode_check;

alter table public.sessions
  add constraint sessions_mode_check check (mode in ('classic','live','panel'));

create table if not exists public.session_participants (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  session_id   uuid references public.sessions(id)   on delete cascade not null,
  name         text not null,
  role         text,                       
  cell         text default 'white'        
                 check (cell in ('red','blue','white')),
  created_at   timestamptz default now() not null
);

create index if not exists session_participants_session on public.session_participants (session_id);

alter table public.session_messages
  add column if not exists author_type text,   
  add column if not exists author_name text;

alter table public.session_agents
  add column if not exists cell text default 'blue'
    check (cell in ('red','blue','white'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='agentdebate_app') THEN
    CREATE ROLE agentdebate_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO agentdebate_app;
GRANT agentdebate_app TO CURRENT_USER;

CREATE INDEX IF NOT EXISTS agents_tenant_created ON public.agents(workspace_id,created_at,id);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.agents TO agentdebate_app;
CREATE POLICY local_read ON public.agents FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.agents FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.agents FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.agents FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) = 'admin');

CREATE INDEX IF NOT EXISTS domains_tenant_created ON public.domains(workspace_id,created_at,id);
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domains FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.domains TO agentdebate_app;
CREATE POLICY local_read ON public.domains FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.domains FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.domains FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.domains FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) = 'admin');

CREATE INDEX IF NOT EXISTS scenarios_tenant_created ON public.scenarios(workspace_id,created_at,id);
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarios FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.scenarios TO agentdebate_app;
CREATE POLICY local_read ON public.scenarios FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.scenarios FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.scenarios FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.scenarios FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) = 'admin');

CREATE INDEX IF NOT EXISTS threats_tenant_created ON public.threats(workspace_id,created_at,id);
ALTER TABLE public.threats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threats FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.threats TO agentdebate_app;
CREATE POLICY local_read ON public.threats FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.threats FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.threats FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.threats FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) = 'admin');

CREATE INDEX IF NOT EXISTS chains_tenant_created ON public.chains(workspace_id,created_at,id);
ALTER TABLE public.chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chains FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.chains TO agentdebate_app;
CREATE POLICY local_read ON public.chains FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.chains FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.chains FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.chains FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) = 'admin');

CREATE INDEX IF NOT EXISTS sessions_tenant_created ON public.sessions(workspace_id,created_at,id);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.sessions TO agentdebate_app;
CREATE POLICY local_read ON public.sessions FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.sessions FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.sessions FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.sessions FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) = 'admin');

CREATE INDEX IF NOT EXISTS session_agents_tenant_created ON public.session_agents(workspace_id,created_at,id);
ALTER TABLE public.session_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_agents FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.session_agents TO agentdebate_app;
CREATE POLICY local_read ON public.session_agents FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.session_agents FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.session_agents FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.session_agents FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) = 'admin');

CREATE INDEX IF NOT EXISTS session_syntheses_tenant_created ON public.session_syntheses(workspace_id,created_at,id);
ALTER TABLE public.session_syntheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_syntheses FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.session_syntheses TO agentdebate_app;
CREATE POLICY local_read ON public.session_syntheses FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.session_syntheses FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.session_syntheses FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.session_syntheses FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) = 'admin');

CREATE INDEX IF NOT EXISTS session_messages_tenant_created ON public.session_messages(workspace_id,created_at,id);
ALTER TABLE public.session_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_messages FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.session_messages TO agentdebate_app;
CREATE POLICY local_read ON public.session_messages FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.session_messages FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.session_messages FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.session_messages FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) = 'admin');

CREATE INDEX IF NOT EXISTS session_sources_tenant_created ON public.session_sources(workspace_id,created_at,id);
ALTER TABLE public.session_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_sources FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.session_sources TO agentdebate_app;
CREATE POLICY local_read ON public.session_sources FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.session_sources FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.session_sources FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.session_sources FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) = 'admin');

CREATE INDEX IF NOT EXISTS session_participants_tenant_created ON public.session_participants(workspace_id,created_at,id);
ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_participants FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.session_participants TO agentdebate_app;
CREATE POLICY local_read ON public.session_participants FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.session_participants FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.session_participants FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.session_participants FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) = 'admin');

CREATE INDEX IF NOT EXISTS app_configs_tenant_created ON public.app_configs(workspace_id,created_at,id);
ALTER TABLE public.app_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_configs FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.app_configs TO agentdebate_app;
CREATE POLICY local_read ON public.app_configs FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.app_configs FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.app_configs FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.app_configs FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) = 'admin');

CREATE INDEX IF NOT EXISTS mitigations_tenant_created ON public.mitigations(workspace_id,created_at,id);
ALTER TABLE public.mitigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitigations FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.mitigations TO agentdebate_app;
CREATE POLICY local_read ON public.mitigations FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.mitigations FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.mitigations FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.mitigations FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));

CREATE INDEX IF NOT EXISTS decisions_tenant_created ON public.decisions(workspace_id,created_at,id);
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.decisions TO agentdebate_app;
CREATE POLICY local_read ON public.decisions FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.decisions FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.decisions FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.decisions FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));

CREATE INDEX IF NOT EXISTS decision_options_tenant_created ON public.decision_options(workspace_id,created_at,id);
ALTER TABLE public.decision_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_options FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.decision_options TO agentdebate_app;
CREATE POLICY local_read ON public.decision_options FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.decision_options FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.decision_options FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.decision_options FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));

CREATE INDEX IF NOT EXISTS decision_assumptions_tenant_created ON public.decision_assumptions(workspace_id,created_at,id);
ALTER TABLE public.decision_assumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_assumptions FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.decision_assumptions TO agentdebate_app;
CREATE POLICY local_read ON public.decision_assumptions FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.decision_assumptions FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.decision_assumptions FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.decision_assumptions FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));

CREATE INDEX IF NOT EXISTS knowledge_documents_tenant_created ON public.knowledge_documents(workspace_id,created_at,id);
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.knowledge_documents TO agentdebate_app;
CREATE POLICY local_read ON public.knowledge_documents FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.knowledge_documents FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.knowledge_documents FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.knowledge_documents FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));

CREATE INDEX IF NOT EXISTS knowledge_chunks_tenant_created ON public.knowledge_chunks(workspace_id,created_at,id);
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.knowledge_chunks TO agentdebate_app;
CREATE POLICY local_read ON public.knowledge_chunks FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY local_insert ON public.knowledge_chunks FOR INSERT TO agentdebate_app WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_update ON public.knowledge_chunks FOR UPDATE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
CREATE POLICY local_delete ON public.knowledge_chunks FOR DELETE TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
