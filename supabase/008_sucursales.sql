-- supabase/008_sucursales.sql
-- Multi-sucursal: Punta Carretas y Nuevo Centro

BEGIN;

-- ============================================================
-- TABLA: sucursales
-- ============================================================
CREATE TABLE sucursales (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre     TEXT NOT NULL,
  activo     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON sucursales
  FOR ALL USING (auth.role() = 'authenticated' OR true);

-- Datos iniciales
INSERT INTO sucursales (nombre) VALUES
  ('Punta Carretas'),
  ('Nuevo Centro');

-- ============================================================
-- ACTUALIZAR CHECK CONSTRAINT de ordenes.estado
-- (agregar estados nuevos que usa la aplicación)
-- ============================================================
ALTER TABLE ordenes DROP CONSTRAINT IF EXISTS ordenes_estado_check;
ALTER TABLE ordenes ADD CONSTRAINT ordenes_estado_check CHECK (estado = ANY (ARRAY[
  'INGRESADO',
  'EN_TALLER',
  'ESPERANDO_PRESUPUESTO',
  'ENVIADO_A_TALLER',
  'PRESUPUESTO_RECIBIDO',
  'ESPERANDO_APROBACION',
  'RECHAZADO',
  'EN_REPARACION',
  'LISTO_EN_TALLER',
  'LISTO_PARA_RETIRO',
  'ENTREGADO'
]));

-- ============================================================
-- ALTER: ordenes y usuarios
-- ============================================================

-- Agregar sucursal_id a ordenes (nullable primero para poder rellenar)
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES sucursales(id);

-- Agregar sucursal_id a usuarios (nullable: NULL = admin, UUID = employee)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES sucursales(id);

-- Índice en ordenes
CREATE INDEX IF NOT EXISTS idx_ordenes_sucursal ON ordenes(sucursal_id);

-- ============================================================
-- DISTRIBUCIÓN de órdenes existentes entre sucursales
-- ============================================================
-- Pares → Punta Carretas, Impares → Nuevo Centro
UPDATE ordenes
SET sucursal_id = (SELECT id FROM sucursales WHERE nombre = 'Punta Carretas')
WHERE numero_orden % 2 = 0;

UPDATE ordenes
SET sucursal_id = (SELECT id FROM sucursales WHERE nombre = 'Nuevo Centro')
WHERE numero_orden % 2 = 1;

-- ============================================================
-- INSERTAR órdenes de prueba adicionales
-- ============================================================
DO $$
DECLARE
  v_pc UUID;
  v_nc UUID;
  v_cliente UUID;
BEGIN
  SELECT id INTO v_pc FROM sucursales WHERE nombre = 'Punta Carretas';
  SELECT id INTO v_nc FROM sucursales WHERE nombre = 'Nuevo Centro';
  SELECT id INTO v_cliente FROM clientes LIMIT 1;

  -- Si no hay clientes, crear uno de prueba
  IF v_cliente IS NULL THEN
    INSERT INTO clientes (nombre, telefono, email)
    VALUES ('Cliente Demo', '099000001', 'demo@test.com')
    RETURNING id INTO v_cliente;
  END IF;

  -- Punta Carretas — estados variados
  INSERT INTO ordenes (cliente_id, sucursal_id, tipo_articulo, marca, modelo, problema_reportado, estado, fecha_ingreso)
  VALUES
    (v_cliente, v_pc, 'Reloj', 'Rolex', 'Submariner', 'No anda el segundero', 'INGRESADO', NOW() - INTERVAL '1 day'),
    (v_cliente, v_pc, 'Reloj', 'Omega', 'Seamaster', 'Se paró', 'ESPERANDO_PRESUPUESTO', NOW() - INTERVAL '3 days'),
    (v_cliente, v_pc, 'Reloj', 'Seiko', 'Presage', 'Vidrio roto', 'ENVIADO_A_TALLER', NOW() - INTERVAL '7 days'),
    (v_cliente, v_pc, 'Joya', NULL, NULL, 'Cierre roto', 'PRESUPUESTO_RECIBIDO', NOW() - INTERVAL '5 days'),
    (v_cliente, v_pc, 'Reloj', 'Casio', 'G-Shock', 'Sin pila', 'ESPERANDO_APROBACION', NOW() - INTERVAL '4 days'),
    (v_cliente, v_pc, 'Reloj', 'Longines', 'Master', 'No da la hora bien', 'EN_REPARACION', NOW() - INTERVAL '10 days'),
    (v_cliente, v_pc, 'Reloj', 'TAG Heuer', 'Carrera', 'Rotura interna', 'LISTO_PARA_RETIRO', NOW() - INTERVAL '15 days'),
    (v_cliente, v_pc, 'Reloj', 'Tissot', 'PRX', 'Service preventivo', 'ENTREGADO', NOW() - INTERVAL '20 days'),
    (v_cliente, v_pc, 'Reloj', 'Breitling', 'Navitimer', 'Presupuesto muy alto', 'RECHAZADO', NOW() - INTERVAL '8 days'),
    (v_cliente, v_pc, 'Joya', NULL, NULL, 'Ajuste de talle', 'INGRESADO', NOW() - INTERVAL '2 days');

  -- Nuevo Centro — estados variados
  INSERT INTO ordenes (cliente_id, sucursal_id, tipo_articulo, marca, modelo, problema_reportado, estado, fecha_ingreso)
  VALUES
    (v_cliente, v_nc, 'Reloj', 'IWC', 'Pilot', 'Cristal rayado', 'INGRESADO', NOW() - INTERVAL '1 day'),
    (v_cliente, v_nc, 'Reloj', 'Zenith', 'El Primero', 'No da cuerda automática', 'ESPERANDO_PRESUPUESTO', NOW() - INTERVAL '2 days'),
    (v_cliente, v_nc, 'Joya', NULL, NULL, 'Limpieza profunda', 'ENVIADO_A_TALLER', NOW() - INTERVAL '6 days'),
    (v_cliente, v_nc, 'Reloj', 'Patek', 'Calatrava', 'Service completo', 'EN_REPARACION', NOW() - INTERVAL '12 days'),
    (v_cliente, v_nc, 'Reloj', 'Vacheron', 'Overseas', 'Ajuste de correa', 'LISTO_PARA_RETIRO', NOW() - INTERVAL '9 days'),
    (v_cliente, v_nc, 'Reloj', 'Audemars', 'Royal Oak', 'Pila agotada', 'ENTREGADO', NOW() - INTERVAL '18 days'),
    (v_cliente, v_nc, 'Reloj', 'Cartier', 'Tank', 'Manecillas flojas', 'ESPERANDO_APROBACION', NOW() - INTERVAL '3 days'),
    (v_cliente, v_nc, 'Joya', NULL, NULL, 'Reparación cierre', 'PRESUPUESTO_RECIBIDO', NOW() - INTERVAL '4 days'),
    (v_cliente, v_nc, 'Reloj', 'Panerai', 'Luminor', 'No enciende luminiscencia', 'RECHAZADO', NOW() - INTERVAL '10 days'),
    (v_cliente, v_nc, 'Reloj', 'Hublot', 'Big Bang', 'Revisión completa', 'INGRESADO', NOW() - INTERVAL '1 day');

END $$;

-- ============================================================
-- Aplicar NOT NULL en ordenes.sucursal_id (todos los registros ya tienen valor)
-- ============================================================
ALTER TABLE ordenes ALTER COLUMN sucursal_id SET NOT NULL;

-- ============================================================
-- ACTUALIZAR VIEW: v_ordenes_dashboard — agregar sucursal
-- ============================================================
DROP VIEW IF EXISTS v_ordenes_dashboard;
CREATE VIEW v_ordenes_dashboard AS
SELECT
  o.id,
  o.numero_orden,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
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
  -- Días en estado actual: days elapsed since last state transition
  -- Formula: EXTRACT(DAY FROM NOW() - o.updated_at)
  -- (o.updated_at is when the order transitioned to its current state)
  EXTRACT(DAY FROM NOW() - o.updated_at)::INT AS dias_en_estado,
  -- Días totales desde ingreso: days elapsed since order creation
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
  END AS nivel_retraso
FROM ordenes o
LEFT JOIN clientes c ON o.cliente_id = c.id
LEFT JOIN talleres t ON o.taller_id = t.id
LEFT JOIN sucursales s ON o.sucursal_id = s.id;

COMMIT;
