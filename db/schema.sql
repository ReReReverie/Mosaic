CREATE TABLE IF NOT EXISTS creative_reference_sessions (
  session_id TEXT PRIMARY KEY,
  brief TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS creative_reference_sessions_created_at_idx
  ON creative_reference_sessions (created_at DESC);
