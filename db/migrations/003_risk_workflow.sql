-- Review metadata preserves existing library entries as unreviewed findings.
ALTER TABLE threats
 ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review' CHECK (review_status IN ('needs_review','reviewed','monitoring','archived')),
 ADD COLUMN owner text NOT NULL DEFAULT '',
 ADD COLUMN confidence text NOT NULL DEFAULT 'unassessed' CHECK (confidence IN ('unassessed','low','medium','high')),
 ADD COLUMN rationale text NOT NULL DEFAULT '',
 ADD COLUMN evidence jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(evidence)='array'),
 ADD COLUMN reviewed_context text,
 ADD COLUMN last_reviewed_at timestamptz,
 ADD COLUMN analysis_job_id uuid REFERENCES analysis_jobs(id) ON DELETE SET NULL,
 ADD COLUMN source_key text,
 ADD COLUMN merged_into uuid REFERENCES threats(id) ON DELETE RESTRICT,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX threats_review_idx ON threats(workspace_id,scenario_id,review_status);
CREATE INDEX threats_job_idx ON threats(analysis_job_id);
CREATE INDEX threats_merged_idx ON threats(merged_into);
CREATE UNIQUE INDEX threats_source_key_idx ON threats(workspace_id,source_key) WHERE source_key IS NOT NULL;
ALTER TABLE chains
 ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review' CHECK (review_status IN ('needs_review','reviewed','monitoring','archived')),
 ADD COLUMN owner text NOT NULL DEFAULT '',
 ADD COLUMN confidence text NOT NULL DEFAULT 'unassessed' CHECK (confidence IN ('unassessed','low','medium','high')),
 ADD COLUMN rationale text NOT NULL DEFAULT '',
 ADD COLUMN evidence jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(evidence)='array'),
 ADD COLUMN reviewed_context text,
 ADD COLUMN last_reviewed_at timestamptz,
 ADD COLUMN analysis_job_id uuid REFERENCES analysis_jobs(id) ON DELETE SET NULL,
 ADD COLUMN source_key text,
 ADD COLUMN merged_into uuid REFERENCES chains(id) ON DELETE RESTRICT,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX chains_review_idx ON chains(workspace_id,scenario_id,review_status);
CREATE INDEX chains_job_idx ON chains(analysis_job_id);
CREATE INDEX chains_merged_idx ON chains(merged_into);
CREATE UNIQUE INDEX chains_source_key_idx ON chains(workspace_id,source_key) WHERE source_key IS NOT NULL;
ALTER TABLE threats ADD COLUMN session_id uuid;
ALTER TABLE mitigations ADD COLUMN threat_id uuid REFERENCES threats(id) ON DELETE RESTRICT;
ALTER TABLE mitigations ADD COLUMN risk_action_key text;
CREATE UNIQUE INDEX mitigations_risk_action_idx ON mitigations(workspace_id,risk_action_key) WHERE risk_action_key IS NOT NULL;
CREATE INDEX mitigations_threat_idx ON mitigations(threat_id);
CREATE INDEX IF NOT EXISTS mitigations_chain_idx ON mitigations(chain_id);
CREATE INDEX IF NOT EXISTS chains_threat_idx ON chains(threat_id);
