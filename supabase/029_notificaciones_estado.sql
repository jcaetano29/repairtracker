-- Agregar tracking de estado de entrega de WhatsApp
ALTER TABLE notificaciones_enviadas
  ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_notificaciones_wa_message_id
  ON notificaciones_enviadas(wa_message_id)
  WHERE wa_message_id IS NOT NULL;
