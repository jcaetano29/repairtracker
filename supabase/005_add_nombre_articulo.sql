-- supabase/005_add_nombre_articulo.sql
-- Add nombre_articulo column to ordenes for custom article type descriptions
-- Used when tipo_articulo = 'OTRO'
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS nombre_articulo TEXT;
