-- supabase/032_security_hardening.sql
-- Address Supabase advisor findings:
--   • ERROR security_definer_view: 4 views ran as owner, bypassing RLS on
--     locked-down PII tables (ordenes/clientes/historial_estados/usuarios).
--   • WARN function_search_path_mutable: 4 trigger/util functions had no
--     fixed search_path (search_path injection vector for SECURITY DEFINER
--     callers if ever changed).
--   • WARN rls_policy_always_true: tipos_servicio had a `FOR ALL USING(true)`
--     policy and notificaciones_enviadas a wide-open INSERT policy. Writes
--     on both tables already go through admin routes — drop the anon writes.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. SECURITY DEFINER views
-- ─────────────────────────────────────────────────────────────────────────

-- v_cadete_pendientes: created in the dashboard, never referenced from code.
DROP VIEW IF EXISTS public.v_cadete_pendientes;

-- The other three are consumed by code; switch them to security_invoker so
-- they honor the caller's RLS. Admin-client consumers (service_role) keep
-- working because service_role bypasses RLS.
ALTER VIEW public.v_ordenes_dashboard      SET (security_invoker = true);
ALTER VIEW public.v_items_resumen_cadete   SET (security_invoker = true);
ALTER VIEW public.v_talleres_stats         SET (security_invoker = true);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Function search_path
-- ─────────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.log_estado_change()                                   SET search_path = public, pg_temp;
ALTER FUNCTION public.log_estado_insert()                                   SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at()                                   SET search_path = public, pg_temp;
ALTER FUNCTION public.swap_item_orden(uuid, integer, uuid, integer)         SET search_path = public, pg_temp;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Tighten permissive RLS policies
-- ─────────────────────────────────────────────────────────────────────────

-- notificaciones_enviadas: webhook (Meta status updates) and the cron route
-- both use the admin client. No anon access is needed.
DROP POLICY IF EXISTS "Allow anon insert notificaciones" ON public.notificaciones_enviadas;
DROP POLICY IF EXISTS "Allow anon read notificaciones"   ON public.notificaciones_enviadas;
DROP POLICY IF EXISTS "Authenticated users full access"  ON public.notificaciones_enviadas;

-- tipos_servicio: SELECT is needed from client components (NuevoIngresoModal
-- populates a dropdown). Writes move to /api/admin/tipos-servicio.
DROP POLICY IF EXISTS "Allow anon full access tipos_servicio" ON public.tipos_servicio;
DROP POLICY IF EXISTS "Authenticated users full access"      ON public.tipos_servicio;

CREATE POLICY "Allow anon read tipos_servicio" ON public.tipos_servicio
  FOR SELECT USING (true);

COMMIT;
