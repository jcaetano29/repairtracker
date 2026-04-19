-- supabase/027_listo_para_envio.sql
-- Add LISTO_PARA_ENVIO state between INGRESADO and EN_TALLER

BEGIN;

-- Update estado CHECK constraint to include new state
ALTER TABLE ordenes DROP CONSTRAINT IF EXISTS ordenes_estado_check;
ALTER TABLE ordenes ADD CONSTRAINT ordenes_estado_check CHECK (estado = ANY (ARRAY[
  'INGRESADO',
  'LISTO_PARA_ENVIO',
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

COMMIT;
