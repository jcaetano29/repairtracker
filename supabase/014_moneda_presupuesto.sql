-- Migration 014: enforce moneda CHECK + expose {{moneda}} in templates
BEGIN;

-- ============================================================
-- 1. Ensure moneda CHECK constraint (column already exists from 001)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ordenes_moneda_check'
  ) THEN
    ALTER TABLE ordenes
      ADD CONSTRAINT ordenes_moneda_check
      CHECK (moneda IN ('UYU', 'USD'));
  END IF;
END$$;

-- Backfill any NULLs just in case
UPDATE ordenes SET moneda = 'UYU' WHERE moneda IS NULL;

-- Make NOT NULL with default UYU
ALTER TABLE ordenes ALTER COLUMN moneda SET NOT NULL;
ALTER TABLE ordenes ALTER COLUMN moneda SET DEFAULT 'UYU';

-- ============================================================
-- 2. Update PRESUPUESTO templates to include {{moneda}}
-- ============================================================
UPDATE plantillas_whatsapp
SET mensaje = E'Hola {{clienteNombre}} 👋\n\nTenemos el presupuesto listo para tu artículo.\n\n🔢 Orden: #{{numeroOrden}}\n⌚ Artículo: {{tipoArticulo}}\n💰 Presupuesto: {{moneda}} {{monto}}\n\nAvisanos si querés continuar con la reparación.'
WHERE tipo = 'PRESUPUESTO';

UPDATE plantillas_email
SET cuerpo = E'Hola {{clienteNombre}},\n\nTenemos el presupuesto listo para tu artículo.\n\nOrden: #{{numeroOrden}}\nArtículo: {{tipoArticulo}}\nPresupuesto: {{moneda}} {{monto}}\n\nPor favor, respondenos si querés continuar con la reparación.\n\nSaludos,\nRiviera Joyas'
WHERE tipo = 'PRESUPUESTO';

COMMIT;
