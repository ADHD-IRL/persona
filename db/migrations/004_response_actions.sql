-- Existing actions remain unclassified until the analyst chooses a purpose.
ALTER TABLE mitigations ADD COLUMN action_type text NOT NULL DEFAULT 'unspecified'
 CHECK (action_type IN ('unspecified','verify','reduce','monitor'));
