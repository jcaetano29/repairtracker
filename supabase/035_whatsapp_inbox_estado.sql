-- Shared "last read" marker for the WhatsApp inbox badge — one row, applies
-- to everyone (not per-user).

BEGIN;

CREATE TABLE whatsapp_inbox_estado (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO whatsapp_inbox_estado (id, last_read_at) VALUES (1, NOW());

-- PII-adjacent (implies message activity) — same lockdown criterion as
-- 031_lockdown_pii.sql / 034_whatsapp_inbox.sql: no anon/authenticated
-- policies. All access via getSupabaseAdmin() from authenticated API routes.
ALTER TABLE whatsapp_inbox_estado ENABLE ROW LEVEL SECURITY;

COMMIT;
