-- Plantillas editables para notificaciones WhatsApp
CREATE TABLE IF NOT EXISTS plantillas_whatsapp (
  tipo text PRIMARY KEY,
  mensaje text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Seed default templates
INSERT INTO plantillas_whatsapp (tipo, mensaje) VALUES
('PRESUPUESTO', E'Hola {{clienteNombre}} 👋\n\nTenemos el presupuesto listo para tu artículo.\n\n🔢 Orden: #{{numeroOrden}}\n⌚ Artículo: {{tipoArticulo}}\n💰 Presupuesto: {{moneda}} {{monto}}\n\nAvisanos si querés continuar con la reparación.'),
('LISTO_PARA_RETIRO', E'Hola {{clienteNombre}} 🎉\n\n¡Tu artículo está listo para retirar!\n\n🔢 Orden: #{{numeroOrden}}\n⌚ Artículo: {{tipoArticulo}}\n\nPodés pasar a buscarlo cuando quieras. Ver estado:\n{{trackingUrl}}\n\n¡Gracias por confiar en nosotros!'),
('RECORDATORIO_MANTENIMIENTO', E'Hola {{clienteNombre}} ⌚\n\nTe recordamos que es momento de hacer el mantenimiento de tu artículo.\n\n🔧 Servicio recomendado: {{tipoServicio}}\n📅 Último servicio: {{ultimaFecha}}\n\nComunicate con nosotros para coordinar la revisión.')
ON CONFLICT (tipo) DO NOTHING;

-- RLS: authenticated users can read, only admins can update
ALTER TABLE plantillas_whatsapp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read plantillas"
  ON plantillas_whatsapp FOR SELECT
  TO authenticated
  USING (true);
