-- ============================================================
-- RepairTrack - Schema completo para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Extensión para búsqueda fuzzy
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- TABLA: clientes
-- ============================================================
CREATE TABLE clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  email TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clientes_telefono ON clientes(telefono);
CREATE INDEX idx_clientes_nombre ON clientes USING gin(nombre gin_trgm_ops);

-- ============================================================
-- TABLA: talleres
-- ============================================================
CREATE TABLE talleres (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  direccion TEXT,
  especialidad TEXT DEFAULT 'ambos',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: ordenes
-- ============================================================
CREATE TABLE ordenes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_orden SERIAL UNIQUE,

  -- Cliente
  cliente_id UUID REFERENCES clientes(id) NOT NULL,

  -- Artículo
  tipo_articulo TEXT NOT NULL,
  marca TEXT,
  modelo TEXT,
  descripcion TEXT,
  problema_reportado TEXT NOT NULL,

  -- Estado
  estado TEXT NOT NULL DEFAULT 'INGRESADO'
    CHECK (estado IN (
      'INGRESADO',
      'ESPERANDO_PRESUPUESTO',
      'ENVIADO_A_TALLER',
      'PRESUPUESTO_RECIBIDO',
      'ESPERANDO_APROBACION',
      'RECHAZADO',
      'EN_REPARACION',
      'LISTO_EN_TALLER',
      'RETIRADO_POR_CADETE',
      'LISTO_PARA_RETIRO',
      'ENTREGADO'
    )),

  -- Taller
  taller_id UUID REFERENCES talleres(id),

  -- Presupuesto
  monto_presupuesto DECIMAL(10,2),
  moneda TEXT DEFAULT 'UYU',
  presupuesto_aprobado BOOLEAN,

  -- Fechas de tracking
  fecha_ingreso TIMESTAMPTZ DEFAULT NOW(),
  fecha_envio_taller TIMESTAMPTZ,
  fecha_presupuesto TIMESTAMPTZ,
  fecha_aprobacion TIMESTAMPTZ,
  fecha_listo TIMESTAMPTZ,
  fecha_entrega TIMESTAMPTZ,

  -- Pago
  monto_final DECIMAL(10,2),
  metodo_pago TEXT,

  -- Extras
  notas_internas TEXT,
  foto_ingreso TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ordenes_estado ON ordenes(estado);
CREATE INDEX idx_ordenes_cliente ON ordenes(cliente_id);
CREATE INDEX idx_ordenes_taller ON ordenes(taller_id);
CREATE INDEX idx_ordenes_numero ON ordenes(numero_orden);
CREATE INDEX idx_ordenes_fecha ON ordenes(fecha_ingreso DESC);

-- ============================================================
-- TABLA: historial_estados
-- ============================================================
CREATE TABLE historial_estados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_id UUID REFERENCES ordenes(id) ON DELETE CASCADE NOT NULL,
  estado_anterior TEXT,
  estado_nuevo TEXT NOT NULL,
  usuario TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_historial_orden ON historial_estados(orden_id);
CREATE INDEX idx_historial_fecha ON historial_estados(created_at DESC);

-- ============================================================
-- TABLA: movimientos_cadete
-- ============================================================
CREATE TABLE movimientos_cadete (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_id UUID REFERENCES ordenes(id) NOT NULL,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('RETIRO_LOCAL', 'ENTREGA_TALLER', 'RETIRO_TALLER', 'ENTREGA_LOCAL')),
  taller_id UUID REFERENCES talleres(id),
  cadete TEXT,
  fecha TIMESTAMPTZ DEFAULT NOW(),
  notas TEXT,
  confirmado BOOLEAN DEFAULT false
);

CREATE INDEX idx_movimientos_orden ON movimientos_cadete(orden_id);
CREATE INDEX idx_movimientos_fecha ON movimientos_cadete(fecha DESC);

-- ============================================================
-- TABLA: notificaciones_enviadas
-- ============================================================
CREATE TABLE notificaciones_enviadas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_id UUID REFERENCES ordenes(id),
  tipo TEXT NOT NULL,
  canal TEXT DEFAULT 'whatsapp',
  mensaje TEXT,
  enviado BOOLEAN DEFAULT false,
  error TEXT,
  fecha_envio TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notificaciones_orden ON notificaciones_enviadas(orden_id);

-- ============================================================
-- FUNCIÓN: Auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_ordenes_updated
  BEFORE UPDATE ON ordenes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_clientes_updated
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FUNCIÓN: Log automático de cambios de estado
-- ============================================================
CREATE OR REPLACE FUNCTION log_estado_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO historial_estados (orden_id, estado_anterior, estado_nuevo)
    VALUES (NEW.id, OLD.estado, NEW.estado);

    -- Auto-fill fechas según el estado
    IF NEW.estado = 'ENVIADO_A_TALLER' THEN
      NEW.fecha_envio_taller = NOW();
    ELSIF NEW.estado IN ('PRESUPUESTO_RECIBIDO', 'ESPERANDO_APROBACION') THEN
      NEW.fecha_presupuesto = COALESCE(NEW.fecha_presupuesto, NOW());
    ELSIF NEW.estado = 'EN_REPARACION' THEN
      NEW.fecha_aprobacion = NOW();
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

CREATE TRIGGER tr_ordenes_estado
  BEFORE UPDATE ON ordenes
  FOR EACH ROW EXECUTE FUNCTION log_estado_change();

-- También loguear el estado INGRESADO al crear
CREATE OR REPLACE FUNCTION log_estado_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO historial_estados (orden_id, estado_anterior, estado_nuevo)
  VALUES (NEW.id, NULL, NEW.estado);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_ordenes_insert
  AFTER INSERT ON ordenes
  FOR EACH ROW EXECUTE FUNCTION log_estado_insert();

-- ============================================================
-- VIEW: Dashboard principal
-- ============================================================
CREATE OR REPLACE VIEW v_ordenes_dashboard AS
SELECT
  o.id,
  o.numero_orden,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
  c.id AS cliente_id,
  o.tipo_articulo,
  o.marca,
  o.modelo,
  o.problema_reportado,
  o.estado,
  o.taller_id,
  t.nombre AS taller_nombre,
  o.monto_presupuesto,
  o.moneda,
  o.presupuesto_aprobado,
  o.monto_final,
  o.notas_internas,
  o.foto_ingreso,
  o.fecha_ingreso,
  o.fecha_envio_taller,
  o.fecha_presupuesto,
  o.fecha_aprobacion,
  o.fecha_listo,
  o.fecha_entrega,
  o.updated_at,
  -- Días en estado actual
  EXTRACT(DAY FROM NOW() - o.updated_at)::INT AS dias_en_estado,
  -- Días totales
  EXTRACT(DAY FROM NOW() - o.fecha_ingreso)::INT AS dias_totales,
  -- Retraso
  CASE
    WHEN o.estado IN ('INGRESADO', 'ESPERANDO_PRESUPUESTO')
         AND NOW() - o.updated_at > INTERVAL '3 days' THEN 'leve'
    WHEN o.estado IN ('INGRESADO', 'ESPERANDO_PRESUPUESTO')
         AND NOW() - o.updated_at > INTERVAL '6 days' THEN 'grave'
    WHEN o.estado = 'ENVIADO_A_TALLER'
         AND NOW() - o.updated_at > INTERVAL '10 days' THEN 'grave'
    WHEN o.estado = 'ENVIADO_A_TALLER'
         AND NOW() - o.updated_at > INTERVAL '5 days' THEN 'leve'
    WHEN o.estado = 'ESPERANDO_APROBACION'
         AND NOW() - o.updated_at > INTERVAL '4 days' THEN 'grave'
    WHEN o.estado = 'ESPERANDO_APROBACION'
         AND NOW() - o.updated_at > INTERVAL '2 days' THEN 'leve'
    WHEN o.estado = 'EN_REPARACION'
         AND NOW() - o.updated_at > INTERVAL '30 days' THEN 'grave'
    WHEN o.estado = 'EN_REPARACION'
         AND NOW() - o.updated_at > INTERVAL '15 days' THEN 'leve'
    WHEN o.estado = 'LISTO_PARA_RETIRO'
         AND NOW() - o.updated_at > INTERVAL '10 days' THEN 'grave'
    WHEN o.estado = 'LISTO_PARA_RETIRO'
         AND NOW() - o.updated_at > INTERVAL '5 days' THEN 'leve'
    ELSE 'none'
  END AS nivel_retraso
FROM ordenes o
LEFT JOIN clientes c ON o.cliente_id = c.id
LEFT JOIN talleres t ON o.taller_id = t.id;

-- ============================================================
-- VIEW: Resumen para cadete
-- ============================================================
CREATE OR REPLACE VIEW v_cadete_pendientes AS
SELECT
  o.id,
  o.numero_orden,
  c.nombre AS cliente_nombre,
  o.tipo_articulo,
  o.marca,
  o.estado,
  t.nombre AS taller_nombre,
  t.direccion AS taller_direccion,
  CASE
    WHEN o.estado = 'ENVIADO_A_TALLER' THEN 'LLEVAR_A_TALLER'
    WHEN o.estado = 'LISTO_EN_TALLER' THEN 'RETIRAR_DE_TALLER'
    WHEN o.estado = 'RETIRADO_POR_CADETE' THEN 'ENTREGAR_EN_LOCAL'
  END AS accion_pendiente
FROM ordenes o
LEFT JOIN clientes c ON o.cliente_id = c.id
LEFT JOIN talleres t ON o.taller_id = t.id
WHERE o.estado IN ('ENVIADO_A_TALLER', 'LISTO_EN_TALLER', 'RETIRADO_POR_CADETE')
ORDER BY
  CASE o.estado
    WHEN 'RETIRADO_POR_CADETE' THEN 1
    WHEN 'LISTO_EN_TALLER' THEN 2
    WHEN 'ENVIADO_A_TALLER' THEN 3
  END;

-- ============================================================
-- VIEW: Stats por taller
-- ============================================================
CREATE OR REPLACE VIEW v_talleres_stats AS
SELECT
  t.id,
  t.nombre,
  t.telefono,
  t.especialidad,
  COUNT(o.id) FILTER (WHERE o.estado NOT IN ('ENTREGADO', 'RECHAZADO')) AS ordenes_activas,
  COUNT(o.id) FILTER (WHERE o.estado = 'ENTREGADO') AS ordenes_completadas,
  AVG(EXTRACT(DAY FROM o.fecha_listo - o.fecha_envio_taller))
    FILTER (WHERE o.fecha_listo IS NOT NULL AND o.fecha_envio_taller IS NOT NULL)::INT
    AS promedio_dias_reparacion
FROM talleres t
LEFT JOIN ordenes o ON o.taller_id = t.id
WHERE t.activo = true
GROUP BY t.id, t.nombre, t.telefono, t.especialidad;

-- ============================================================
-- RLS (Row Level Security) - Básico
-- ============================================================
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE talleres ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_cadete ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones_enviadas ENABLE ROW LEVEL SECURITY;

-- Política: usuarios autenticados pueden ver y editar todo
-- (para multi-tenancy futuro, agregar tenant_id)
CREATE POLICY "Authenticated users full access" ON clientes
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON talleres
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON ordenes
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON historial_estados
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON movimientos_cadete
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON notificaciones_enviadas
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- DATOS INICIALES DE EJEMPLO
-- ============================================================
INSERT INTO talleres (nombre, contacto, telefono, direccion, especialidad) VALUES
  ('Taller López', 'Hugo López', '099 111 222', 'Av. 18 de Julio 1234', 'relojes'),
  ('Taller Gómez', 'Ricardo Gómez', '098 333 444', 'Bv. Artigas 567', 'ambos'),
  ('Relojería Central', 'Marcos Pereira', '097 555 666', 'Sarandí 890', 'relojes');
