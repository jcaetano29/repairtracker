CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'empleado' CHECK (role IN ('empleado', 'dueno')),
  created_at timestamptz DEFAULT now()
);
