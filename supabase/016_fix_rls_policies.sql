-- supabase/016_fix_rls_policies.sql
-- Fix RLS policies: remove OR true that bypasses authentication

BEGIN;

-- Fix traslados RLS
DROP POLICY IF EXISTS "Authenticated users full access" ON traslados;
CREATE POLICY "Authenticated users full access" ON traslados
  FOR ALL USING (auth.role() = 'authenticated');

-- Fix sucursales RLS
DROP POLICY IF EXISTS "Authenticated users full access" ON sucursales;
CREATE POLICY "Authenticated users full access" ON sucursales
  FOR ALL USING (auth.role() = 'authenticated');

-- Add composite index for view performance
CREATE INDEX IF NOT EXISTS idx_traslados_orden_estado_created
  ON traslados(orden_id, estado, created_at DESC);

COMMIT;
