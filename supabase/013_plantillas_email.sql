-- Migration 013: plantillas_email table + expose cliente_email in v_ordenes_dashboard
BEGIN;

-- ============================================================
-- 1. Table: plantillas_email
-- ============================================================
CREATE TABLE IF NOT EXISTS plantillas_email (
  tipo        TEXT PRIMARY KEY,
  asunto      TEXT NOT NULL,
  cuerpo      TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. Seed default templates
-- ============================================================
INSERT INTO plantillas_email (tipo, asunto, cuerpo) VALUES
('PRESUPUESTO',
 'Presupuesto listo — Orden #{{numeroOrden}}',
 E'Hola {{clienteNombre}},\n\nTenemos el presupuesto listo para tu artículo.\n\nOrden: #{{numeroOrden}}\nArtículo: {{tipoArticulo}}\nPresupuesto: {{moneda}} {{monto}}\n\nPor favor, respondenos si querés continuar con la reparación.\n\nSaludos,\nRiviera Joyas'),
('LISTO_PARA_RETIRO',
 '¡Tu artículo está listo para retirar! — Orden #{{numeroOrden}}',
 E'Hola {{clienteNombre}},\n\nTu artículo ya está listo para que pases a buscarlo.\n\nOrden: #{{numeroOrden}}\nArtículo: {{tipoArticulo}}\n\nPodés consultar el estado en: {{trackingUrl}}\n\n¡Gracias por confiar en nosotros!\nRiviera Joyas'),
('RECORDATORIO_MANTENIMIENTO',
 'Recordatorio de mantenimiento — {{tipoServicio}}',
 E'Hola {{clienteNombre}},\n\nTe escribimos para recordarte que es momento de realizar el mantenimiento de tu artículo.\n\nServicio recomendado: {{tipoServicio}}\nÚltimo servicio: {{ultimaFecha}}\n\nComunicate con nosotros para coordinar la revisión.\n\nSaludos,\nRiviera Joyas')
ON CONFLICT (tipo) DO NOTHING;

-- ============================================================
-- 3. RLS for plantillas_email
-- ============================================================
ALTER TABLE plantillas_email ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plantillas_email_read_authenticated"
  ON plantillas_email
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 4. Recreate v_ordenes_dashboard — adds cliente_email
--    Preserves all existing columns including nivel_retraso
-- ============================================================
DROP VIEW IF EXISTS v_ordenes_dashboard;
CREATE VIEW v_ordenes_dashboard AS
SELECT
  o.id,
  o.numero_orden,
  c.nombre      AS cliente_nombre,
  c.telefono    AS cliente_telefono,
  c.email       AS cliente_email,
  c.id          AS cliente_id,
  o.tipo_articulo,
  o.marca,
  o.modelo,
  o.nombre_articulo,
  o.problema_reportado,
  o.estado,
  o.taller_id,
  t.nombre      AS taller_nombre,
  o.sucursal_id,
  s.nombre      AS sucursal_nombre,
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
  -- Días en estado actual (since last state transition)
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
  END AS nivel_retraso
FROM ordenes o
LEFT JOIN clientes c ON o.cliente_id = c.id
LEFT JOIN talleres t ON o.taller_id = t.id
LEFT JOIN sucursales s ON o.sucursal_id = s.id;

COMMIT;
