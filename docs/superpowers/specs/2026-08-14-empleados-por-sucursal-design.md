# Diseño: Empleados por Sucursal en Nuevo Ingreso

**Fecha:** 2026-08-14
**Estado:** Aprobado
**Archivos afectados:** `supabase/038_empleados.sql`, `app/admin/sucursales/page.js`, `app/api/admin/empleados/route.js` (nuevo), `lib/data.js`, `components/NuevoIngresoModal.js`, `app/api/ordenes/route.js`

---

## Resumen

Al crear una orden hay que registrar qué empleado la ingresó. Los empleados se administran por sucursal desde el panel admin (dentro de la página de Sucursales existente, no una sección nueva). En el formulario de nuevo ingreso, el campo empleado solo se habilita después de elegir sucursal, y es obligatorio para poder registrar la orden.

Los "empleados" de este feature son una **lista liviana por sucursal (solo nombre)**, distinta de la tabla `usuarios` (que son cuentas de login con contraseña y rol). No se tocan `usuarios` ni el sistema de autenticación.

---

## 1. Modelo de datos — `supabase/038_empleados.sql`

```sql
BEGIN;

CREATE TABLE empleados (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sucursal_id UUID NOT NULL REFERENCES sucursales(id),
  nombre      TEXT NOT NULL,
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_empleados_sucursal ON empleados(sucursal_id);

ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON empleados
  FOR ALL USING (auth.role() = 'authenticated' OR true);

-- Columna en ordenes (nullable: las órdenes históricas no tienen empleado registrado)
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS empleado_id UUID REFERENCES empleados(id);
CREATE INDEX IF NOT EXISTS idx_ordenes_empleado ON ordenes(empleado_id);

-- Exponer empleado_nombre en la view usada por getOrden().
-- La definición vigente de v_ordenes_dashboard es la de supabase/024_fecha_entrega_estimada.sql
-- (última migración que la redefine por completo; 032_security_hardening.sql
-- solo le aplicó `ALTER VIEW ... SET (security_invoker = true)` después).
-- Este cambio parte de esa definición, agregando o.empleado_id / e.nombre AS empleado_nombre
-- y el LEFT JOIN empleados, sin tocar el resto de columnas ni el CASE de nivel_retraso:
DROP VIEW IF EXISTS v_ordenes_dashboard;
CREATE VIEW v_ordenes_dashboard AS
SELECT
  o.id,
  o.numero_orden,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
  c.email AS cliente_email,
  c.documento AS cliente_documento,
  c.id AS cliente_id,
  o.tipo_articulo,
  o.marca,
  o.modelo,
  o.nombre_articulo,
  o.problema_reportado,
  o.estado,
  o.taller_id,
  t.nombre AS taller_nombre,
  o.sucursal_id,
  s.nombre AS sucursal_nombre,
  o.sucursal_recepcion_id,
  sr.nombre AS sucursal_recepcion_nombre,
  o.sucursal_retiro_id,
  srt.nombre AS sucursal_retiro_nombre,
  o.empleado_id,
  e.nombre AS empleado_nombre,
  o.tipo_servicio_id,
  o.en_garantia,
  o.monto_presupuesto,
  o.monto_presupuesto_taller,
  o.moneda,
  o.presupuesto_aprobado,
  o.monto_final,
  o.notas_internas,
  o.foto_ingreso,
  o.material,
  o.material_otro,
  o.peso_gramos,
  o.tracking_token,
  o.fecha_ingreso,
  o.fecha_envio_taller,
  o.fecha_presupuesto,
  o.fecha_aprobacion,
  o.fecha_listo,
  o.fecha_entrega,
  o.fecha_entrega_estimada,
  o.updated_at,
  EXTRACT(DAY FROM NOW() - o.updated_at)::INT AS dias_en_estado,
  EXTRACT(DAY FROM NOW() - o.fecha_ingreso)::INT AS dias_totales,
  CASE
    WHEN o.estado = 'ENTREGADO' THEN 'none'
    WHEN o.fecha_entrega_estimada IS NOT NULL AND o.fecha_entrega_estimada < CURRENT_DATE THEN 'grave'
    WHEN o.fecha_entrega_estimada IS NOT NULL AND o.fecha_entrega_estimada <= CURRENT_DATE + INTERVAL '2 days' THEN 'leve'
    WHEN o.fecha_entrega_estimada IS NOT NULL THEN 'none'
    WHEN o.estado = 'INGRESADO'
         AND NOW() - o.updated_at > INTERVAL '6 days' THEN 'grave'
    WHEN o.estado = 'INGRESADO'
         AND NOW() - o.updated_at > INTERVAL '3 days' THEN 'leve'
    WHEN o.estado = 'EN_TALLER'
         AND NOW() - o.updated_at > INTERVAL '10 days' THEN 'grave'
    WHEN o.estado = 'EN_TALLER'
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
  END AS nivel_retraso,
  tl.id AS traslado_activo_id,
  tl.tipo AS traslado_activo_tipo,
  tl.estado AS traslado_activo_estado
FROM ordenes o
LEFT JOIN clientes c ON o.cliente_id = c.id
LEFT JOIN talleres t ON o.taller_id = t.id
LEFT JOIN sucursales s ON o.sucursal_id = s.id
LEFT JOIN sucursales sr ON o.sucursal_recepcion_id = sr.id
LEFT JOIN sucursales srt ON o.sucursal_retiro_id = srt.id
LEFT JOIN empleados e ON o.empleado_id = e.id
LEFT JOIN LATERAL (
  SELECT tl2.id, tl2.tipo, tl2.estado
  FROM traslados tl2
  WHERE tl2.orden_id = o.id AND tl2.estado != 'recibido'
  ORDER BY tl2.created_at DESC
  LIMIT 1
) tl ON true;

-- Reaplicar security_invoker (se pierde al recrear la view con DROP + CREATE)
ALTER VIEW public.v_ordenes_dashboard SET (security_invoker = true);

COMMIT;
```

**Nota de implementación:** el plan debe verificar contra el estado real de la base (o el último `git log` de migraciones al momento de implementar) que no haya una migración más reciente que `024` redefiniendo `v_ordenes_dashboard`, antes de aplicar este `CREATE VIEW`.

`empleado_id` queda **nullable a nivel de base de datos** (no se puede aplicar `NOT NULL` porque hay órdenes existentes sin empleado) pero **obligatorio a nivel de aplicación** para toda orden nueva, igual que se hizo con `sucursal_id` en su momento salvo que ahí sí se pudo backfillear con datos ficticios. Acá no hay forma de inferir retroactivamente quién cargó una orden vieja, así que queda en null para las históricas.

---

## 2. Panel admin — dentro de `app/admin/sucursales/page.js`

Cada fila de la tabla de sucursales se expande (o incluye una sub-sección debajo) mostrando sus empleados:

- Lista de empleados de esa sucursal, con badge activo/inactivo igual al de sucursales.
- Botón **"+ Agregar empleado"** por sucursal, que revela un input inline (mismo patrón que el formulario "+ Nueva sucursal": input + botón Crear + Cancelar).
- Acción "Desactivar" / "Activar" por empleado (toggle de `activo`, no delete — para no romper la referencia desde órdenes ya creadas).
- No hay "Renombrar" en el primer alcance (no es un requisito planteado); se puede desactivar y crear uno nuevo si hace falta corregir un nombre.

### API — `app/api/admin/empleados/route.js` (nuevo)

Mismo patrón que `app/api/admin/sucursales/route.js`:

- `GET` — lista empleados (opcionalmente filtrado por `?sucursal_id=`), gateado por `verifyAdmin()`.
- `POST` — crea empleado (`{ sucursal_id, nombre }`), gateado por `verifyAdmin()`. Valida `nombre` no vacío/≤100 chars y `sucursal_id` con formato UUID válido y existente.
- `PATCH` — actualiza `activo` (`{ empleadoId, activo }`), gateado por `verifyAdmin()`.

### Lectura pública — `lib/data.js`

```js
// ─── Empleados ──────────────────────────────────────────────────────────────

export async function getEmpleados() {
  const { data, error } = await getSupabaseClient()
    .from("empleados")
    .select("id, sucursal_id, nombre, activo, created_at")
    .order("nombre")
  if (error) throw error
  return data
}
```

Igual que `getSucursales()`, usa el cliente público (no admin) porque la tabla tiene RLS abierta a usuarios autenticados — necesario para que `NuevoIngresoModal` (usado por empleados no-admin) pueda leerla sin pasar por una ruta admin-gated.

---

## 3. Formulario de creación de orden — `components/NuevoIngresoModal.js`

Debajo del selector de sucursal (después de la línea ~442) se agrega un `<select>` de empleado:

```js
const [empleados, setEmpleados] = useState([]);

useEffect(() => {
  getEmpleados()
    .then((data) => setEmpleados(data.filter((e) => e.activo)))
    .catch(() => {});
}, []);

const empleadosDeSucursal = empleados.filter((e) => e.sucursal_id === form.sucursal_id);
```

- Reset de `empleado_id` cuando cambia `sucursal_id` (tanto en el `onChange` del select de sucursal para admin, como si cambia por sesión para no-admin).
- El `<select>` de empleado está **deshabilitado** (`disabled`) mientras `!form.sucursal_id`. Para admin esto ocurre naturalmente hasta que elija sucursal; para empleado no-admin, `sucursal_id` ya viene fijo de la sesión, así que el select de empleado se habilita de entrada.
- Solo se listan empleados con `activo === true` de la sucursal seleccionada.
- Validación en `handleSubmit` (junto a la de `sucursal_id`, línea ~148):
  ```js
  if (!form.empleado_id) {
    setError("Seleccioná qué empleado ingresa la orden.");
    return;
  }
  ```
- Botón "Registrar Ingreso" (línea 719) agrega `|| !form.empleado_id` a la condición `disabled`.
- `empleado_id` se agrega al payload enviado a `crearOrden`.

---

## 4. Validación server-side

- **`app/api/ordenes/route.js` POST:** agregar chequeo de `empleado_id` requerido, igual que ya valida `sucursal_id`.
- **`lib/data.js` `crearOrden()`:** agregar parámetro `empleado_id` al destructuring e insert. Antes de insertar, verificar que el empleado pertenece a la `sucursal_id` de la orden (evita mandar por API un `empleado_id` de otra sucursal):
  ```js
  const { data: empleado } = await getSupabaseAdmin()
    .from("empleados")
    .select("sucursal_id")
    .eq("id", empleado_id)
    .single();
  if (!empleado || empleado.sucursal_id !== sucursal_id) {
    throw new Error("El empleado no pertenece a la sucursal seleccionada");
  }
  ```

Como se definió en el diseño, **el campo empleado es fijo una vez creada la orden** — no se agrega a ninguna pantalla de edición de orden existente, solo al alta.

---

## 5. Datos existentes

Las órdenes creadas antes de este cambio quedan con `empleado_id = null`. Donde se muestre el empleado (si se llega a agregar a la UI de detalle de orden más adelante), debe mostrarse como "—" o "Sin registrar" cuando sea null. Este spec no incluye agregar esa visualización al detalle de orden — solo la captura obligatoria en el alta y la exposición de `empleado_nombre` en la view por si una pantalla futura la necesita.

---

## 6. Testing

Tests con Vitest (siguiendo el patrón de `lib/__tests__/data.test.js`):

- `crearOrden` rechaza (lanza error) si falta `empleado_id`.
- `crearOrden` rechaza si el `empleado_id` no pertenece a la `sucursal_id` de la orden.
- `POST /api/admin/empleados` rechaza sin sesión admin (403).
- `POST /api/admin/empleados` rechaza `nombre` vacío o `sucursal_id` inválido.
- `PATCH /api/admin/empleados` togglea `activo` correctamente.

---

## Lo que NO cambia

- Tabla `usuarios` — sin cambios, sigue siendo el sistema de login/roles.
- Pantallas de edición/detalle de orden — no se agrega el campo empleado ahí (solo alta).
- No hay reporte de "órdenes por empleado" en este alcance — la data queda disponible (`empleado_id`, `empleado_nombre` en la view) para un feature futuro.

---

## Casos borde

| Caso | Comportamiento |
|------|-----------------|
| Sucursal sin empleados activos | El `<select>` de empleado queda vacío/solo con placeholder; no se puede registrar la orden hasta cargar al menos un empleado en esa sucursal desde el admin. |
| Empleado desactivado después de usarse en órdenes | Las órdenes ya creadas conservan la referencia (`empleado_id`) y siguen mostrando su nombre; el empleado desactivado deja de aparecer en el selector de nuevas órdenes. |
| Orden histórica sin empleado | `empleado_id` es `null`; no se migra retroactivamente. |
| Empleado no-admin cambia de sucursal en su sesión | No aplica en este alcance — `sucursal_id` de empleados no-admin es fijo por sesión, igual que hoy. |
