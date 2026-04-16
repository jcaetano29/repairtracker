-- 018_material_peso.sql
-- Agregar campos de material y peso para órdenes de joyería.
-- material: selector predefinido (oro, plata, acero, otro)
-- material_otro: texto libre cuando material='otro'
-- peso_gramos: obligatorio cuando material='oro'

ALTER TABLE ordenes ADD COLUMN material TEXT;
ALTER TABLE ordenes ADD COLUMN material_otro TEXT;
ALTER TABLE ordenes ADD COLUMN peso_gramos NUMERIC(10,2);

ALTER TABLE ordenes ADD CONSTRAINT chk_material_valores
  CHECK (material IS NULL OR material IN ('oro', 'plata', 'acero', 'otro'));

ALTER TABLE ordenes ADD CONSTRAINT chk_material_otro
  CHECK (material != 'otro' OR material_otro IS NOT NULL);

ALTER TABLE ordenes ADD CONSTRAINT chk_peso_oro
  CHECK (material != 'oro' OR peso_gramos IS NOT NULL);
