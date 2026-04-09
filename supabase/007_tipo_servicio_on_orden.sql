-- supabase/007_tipo_servicio_on_orden.sql
-- Link orders directly to a service type for maintenance reminders

ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS tipo_servicio_id UUID REFERENCES tipos_servicio(id);

CREATE INDEX IF NOT EXISTS idx_ordenes_tipo_servicio ON ordenes(tipo_servicio_id);
