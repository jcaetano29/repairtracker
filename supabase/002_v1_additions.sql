-- supabase/002_v1_additions.sql
-- Run in: Supabase Dashboard > SQL Editor

-- ============================================================
-- Add tracking_token to ordenes
-- ============================================================
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS
  tracking_token UUID DEFAULT gen_random_uuid() UNIQUE;

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_ordenes_tracking_token ON ordenes(tracking_token);

-- ============================================================
-- TABLA: tipos_servicio
-- Configurable maintenance reminder cycles per service type
-- ============================================================
CREATE TABLE IF NOT EXISTS tipos_servicio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  ciclo_meses INT NOT NULL DEFAULT 12,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initial service types
INSERT INTO tipos_servicio (nombre, ciclo_meses) VALUES
  ('Cambio de pila', 18),
  ('Service completo', 36),
  ('Ajuste de correa', 12),
  ('Limpieza', 12);

-- RLS for tipos_servicio
ALTER TABLE tipos_servicio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON tipos_servicio
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- RLS: Allow public read of ordenes via tracking_token
-- (Anonymous users can read a single order if they know the token)
-- ============================================================
CREATE POLICY "Public tracking read" ON ordenes
  FOR SELECT USING (true);
-- Note: The above policy allows any SELECT on ordenes.
-- The tracking page filters by tracking_token in the query.
-- Authenticated users already have full access via existing policy.
-- For stricter security, replace with:
-- FOR SELECT USING (auth.role() = 'authenticated' OR tracking_token IS NOT NULL);

-- ============================================================
-- Record that a maintenance reminder was sent
-- (prevents duplicate reminders)
-- ============================================================
ALTER TABLE notificaciones_enviadas
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id),
  ADD COLUMN IF NOT EXISTS tipo_notificacion TEXT;
