-- Mapeo entre tipos de notificación y Message Templates de Meta
CREATE TABLE IF NOT EXISTS plantillas_whatsapp_meta (
  tipo TEXT PRIMARY KEY,
  template_name TEXT NOT NULL,
  language_code TEXT NOT NULL DEFAULT 'es_AR',
  param_keys TEXT[] NOT NULL
);

INSERT INTO plantillas_whatsapp_meta (tipo, template_name, language_code, param_keys) VALUES
  ('PRESUPUESTO', 'presupuesto_listo', 'es_AR', '{clienteNombre,numeroOrden,tipoArticulo,moneda,monto}'),
  ('LISTO_PARA_RETIRO', 'listo_para_retiro', 'es_AR', '{clienteNombre,numeroOrden,tipoArticulo}'),
  ('RECORDATORIO_MANTENIMIENTO', 'recordatorio_mantenimiento', 'es_AR', '{clienteNombre,tipoServicio,ultimaFecha}')
ON CONFLICT (tipo) DO NOTHING;

ALTER TABLE plantillas_whatsapp_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read plantillas_meta"
  ON plantillas_whatsapp_meta FOR SELECT
  TO authenticated
  USING (true);
