-- supabase/037_whatsapp_conversaciones_unread.sql
-- Per-conversation unread tracking for the WhatsApp inbox chat list, to
-- complement the existing global inbox badge (036_whatsapp_inbox_estado.sql).

BEGIN;

ALTER TABLE whatsapp_conversaciones
  ADD COLUMN last_incoming_message_at TIMESTAMPTZ,
  ADD COLUMN last_read_at TIMESTAMPTZ;

-- Existing conversations start as "read" so none appear falsely unread the
-- moment this ships. New rows get last_read_at = NULL, which
-- getConversaciones() (lib/whatsapp.js) treats as "read" only once there's
-- an incoming message — this avoids comparing an app-clock timestamp
-- against a DB-clock DEFAULT NOW(), which would make a brand-new
-- conversation's very first message wrongly appear already-read.
UPDATE whatsapp_conversaciones SET last_read_at = NOW();

COMMIT;
