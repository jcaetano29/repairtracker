-- Actualiza templates de Marketing → Utility (v2)
-- presupuesto_ready y listo_para_retiro fueron recreados como tipo Utility en Meta
UPDATE plantillas_whatsapp_meta
SET template_name = 'presupuesto_ready_v2', language_code = 'en'
WHERE tipo = 'PRESUPUESTO';

UPDATE plantillas_whatsapp_meta
SET template_name = 'listo_para_retiro_v2', language_code = 'en'
WHERE tipo = 'LISTO_PARA_RETIRO';
