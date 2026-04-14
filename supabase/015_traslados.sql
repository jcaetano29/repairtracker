-- supabase/015_traslados.sql
-- Add traslados (transfers) between branches functionality

BEGIN;

-- ============================================================
-- ALTER TABLE sucursales: Add es_centro_reparacion column
-- ============================================================
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS es_centro_reparacion BOOLEAN DEFAULT false;

-- Mark Punta Carretas as the repair center
UPDATE sucursales SET es_centro_reparacion = true WHERE nombre = 'Punta Carretas';

-- ============================================================
-- ALTER TABLE ordenes: Add sucursal_recepcion_id and sucursal_retiro_id
-- ============================================================
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS sucursal_recepcion_id UUID REFERENCES sucursales(id);
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS sucursal_retiro_id UUID REFERENCES sucursales(id);

-- Backfill: set both columns to current sucursal_id
UPDATE ordenes SET sucursal_recepcion_id = sucursal_id WHERE sucursal_recepcion_id IS NULL;
UPDATE ordenes SET sucursal_retiro_id = sucursal_id WHERE sucursal_retiro_id IS NULL;

-- Apply NOT NULL after backfill
ALTER TABLE ordenes ALTER COLUMN sucursal_recepcion_id SET NOT NULL;
ALTER TABLE ordenes ALTER COLUMN sucursal_retiro_id SET NOT NULL;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_ordenes_sucursal_recepcion ON ordenes(sucursal_recepcion_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_sucursal_retiro ON ordenes(sucursal_retiro_id);

-- ============================================================
-- CREATE TABLE traslados
-- ============================================================
CREATE TABLE IF NOT EXISTS traslados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_id UUID NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  sucursal_origen UUID NOT NULL REFERENCES sucursales(id),
  sucursal_destino UUID NOT NULL REFERENCES sucursales(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('ida', 'retorno')),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_transito', 'recibido')),
  creado_por UUID,
  recibido_por UUID,
  fecha_salida TIMESTAMPTZ,
  fecha_recepcion TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on traslados
ALTER TABLE traslados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON traslados
  FOR ALL USING (auth.role() = 'authenticated' OR true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_traslados_orden ON traslados(orden_id);
CREATE INDEX IF NOT EXISTS idx_traslados_origen ON traslados(sucursal_origen);
CREATE INDEX IF NOT EXISTS idx_traslados_destino ON traslados(sucursal_destino);
CREATE INDEX IF NOT EXISTS idx_traslados_estado ON traslados(estado);
CREATE INDEX IF NOT EXISTS idx_traslados_created_by ON traslados(creado_por);
CREATE INDEX IF NOT EXISTS idx_traslados_received_by ON traslados(recibido_por);

-- Create trigger for updated_at (using existing function from 001_schema.sql)
CREATE TRIGGER update_traslados_updated_at
  BEFORE UPDATE ON traslados
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- UPDATE VIEW: v_ordenes_dashboard — add new columns and traslado info
-- ============================================================
DROP VIEW IF EXISTS v_ordenes_dashboard;
CREATE VIEW v_ordenes_dashboard AS
SELECT
  o.id,
  o.numero_orden,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
  c.email AS cliente_email,
  c.id AS cliente_id,
  o.tipo_articulo,
  o.marca,
  o.modelo,
  o.nombre_articulo,
  o.problema_reportado,
  o.estado,
  o.taller_id,
  t.nombre AS taller_nombre,
  o.sucursal_id,
  s.nombre AS sucursal_nombre,
  o.sucursal_recepcion_id,
  sr.nombre AS sucursal_recepcion_nombre,
  o.sucursal_retiro_id,
  srt.nombre AS sucursal_retiro_nombre,
  o.tipo_servicio_id,
  o.monto_presupuesto,
  o.moneda,
  o.presupuesto_aprobado,
  o.monto_final,
  o.notas_internas,
  o.foto_ingreso,
  o.tracking_token,
  o.fecha_ingreso,
  o.fecha_envio_taller,
  o.fecha_presupuesto,
  o.fecha_aprobacion,
  o.fecha_listo,
  o.fecha_entrega,
  o.updated_at,
  -- Días en estado actual
  EXTRACT(DAY FROM NOW() - o.updated_at)::INT AS dias_en_estado,
  -- Días totales desde ingreso
  EXTRACT(DAY FROM NOW() - o.fecha_ingreso)::INT AS dias_totales,
  CASE
    WHEN o.estado IN ('INGRESADO', 'ESPERANDO_PRESUPUESTO')
         AND NOW() - o.updated_at > INTERVAL '6 days' THEN 'grave'
    WHEN o.estado IN ('INGRESADO', 'ESPERANDO_PRESUPUESTO')
         AND NOW() - o.updated_at > INTERVAL '3 days' THEN 'leve'
    WHEN o.estado = 'ENVIADO_A_TALLER'
         AND NOW() - o.updated_at > INTERVAL '10 days' THEN 'grave'
    WHEN o.estado = 'ENVIADO_A_TALLER'
         AND NOW() - o.updated_at > INTERVAL '5 days' THEN 'leve'
    WHEN o.estado = 'ESPERANDO_APROBACION'
         AND NOW() - o.updated_at > INTERVAL '4 days' THEN 'grave'
    WHEN o.estado = 'ESPERANDO_APROBACION'
         AND NOW() - o.updated_at > INTERVAL '2 days' THEN 'leve'
    WHEN o.estado = 'EN_REPARACION'
         AND NOW() - o.updated_at > INTERVAL '30 days' THEN 'grave'
    WHEN o.estado = 'EN_REPARACION'
         AND NOW() - o.updated_at > INTERVAL '15 days' THEN 'leve'
    WHEN o.estado = 'LISTO_PARA_RETIRO'
         AND NOW() - o.updated_at > INTERVAL '10 days' THEN 'grave'
    WHEN o.estado = 'LISTO_PARA_RETIRO'
         AND NOW() - o.updated_at > INTERVAL '5 days' THEN 'leve'
    ELSE 'none'
  END AS nivel_retraso,
  -- Active traslado (non-recibido) for this order
  tl.id AS traslado_activo_id,
  tl.tipo AS traslado_activo_tipo,
  tl.estado AS traslado_activo_estado
FROM ordenes o
LEFT JOIN clientes c ON o.cliente_id = c.id
LEFT JOIN talleres t ON o.taller_id = t.id
LEFT JOIN sucursales s ON o.sucursal_id = s.id
LEFT JOIN sucursales sr ON o.sucursal_recepcion_id = sr.id
LEFT JOIN sucursales srt ON o.sucursal_retiro_id = srt.id
LEFT JOIN LATERAL (
  SELECT tl2.id, tl2.tipo, tl2.estado
  FROM traslados tl2
  WHERE tl2.orden_id = o.id AND tl2.estado != 'recibido'
  ORDER BY tl2.created_at DESC
  LIMIT 1
) tl ON true;

COMMIT;
