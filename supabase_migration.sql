-- ═══════════════════════════════════════════════════════════════════════
-- Supabase migration — app_state table
-- Planeamento de Recursos · Equipa Processos INEGI
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app_state (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT        NOT NULL UNIQUE,   -- separates data between projects
  data        JSONB       NOT NULL,          -- full app state blob
  version     BIGINT      NOT NULL DEFAULT 1, -- incremented on each write for conflict detection
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security: allow the anon key to read and write
-- (the anon key is embedded in the app, equivalent to the old GL.token)
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read"  ON app_state FOR SELECT USING (true);
CREATE POLICY "anon write" ON app_state FOR ALL    USING (true);

-- ── Seed the initial row for the Processos planning app ─────────────────
-- Run this after uploading your current state.json via the app's
-- "Carregar JSON" feature, or paste the JSON directly here:
--
-- INSERT INTO app_state (project_id, data, version)
-- VALUES ('team-planning-processos', '{}'::jsonb, 1)
-- ON CONFLICT (project_id) DO NOTHING;
