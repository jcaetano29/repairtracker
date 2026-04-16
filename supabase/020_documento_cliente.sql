-- 020_documento_cliente.sql
-- Agregar campo documento (cédula/RUT) a clientes.
-- Obligatorio para nuevos clientes, existentes reciben placeholder.

ALTER TABLE clientes ADD COLUMN documento TEXT;

-- Asignar placeholder a clientes existentes
UPDATE clientes SET documento = 'PENDIENTE-' || id WHERE documento IS NULL;

-- Ahora hacer NOT NULL
ALTER TABLE clientes ALTER COLUMN documento SET NOT NULL;

-- Índice único para búsqueda exacta
CREATE UNIQUE INDEX idx_clientes_documento ON clientes(documento);
