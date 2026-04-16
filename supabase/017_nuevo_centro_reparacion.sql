-- 017_nuevo_centro_reparacion.sql
-- Habilitar Nuevo Centro como centro de reparación adicional.
-- Esto permite que las órdenes creadas en Nuevo Centro se reparen in situ.

UPDATE sucursales
SET es_centro_reparacion = true
WHERE nombre = 'Nuevo Centro';
