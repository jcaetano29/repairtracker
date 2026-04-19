-- supabase/025_vista_cadete.sql
-- Add cadete role and resumen tables

BEGIN;

-- ============================================================
-- 1. Add 'cadete' to usuarios role constraint
-- ============================================================
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_role_check
  CHECK (role IN ('admin', 'employee', 'cadete'));

-- ============================================================
-- 2. Create resumenes_cadete table
-- ============================================================
CREATE TABLE IF NOT EXISTS resumenes_cadete (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cadete_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_por UUID NOT NULL REFERENCES usuarios(id),
  nombre TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resumenes_cadete_cadete_activo
  ON resumenes_cadete(cadete_id, activo);

-- Trigger for updated_at (reuses existing function from 001_schema.sql)
CREATE TRIGGER update_resumenes_cadete_updated_at
  BEFORE UPDATE ON resumenes_cadete
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE resumenes_cadete ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON resumenes_cadete
  FOR ALL USING (auth.role() = 'authenticated' OR true);

-- ============================================================
-- 3. Create items_resumen_cadete table
-- ============================================================
CREATE TABLE IF NOT EXISTS items_resumen_cadete (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resumen_id UUID NOT NULL REFERENCES resumenes_cadete(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('traslado', 'ad_hoc')),
  traslado_id UUID REFERENCES traslados(id) ON DELETE SET NULL,
  descripcion TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT items_tipo_check CHECK (
    (tipo = 'traslado' AND traslado_id IS NOT NULL)
    OR (tipo = 'ad_hoc' AND descripcion IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_items_resumen_cadete_resumen
  ON items_resumen_cadete(resumen_id);

-- RLS
ALTER TABLE items_resumen_cadete ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON items_resumen_cadete
  FOR ALL USING (auth.role() = 'authenticated' OR true);

-- ============================================================
-- 4. Create view for cadete item display
-- ============================================================
CREATE OR REPLACE VIEW v_items_resumen_cadete AS
SELECT
  i.id AS item_id,
  i.resumen_id,
  i.tipo,
  i.orden,
  i.created_at,
  -- Traslado fields (NULL for ad_hoc)
  t.id AS traslado_id,
  t.tipo AS traslado_tipo,
  t.estado AS traslado_estado,
  o.tipo_articulo,
  o.marca,
  o.modelo,
  so.nombre AS sucursal_origen_nombre,
  sd.nombre AS sucursal_destino_nombre,
  -- Ad-hoc fields (NULL for traslado)
  i.descripcion
FROM items_resumen_cadete i
LEFT JOIN traslados t ON i.traslado_id = t.id
LEFT JOIN ordenes o ON t.orden_id = o.id
LEFT JOIN sucursales so ON t.sucursal_origen = so.id
LEFT JOIN sucursales sd ON t.sucursal_destino = sd.id
ORDER BY i.orden ASC, i.created_at ASC;

COMMIT;
