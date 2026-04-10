-- supabase/011_rename_roles.sql
-- Rename roles: dueno → admin, empleado → employee

BEGIN;

-- 1. Drop the existing CHECK constraint
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;

-- 2. Migrate existing data
UPDATE public.usuarios SET role = 'admin' WHERE role = 'dueno';
UPDATE public.usuarios SET role = 'employee' WHERE role = 'empleado';

-- 3. Update the default value
ALTER TABLE public.usuarios ALTER COLUMN role SET DEFAULT 'employee';

-- 4. Recreate the CHECK constraint with new role names
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_role_check CHECK (role IN ('employee', 'admin'));

-- 5. Drop and recreate RLS policies on configuracion that reference old role name
DROP POLICY IF EXISTS "dueño_read_configuracion" ON configuracion;
DROP POLICY IF EXISTS "dueño_update_configuracion" ON configuracion;

CREATE POLICY "admin_read_configuracion" ON configuracion
  FOR SELECT
  USING (
    (SELECT role FROM public.usuarios WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "admin_update_configuracion" ON configuracion
  FOR UPDATE
  USING (
    (SELECT role FROM public.usuarios WHERE id = auth.uid()) = 'admin'
  );

COMMIT;
