-- supabase/030_lockdown_rls.sql
-- Fix RLS misconfiguration. NextAuth (not Supabase Auth) is in use, so anon JWT
-- never has auth.uid()/auth.role()='authenticated'. Several tables had policies
-- that required 'authenticated' which silently returned [] to the anon client.
-- This migration:
--   1. Locks down 'usuarios' fully (only service_role bypasses RLS). Auth uses
--      getSupabaseAdmin(), so login keeps working.
--   2. Opens 'sucursales', 'marcas', 'traslados' to anon read so the existing
--      anon-client based reads in lib/data.js and lib/traslados.js work. Writes
--      still go through admin-client routes that bypass RLS.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- usuarios: lock down completely. service_role bypasses RLS automatically.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Allow anon insert usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Allow anon update usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Allow anon delete usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.usuarios;
DROP POLICY IF EXISTS "anon_no_access_usuarios" ON public.usuarios;

-- No policies = no access for anon/authenticated. service_role always bypasses.

-- ─────────────────────────────────────────────────────────────────────────
-- sucursales: allow anon read so client components (NuevoIngresoModal, etc.)
-- can populate selectors. Writes stay on admin-only API routes.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users full access" ON public.sucursales;
DROP POLICY IF EXISTS "Allow anon read sucursales" ON public.sucursales;

CREATE POLICY "Allow anon read sucursales" ON public.sucursales
  FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────────────────
-- marcas: same pattern as sucursales.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users full access" ON public.marcas;
DROP POLICY IF EXISTS "Allow anon read marcas" ON public.marcas;

CREATE POLICY "Allow anon read marcas" ON public.marcas
  FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────────────────
-- traslados: same pattern. lib/traslados.js uses the anon client.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users full access" ON public.traslados;
DROP POLICY IF EXISTS "Allow anon read traslados" ON public.traslados;

CREATE POLICY "Allow anon read traslados" ON public.traslados
  FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────────────────
-- configuracion: same pattern. Was admin-only — already addressed in code by
-- routing reads through the API or admin client, but make the policy match
-- intent (data is non-sensitive; the GET endpoint exposes it without auth).
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_read_configuracion" ON public.configuracion;
DROP POLICY IF EXISTS "admin_update_configuracion" ON public.configuracion;
DROP POLICY IF EXISTS "Allow anon read configuracion" ON public.configuracion;

CREATE POLICY "Allow anon read configuracion" ON public.configuracion
  FOR SELECT USING (true);

COMMIT;
