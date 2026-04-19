-- supabase/026_cadete_ordenes.sql
-- Add orden-based items support for cadete resumenes

BEGIN;

-- 1. Add orden_id column
ALTER TABLE items_resumen_cadete
  ADD COLUMN IF NOT EXISTS orden_id UUID REFERENCES ordenes(id) ON DELETE SET NULL;

-- 2. Add subtipo column (for orden items: 'retirar_de_taller' or 'llevar_a_taller')
ALTER TABLE items_resumen_cadete
  ADD COLUMN IF NOT EXISTS subtipo TEXT;

-- 3. Update tipo constraint to allow 'orden'
ALTER TABLE items_resumen_cadete DROP CONSTRAINT IF EXISTS items_resumen_cadete_tipo_check;
ALTER TABLE items_resumen_cadete ADD CONSTRAINT items_resumen_cadete_tipo_check
  CHECK (tipo IN ('traslado', 'ad_hoc', 'orden'));

-- 4. Update the composite validation constraint
ALTER TABLE items_resumen_cadete DROP CONSTRAINT IF EXISTS items_tipo_check;
ALTER TABLE items_resumen_cadete ADD CONSTRAINT items_tipo_check CHECK (
  (tipo = 'traslado' AND traslado_id IS NOT NULL)
  OR (tipo = 'ad_hoc' AND descripcion IS NOT NULL)
  OR (tipo = 'orden' AND orden_id IS NOT NULL AND subtipo IS NOT NULL)
);

-- 5. Index for deduplication lookups
CREATE INDEX IF NOT EXISTS idx_items_resumen_cadete_orden
  ON items_resumen_cadete(orden_id) WHERE orden_id IS NOT NULL;

-- 6. Update the view to include orden-based items
CREATE OR REPLACE VIEW v_items_resumen_cadete AS
SELECT
  i.id AS item_id,
  i.resumen_id,
  i.tipo,
  i.subtipo,
  i.orden,
  i.created_at,
  -- Traslado fields (NULL for ad_hoc and orden)
  t.id AS traslado_id,
  t.tipo AS traslado_tipo,
  t.estado AS traslado_estado,
  -- Article fields: from traslado->orden OR direct orden
  COALESCE(o_t.tipo_articulo, o_d.tipo_articulo) AS tipo_articulo,
  COALESCE(o_t.marca, o_d.marca) AS marca,
  COALESCE(o_t.modelo, o_d.modelo) AS modelo,
  -- Traslado branch names
  so.nombre AS sucursal_origen_nombre,
  sd.nombre AS sucursal_destino_nombre,
  -- Ad-hoc fields
  i.descripcion,
  -- Orden-specific fields (NULL for traslado/ad_hoc)
  i.orden_id,
  o_d.numero_orden,
  o_d.estado AS orden_estado,
  taller_d.nombre AS orden_taller_nombre,
  taller_d.direccion AS orden_taller_direccion,
  s_orden.nombre AS orden_sucursal_nombre
FROM items_resumen_cadete i
LEFT JOIN traslados t ON i.traslado_id = t.id
LEFT JOIN ordenes o_t ON t.orden_id = o_t.id
LEFT JOIN ordenes o_d ON i.orden_id = o_d.id
LEFT JOIN talleres taller_d ON o_d.taller_id = taller_d.id
LEFT JOIN sucursales s_orden ON o_d.sucursal_id = s_orden.id
LEFT JOIN sucursales so ON t.sucursal_origen = so.id
LEFT JOIN sucursales sd ON t.sucursal_destino = sd.id
ORDER BY i.orden ASC, i.created_at ASC;

COMMIT;
