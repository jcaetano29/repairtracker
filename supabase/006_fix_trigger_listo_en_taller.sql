-- supabase/006_fix_trigger_listo_en_taller.sql
-- Fix: set presupuesto_aprobado = true when transitioning to LISTO_EN_TALLER
-- Previously only EN_REPARACION set this, missing the external workshop approval path

CREATE OR REPLACE FUNCTION log_estado_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO historial_estados (orden_id, estado_anterior, estado_nuevo)
    VALUES (NEW.id, OLD.estado, NEW.estado);

    IF NEW.estado = 'EN_TALLER' THEN
      NEW.fecha_envio_taller = NOW();
    ELSIF NEW.estado = 'ESPERANDO_APROBACION' THEN
      NEW.fecha_presupuesto = COALESCE(NEW.fecha_presupuesto, NOW());
    ELSIF NEW.estado = 'EN_REPARACION' THEN
      NEW.fecha_aprobacion = NOW();
      NEW.presupuesto_aprobado = true;
    ELSIF NEW.estado = 'LISTO_EN_TALLER' THEN
      NEW.fecha_aprobacion = COALESCE(NEW.fecha_aprobacion, NOW());
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
