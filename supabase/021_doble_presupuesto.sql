-- 021_doble_presupuesto.sql
-- Agregar presupuesto del taller.
-- Recrear vista completa con: monto_presupuesto_taller, cliente_documento,
-- y restaurar columnas de sucursal/traslados que faltaban desde migración 019.

ALTER TABLE ordenes ADD COLUMN monto_presupuesto_taller NUMERIC(12,2);

DROP VIEW IF EXISTS v_ordenes_dashboard;

CREATE VIEW v_ordenes_dashboard AS
SELECT
  o.id,
  o.numero_orden,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
  c.email AS cliente_email,
  c.documento AS cliente_documento,
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
  o.monto_presupuesto_taller,
  o.moneda,
  o.presupuesto_aprobado,
  o.monto_final,
  o.notas_internas,
  o.foto_ingreso,
  o.material,
  o.material_otro,
  o.peso_gramos,
  o.tracking_token,
  o.fecha_ingreso,
  o.fecha_envio_taller,
  o.fecha_presupuesto,
  o.fecha_aprobacion,
  o.fecha_listo,
  o.fecha_entrega,
  o.updated_at,
  EXTRACT(DAY FROM NOW() - o.updated_at)::INT AS dias_en_estado,
  EXTRACT(DAY FROM NOW() - o.fecha_ingreso)::INT AS dias_totales,
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
  END AS nivel_retraso,
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
