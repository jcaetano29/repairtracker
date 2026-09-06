-- Recordatorio manual de retiro: se reenvía a clientes ya avisados que no
-- vinieron a buscar el artículo y no respondieron.
--
-- IMPORTANTE: el template_name debe existir APROBADO en Meta antes de que el
-- envío funcione. Las plantillas se aprueban como tipo Utility con
-- language_code 'en' (aunque el texto sea en castellano), igual que las _v2.
-- Si en Meta le pusiste otro nombre, actualizá 'recordatorio_retiro' abajo.

-- Mapeo tipo → Message Template de Meta (usado por el envío real).
INSERT INTO plantillas_whatsapp_meta (tipo, template_name, language_code, param_keys) VALUES
  ('RECORDATORIO_RETIRO', 'recordatorio_retiro', 'en', '{clienteNombre,numeroOrden,tipoArticulo}')
ON CONFLICT (tipo) DO NOTHING;

-- Plantilla editable: se usa solo para el preview y para el body que se guarda
-- en el hilo de whatsapp_mensajes (contabilidad), no para el envío a Meta.
INSERT INTO plantillas_whatsapp (tipo, mensaje) VALUES
  ('RECORDATORIO_RETIRO', E'Hola {{clienteNombre}} 👋\n\nTe recordamos que tu artículo sigue disponible para retirar.\n\n🔢 Orden: #{{numeroOrden}}\n⌚ Artículo: {{tipoArticulo}}\n\nPodés pasar a buscarlo cuando quieras. ¡Te esperamos!')
ON CONFLICT (tipo) DO NOTHING;
