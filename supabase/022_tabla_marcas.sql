-- 022_tabla_marcas.sql
-- Tabla de marcas administrables.

CREATE TABLE marcas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE marcas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON marcas
  FOR ALL USING (auth.role() = 'authenticated');
