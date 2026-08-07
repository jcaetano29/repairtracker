-- supabase/037_whatsapp_conversaciones_unread.sql
-- Per-conversation unread tracking for the WhatsApp inbox chat list, to
-- complement the existing global inbox badge (036_whatsapp_inbox_estado.sql).

BEGIN;

ALTER TABLE whatsapp_conversaciones
  ADD COLUMN last_incoming_message_at TIMESTAMPTZ,
  ADD COLUMN last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMIT;
