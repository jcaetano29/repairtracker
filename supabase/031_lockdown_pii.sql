-- supabase/031_lockdown_pii.sql
-- Drop the wide-open "Allow anon ..." policies on PII tables. After this,
-- anon JWT can no longer read/write clientes, ordenes, historial_estados.
-- Reads and writes must go through API routes that use the service-role
-- admin client (lib/data.js + /api/{ordenes,clientes,stats,reportes,...}).
--
-- The /seguimiento/[token] page already uses getSupabaseAdmin(), so the
-- public tracking flow is unaffected.

BEGIN;

-- ─── clientes ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon read clientes" ON public.clientes;
DROP POLICY IF EXISTS "Allow anon insert clientes" ON public.clientes;
DROP POLICY IF EXISTS "Allow anon update clientes" ON public.clientes;
DROP POLICY IF EXISTS "Allow anon delete clientes" ON public.clientes;

-- ─── ordenes ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon read ordenes" ON public.ordenes;
DROP POLICY IF EXISTS "Allow anon insert ordenes" ON public.ordenes;
DROP POLICY IF EXISTS "Allow anon update ordenes" ON public.ordenes;
DROP POLICY IF EXISTS "Allow anon delete ordenes" ON public.ordenes;
DROP POLICY IF EXISTS "Public tracking read" ON public.ordenes;

-- ─── historial_estados ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon read historial" ON public.historial_estados;
DROP POLICY IF EXISTS "Allow anon insert historial" ON public.historial_estados;

-- No replacement policies: service_role bypasses RLS, so admin-client code
-- continues to work. Anon gets zero rows / write-denied.

COMMIT;
