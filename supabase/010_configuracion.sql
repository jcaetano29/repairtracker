-- Create configuracion table
CREATE TABLE IF NOT EXISTS configuracion (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  clave TEXT UNIQUE NOT NULL,
  valor JSONB NOT NULL,
  descripcion TEXT,
  actualizado_en TIMESTAMP DEFAULT NOW(),
  actualizado_por UUID REFERENCES public.usuarios(id)
);

-- Enable RLS
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only dueño users can read
CREATE POLICY "admin_read_configuracion" ON configuracion
  FOR SELECT
  USING (
    (SELECT role FROM public.usuarios WHERE id = auth.uid()) = 'admin'
  );

-- RLS Policy: Only dueño users can update
CREATE POLICY "admin_update_configuracion" ON configuracion
  FOR UPDATE
  USING (
    (SELECT role FROM public.usuarios WHERE id = auth.uid()) = 'admin'
  );

-- Insert initial delay threshold configurations
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('umbral_ingresado', '{"leve": 2, "grave": 5}', 'Retraso en estado Ingresado'),
  ('umbral_en_taller', '{"leve": 7, "grave": 14}', 'Retraso en estado En Taller'),
  ('umbral_esperando_aprobacion', '{"leve": 1, "grave": 3}', 'Retraso esperando aprobación'),
  ('umbral_rechazado', '{"leve": 0, "grave": 0}', 'No aplica retraso'),
  ('umbral_en_reparacion', '{"leve": 3, "grave": 7}', 'Retraso en reparación'),
  ('umbral_listo_en_taller', '{"leve": 1, "grave": 3}', 'Retraso cuando listo en taller'),
  ('umbral_listo_para_retiro', '{"leve": 3, "grave": 7}', 'Retraso en retiro'),
  ('umbral_entregado', '{"leve": 0, "grave": 0}', 'No aplica retraso')
ON CONFLICT (clave) DO NOTHING;
