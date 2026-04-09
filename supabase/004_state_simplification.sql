-- supabase/004_state_simplification.sql
-- Migrate from 10 states to 8:
-- Remove: ESPERANDO_PRESUPUESTO, PRESUPUESTO_RECIBIDO
-- Rename: ENVIADO_A_TALLER → EN_TALLER
-- Keep: INGRESADO, EN_TALLER, ESPERANDO_APROBACION, RECHAZADO,
--        EN_REPARACION, LISTO_EN_TALLER, LISTO_PARA_RETIRO, ENTREGADO

BEGIN;

-- 1. Drop the view that references old state names
DROP VIEW IF EXISTS v_ordenes_dashboard;

-- 2. Drop the CHECK constraint on ordenes.estado
-- Note: PostgreSQL inline CHECK constraints cannot be dropped directly,
-- so we'll use ALTER TABLE to drop the constraint
ALTER TABLE ordenes DROP CONSTRAINT "ordenes_estado_check";

-- 3. Migrate data: bridge orphaned states first
-- ESPERANDO_PRESUPUESTO → INGRESADO (no budget info gathered yet)
UPDATE ordenes SET estado = 'INGRESADO' WHERE estado = 'ESPERANDO_PRESUPUESTO';
-- PRESUPUESTO_RECIBIDO → ESPERANDO_APROBACION (equivalent meaning)
UPDATE ordenes SET estado = 'ESPERANDO_APROBACION' WHERE estado = 'PRESUPUESTO_RECIBIDO';
-- ENVIADO_A_TALLER → EN_TALLER (rename)
UPDATE ordenes SET estado = 'EN_TALLER' WHERE estado = 'ENVIADO_A_TALLER';

-- 4. Migrate historial_estados references
UPDATE historial_estados SET estado_anterior = 'INGRESADO' WHERE estado_anterior = 'ESPERANDO_PRESUPUESTO';
UPDATE historial_estados SET estado_anterior = 'ESPERANDO_APROBACION' WHERE estado_anterior = 'PRESUPUESTO_RECIBIDO';
UPDATE historial_estados SET estado_anterior = 'EN_TALLER' WHERE estado_anterior = 'ENVIADO_A_TALLER';

UPDATE historial_estados SET estado_nuevo = 'INGRESADO' WHERE estado_nuevo = 'ESPERANDO_PRESUPUESTO';
UPDATE historial_estados SET estado_nuevo = 'ESPERANDO_APROBACION' WHERE estado_nuevo = 'PRESUPUESTO_RECIBIDO';
UPDATE historial_estados SET estado_nuevo = 'EN_TALLER' WHERE estado_nuevo = 'ENVIADO_A_TALLER';

-- 5. Recreate the CHECK constraint with 8 states
ALTER TABLE ordenes ADD CONSTRAINT ordenes_estado_check CHECK (
  estado IN (
    'INGRESADO',
    'EN_TALLER',
    'ESPERANDO_APROBACION',
    'RECHAZADO',
    'EN_REPARACION',
    'LISTO_EN_TALLER',
    'LISTO_PARA_RETIRO',
    'ENTREGADO'
  )
);

-- 6. Recreate the trigger function with updated state references
CREATE OR REPLACE FUNCTION log_estado_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO historial_estados (orden_id, estado_anterior, estado_nuevo)
    VALUES (NEW.id, OLD.estado, NEW.estado);

    -- Auto-fill fechas según el estado
    IF NEW.estado = 'EN_TALLER' THEN
      NEW.fecha_envio_taller = NOW();
    ELSIF NEW.estado IN ('ESPERANDO_APROBACION') THEN
      NEW.fecha_presupuesto = COALESCE(NEW.fecha_presupuesto, NOW());
    ELSIF NEW.estado = 'EN_REPARACION' THEN
      NEW.fecha_aprobacion = NOW();
      NEW.presupuesto_aprobado = true;
    ELSIF NEW.estado = 'RECHAZADO' THEN
      NEW.fecha_aprobacion = NOW();
      NEW.presupuesto_aprobado = false;
    ELSIF NEW.estado = 'LISTO_PARA_RETIRO' THEN
      NEW.fecha_listo = NOW();
    ELSIF NEW.estado = 'ENTREGADO' THEN
      NEW.fecha_entrega = NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate the trigger for log_estado_change()
DROP TRIGGER IF EXISTS tr_ordenes_estado ON ordenes;
CREATE TRIGGER tr_ordenes_estado
  BEFORE UPDATE ON ordenes
  FOR EACH ROW EXECUTE FUNCTION log_estado_change();

-- 6a. Recreate log_estado_insert() function and trigger
CREATE OR REPLACE FUNCTION log_estado_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO historial_estados (orden_id, estado_anterior, estado_nuevo)
  VALUES (NEW.id, NULL, NEW.estado);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_ordenes_insert ON ordenes;
CREATE TRIGGER tr_ordenes_insert
  AFTER INSERT ON ordenes
  FOR EACH ROW EXECUTE FUNCTION log_estado_insert();

-- 7. Recreate v_ordenes_dashboard view
CREATE OR REPLACE VIEW v_ordenes_dashboard AS
SELECT
  o.id,
  o.numero_orden,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
  c.id AS cliente_id,
  o.tipo_articulo,
  o.marca,
  o.modelo,
  o.problema_reportado,
  o.estado,
  o.taller_id,
  t.nombre AS taller_nombre,
  o.monto_presupuesto,
  o.moneda,
  o.presupuesto_aprobado,
  o.monto_final,
  o.notas_internas,
  o.foto_ingreso,
  o.fecha_ingreso,
  o.fecha_envio_taller,
  o.fecha_presupuesto,
  o.fecha_aprobacion,
  o.fecha_listo,
  o.fecha_entrega,
  o.updated_at,
  -- Días en estado actual
  EXTRACT(DAY FROM NOW() - o.updated_at)::INT AS dias_en_estado,
  -- Días totales
  EXTRACT(DAY FROM NOW() - o.fecha_ingreso)::INT AS dias_totales,
  -- Retraso
  CASE
    WHEN o.estado = 'INGRESADO'
         AND NOW() - o.updated_at > INTERVAL '6 days' THEN 'grave'
    WHEN o.estado = 'INGRESADO'
         AND NOW() - o.updated_at > INTERVAL '3 days' THEN 'leve'
    WHEN o.estado = 'EN_TALLER'
         AND NOW() - o.updated_at > INTERVAL '10 days' THEN 'grave'
    WHEN o.estado = 'EN_TALLER'
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
LEFT JOIN talleres t ON o.taller_id = t.id;

COMMIT;
