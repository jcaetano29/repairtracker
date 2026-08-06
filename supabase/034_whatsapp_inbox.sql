-- supabase/034_whatsapp_inbox.sql
-- WhatsApp inbox: incoming message storage + full conversation thread

BEGIN;

-- ============================================================
-- clientes.telefono_e164 — normalized phone for matching wa_id
-- ============================================================
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefono_e164 TEXT;

-- Backfill existing rows. Mirrors lib/phone.js normalizePhoneToE164() —
-- keep both in sync if the normalization rules ever change. Dial codes from
-- lib/countries.js, checked longest-first: 598 (UY), 595 (PY), then the
-- 2-digit dials (54 AR, 55 BR, 56 CL, 34 ES), then 1 (US).
UPDATE clientes
SET telefono_e164 = CASE
  WHEN regexp_replace(telefono, '\D', '', 'g') ~ '^598\d+$'
       AND length(regexp_replace(telefono, '\D', '', 'g')) > 9
    THEN '+' || regexp_replace(telefono, '\D', '', 'g')
  WHEN regexp_replace(telefono, '\D', '', 'g') ~ '^595\d+$'
       AND length(regexp_replace(telefono, '\D', '', 'g')) > 9
    THEN '+' || regexp_replace(telefono, '\D', '', 'g')
  WHEN regexp_replace(telefono, '\D', '', 'g') ~ '^(54|55|56|34)\d+$'
       AND length(regexp_replace(telefono, '\D', '', 'g')) > 8
    THEN '+' || regexp_replace(telefono, '\D', '', 'g')
  WHEN regexp_replace(telefono, '\D', '', 'g') ~ '^1\d+$'
       AND length(regexp_replace(telefono, '\D', '', 'g')) > 7
    THEN '+' || regexp_replace(telefono, '\D', '', 'g')
  -- Legado uruguayo sin dial, con 0 de tronco, ej "099123456"
  WHEN regexp_replace(telefono, '\D', '', 'g') ~ '^0\d{8}$'
    THEN '+598' || substring(regexp_replace(telefono, '\D', '', 'g') from 2)
  -- Legado uruguayo sin dial y sin 0, 8 dígitos
  WHEN regexp_replace(telefono, '\D', '', 'g') ~ '^\d{8}$'
    THEN '+598' || regexp_replace(telefono, '\D', '', 'g')
  ELSE NULL
END
WHERE telefono IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_telefono_e164 ON clientes(telefono_e164);

-- ============================================================
-- whatsapp_conversaciones — one thread per cliente
-- ============================================================
CREATE TABLE whatsapp_conversaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES clientes(id) NOT NULL UNIQUE,
  telefono_e164 TEXT NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_conversaciones_last_message
  ON whatsapp_conversaciones(last_message_at DESC);

-- ============================================================
-- whatsapp_mensajes — both directions, one row per message
-- ============================================================
CREATE TABLE whatsapp_mensajes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversacion_id UUID REFERENCES whatsapp_conversaciones(id) ON DELETE CASCADE NOT NULL,
  direccion TEXT NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  wa_message_id TEXT UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('text', 'other')),
  body TEXT,
  estado TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_mensajes_conversacion
  ON whatsapp_mensajes(conversacion_id, created_at);

-- ============================================================
-- RLS — PII (client identity, phone, message content). Same lockdown
-- criterion as supabase/031_lockdown_pii.sql: no anon/authenticated
-- policies at all. All access goes through getSupabaseAdmin() from
-- authenticated API routes. service_role bypasses RLS automatically.
-- ============================================================
ALTER TABLE whatsapp_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_mensajes ENABLE ROW LEVEL SECURITY;

COMMIT;
