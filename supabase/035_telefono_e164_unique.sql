-- supabase/035_telefono_e164_unique.sql
-- Fuerza unicidad de telefono_e164 (cuando no es NULL) para evitar clientes
-- duplicados que rompen el matching del wa_id que manda Meta en el webhook.
-- Los NULL se permiten para clientes sin teléfono normalizado (edge case).

CREATE UNIQUE INDEX IF NOT EXISTS uniq_clientes_telefono_e164
  ON clientes(telefono_e164)
  WHERE telefono_e164 IS NOT NULL;
