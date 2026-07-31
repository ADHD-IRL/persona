-- Panel Mode: SMEs act as a standing expert panel alongside human teammates.
-- Additive + idempotent.

-- 1 · Allow the new session mode. `mode` carries a CHECK constraint, so it must
--     be dropped and recreated to admit 'panel'.
alter table public.sessions drop constraint if exists sessions_mode_check;
alter table public.sessions
  add constraint sessions_mode_check check (mode in ('classic','live','panel'));

-- 2 · Human participants in a panel session (SMEs are session_agents).
create table if not exists public.session_participants (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  session_id   uuid references public.sessions(id)   on delete cascade not null,
  name         text not null,
  role         text,                       -- e.g. "Program Manager", "Security Lead"
  cell         text default 'white'        -- reserved for Phase 2 (red|blue|white)
                 check (cell in ('red','blue','white')),
  created_at   timestamptz default now() not null
);

create index if not exists session_participants_session on public.session_participants (session_id);

alter table public.session_participants enable row level security;
drop policy if exists "session_participants_read" on public.session_participants;
create policy "session_participants_read"  on public.session_participants for select using (is_member(workspace_id));
drop policy if exists "session_participants_write" on public.session_participants;
create policy "session_participants_write" on public.session_participants for all using (can_write(workspace_id));

-- 3 · Message authorship, so a transcript can distinguish a human teammate from
--     an AI SME (and name them) rather than lumping everything under 'user'.
alter table public.session_messages
  add column if not exists author_type text,   -- 'human' | 'sme' | 'system'
  add column if not exists author_name text;

-- 4 · Cell assignment per SME (reserved for Phase 2 red/blue/white cells).
alter table public.session_agents
  add column if not exists cell text default 'blue'
    check (cell in ('red','blue','white'));
