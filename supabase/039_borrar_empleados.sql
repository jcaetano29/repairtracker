-- supabase/039_borrar_empleados.sql
-- Cambia el ciclo de vida de empleados de "desactivar" a "borrar" definitivamente.
-- Las órdenes que ya tenían asignado un empleado borrado quedan con
-- empleado_id = NULL (dejan de mostrar ese nombre), porque no tiene sentido
-- bloquear el borrado de un empleado que ya generó órdenes.

BEGIN;

ALTER TABLE empleados DROP COLUMN activo;

ALTER TABLE ordenes DROP CONSTRAINT ordenes_empleado_id_fkey;
ALTER TABLE ordenes ADD CONSTRAINT ordenes_empleado_id_fkey
  FOREIGN KEY (empleado_id) REFERENCES empleados(id) ON DELETE SET NULL;

COMMIT;
