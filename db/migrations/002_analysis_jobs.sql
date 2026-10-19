CREATE TABLE public.analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','complete','failed','cancelled')),
  input jsonb NOT NULL,
  snapshot jsonb NOT NULL,
  fingerprint text NOT NULL,
  checkpoints jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  error text,
  progress jsonb NOT NULL DEFAULT '{}',
  cancel_requested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analysis_jobs_workspace_created ON analysis_jobs(workspace_id, created_at DESC);
CREATE INDEX analysis_jobs_pending ON analysis_jobs(created_at) WHERE status = 'queued';
CREATE UNIQUE INDEX analysis_jobs_active_input ON analysis_jobs(workspace_id, fingerprint) WHERE status IN ('queued','running');
ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_jobs FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON analysis_jobs TO agentdebate_app;
CREATE POLICY analysis_read ON analysis_jobs FOR SELECT TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY analysis_write ON analysis_jobs FOR ALL TO agentdebate_app USING (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst')) WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id',true),'')::uuid AND current_setting('app.member_role',true) IN ('admin','analyst'));
ALTER TABLE mitigations ADD COLUMN analysis_job_id uuid REFERENCES analysis_jobs(id) ON DELETE SET NULL;
ALTER TABLE mitigations ADD COLUMN action_index integer;
ALTER TABLE mitigations ADD COLUMN completion_criteria text;
ALTER TABLE mitigations ADD COLUMN due_date date;
ALTER TABLE mitigations ADD COLUMN evidence_ids jsonb NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX mitigations_analysis_action ON mitigations(analysis_job_id, action_index) WHERE analysis_job_id IS NOT NULL;
ALTER TABLE sessions ADD COLUMN analysis_job_id uuid REFERENCES analysis_jobs(id) ON DELETE SET NULL;
CREATE INDEX sessions_analysis_job ON sessions(analysis_job_id) WHERE analysis_job_id IS NOT NULL;
