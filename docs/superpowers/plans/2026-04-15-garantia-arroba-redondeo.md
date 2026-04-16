# Garantía, Botón @ y Fix Redondeo — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar checkbox de garantía que deshabilita presupuestos, botón @ discreto en campo de email, y corregir redondeo en inputs de presupuesto.

**Architecture:** Tres cambios independientes en el formulario de nueva orden. Una migración DB para la columna `en_garantia`. Cambios en el modal, data layer, y vista del dashboard.

**Tech Stack:** Next.js, React, Supabase (PostgreSQL), Tailwind CSS

---

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `supabase/023_garantia.sql` | Crear: migración para columna `en_garantia` + recrear vista |
| `components/NuevoIngresoModal.js` | Modificar: checkbox garantía, botón @, fix step |
| `lib/data.js:64` | Modificar: aceptar `en_garantia` en `crearOrden()` |

---

## Task 1: Migración — Agregar columna `en_garantia`

**Files:**
- Create: `supabase/023_garantia.sql`

- [ ] **Step 1: Crear archivo de migración**

```sql
-- 023_garantia.sql
-- Agregar campo en_garantia a ordenes.
-- Cuando es true, la orden no tiene costo (presupuestos quedan null).

ALTER TABLE ordenes ADD COLUMN en_garantia BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Recrear vista `v_ordenes_dashboard` incluyendo `en_garantia`**

En el mismo archivo `023_garantia.sql`, agregar después del ALTER:

```sql
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
  o.updated_at,
  EXTRACT(DAY FROM NOW() - o.updated_at)::INT AS dias_en_estado,
  EXTRACT(DAY FROM NOW() - o.fecha_ingreso)::INT AS dias_totales,
  CASE
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
LEFT JOIN LATERAL (
  SELECT tl2.id, tl2.tipo, tl2.estado
  FROM traslados tl2
  WHERE tl2.orden_id = o.id AND tl2.estado != 'recibido'
  ORDER BY tl2.created_at DESC
  LIMIT 1
) tl ON true;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/023_garantia.sql
git commit -m "feat: migración para agregar en_garantia a ordenes"
```

---

## Task 2: Data layer — Aceptar `en_garantia` en `crearOrden()`

**Files:**
- Modify: `lib/data.js:64-85`

- [ ] **Step 1: Agregar `en_garantia` al destructuring y al insert**

En `lib/data.js`, línea 64, cambiar la firma de `crearOrden`:

```javascript
export async function crearOrden({ cliente_id, tipo_articulo, marca, modelo, problema_reportado, notas_internas, monto_presupuesto, moneda, nombre_articulo, tipo_servicio_id, sucursal_id, material, material_otro, peso_gramos, monto_presupuesto_taller, en_garantia }) {
```

En el objeto de insert (línea 67-85), agregar después de `sucursal_retiro_id`:

```javascript
      en_garantia: en_garantia || false,
```

- [ ] **Step 2: Commit**

```bash
git add lib/data.js
git commit -m "feat: aceptar en_garantia en crearOrden"
```

---

## Task 3: Formulario — Checkbox de garantía

**Files:**
- Modify: `components/NuevoIngresoModal.js:17-33` (estado inicial)
- Modify: `components/NuevoIngresoModal.js:128-144` (handleSubmit)
- Modify: `components/NuevoIngresoModal.js:458-510` (sección presupuestos)

- [ ] **Step 1: Agregar `en_garantia` al estado del formulario**

En `components/NuevoIngresoModal.js`, en el objeto `form` inicial (línea 17-33), agregar después de `peso_gramos: ""`:

```javascript
    en_garantia: false,
```

- [ ] **Step 2: Pasar `en_garantia` en el submit y limpiar presupuestos si es garantía**

En `handleSubmit`, en el objeto que se pasa a `crearOrden()` (líneas 128-144), reemplazar las líneas de presupuesto:

```javascript
        monto_presupuesto: form.en_garantia ? null : (form.monto_presupuesto ? parseFloat(form.monto_presupuesto) : null),
        monto_presupuesto_taller: form.en_garantia ? null : (form.monto_presupuesto_taller ? parseFloat(form.monto_presupuesto_taller) : null),
```

Y agregar al final del objeto:

```javascript
        en_garantia: form.en_garantia,
```

- [ ] **Step 3: Agregar checkbox antes de la sección de presupuestos**

En `components/NuevoIngresoModal.js`, justo antes del div de presupuestos (línea 458 `{/* Presupuestos (opcionales) */}`), insertar:

```jsx
              {/* Garantía */}
              <div className="flex items-center gap-2 mt-4">
                <input
                  type="checkbox"
                  id="en_garantia"
                  checked={form.en_garantia}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm({
                      ...form,
                      en_garantia: checked,
                      monto_presupuesto: checked ? "" : form.monto_presupuesto,
                      monto_presupuesto_taller: checked ? "" : form.monto_presupuesto_taller,
                    });
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-500/20"
                />
                <label htmlFor="en_garantia" className="text-sm text-slate-700">
                  En garantía (sin costo)
                </label>
              </div>
```

- [ ] **Step 4: Deshabilitar campos de presupuesto cuando `en_garantia` está marcado**

En la sección de presupuestos, en el input de presupuesto taller (línea 473-481), agregar `disabled` y clase condicional:

Reemplazar:
```jsx
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.monto_presupuesto_taller}
                      onChange={(e) => setForm({ ...form, monto_presupuesto_taller: e.target.value })}
                      placeholder="0.00"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
```

Con:
```jsx
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={form.monto_presupuesto_taller}
                      onChange={(e) => setForm({ ...form, monto_presupuesto_taller: e.target.value })}
                      placeholder="0.00"
                      disabled={form.en_garantia}
                      className={`flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${form.en_garantia ? "opacity-50 cursor-not-allowed bg-gray-100" : ""}`}
                    />
```

Hacer lo mismo para el input de presupuesto cliente (línea 498-506):

Reemplazar:
```jsx
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.monto_presupuesto}
                      onChange={(e) => setForm({ ...form, monto_presupuesto: e.target.value })}
                      placeholder="0.00"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
```

Con:
```jsx
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={form.monto_presupuesto}
                      onChange={(e) => setForm({ ...form, monto_presupuesto: e.target.value })}
                      placeholder="0.00"
                      disabled={form.en_garantia}
                      className={`flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${form.en_garantia ? "opacity-50 cursor-not-allowed bg-gray-100" : ""}`}
                    />
```

También deshabilitar los selects de moneda cuando `en_garantia`. En el select de moneda del presupuesto taller (línea 465-472):

Reemplazar:
```jsx
                    <select
                      value={form.moneda}
                      onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                      className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
```

Con:
```jsx
                    <select
                      value={form.moneda}
                      onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                      disabled={form.en_garantia}
                      className={`border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${form.en_garantia ? "opacity-50 cursor-not-allowed bg-gray-100" : ""}`}
                    >
```

Hacer lo mismo para el select de moneda del presupuesto cliente (línea 490-496):

Reemplazar:
```jsx
                    <select
                      value={form.moneda}
                      onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                      className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
```

Con:
```jsx
                    <select
                      value={form.moneda}
                      onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                      disabled={form.en_garantia}
                      className={`border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${form.en_garantia ? "opacity-50 cursor-not-allowed bg-gray-100" : ""}`}
                    >
```

- [ ] **Step 5: Commit**

```bash
git add components/NuevoIngresoModal.js
git commit -m "feat: checkbox en garantía que deshabilita presupuestos"
```

---

## Task 4: Botón `@` en campo de email

**Files:**
- Modify: `components/NuevoIngresoModal.js:286-295` (campo email del nuevo cliente)

- [ ] **Step 1: Agregar ref para el input de email**

En la sección de imports (línea 3), `useRef` ya está importado. Agregar un nuevo ref después del `inputRef` existente (línea 39):

```javascript
  const emailRef = useRef(null);
```

- [ ] **Step 2: Reemplazar el input de email con wrapper que incluye botón @**

En `components/NuevoIngresoModal.js`, reemplazar el bloque del input de email (líneas 286-295):

Reemplazar:
```jsx
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Email *
                </label>
                <input
                  type="email"
                  placeholder="email@ejemplo.com"
                  value={nuevoCliente.email}
                  onChange={(e) => setNuevoCliente({ ...nuevoCliente, email: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
```

Con:
```jsx
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Email *
                </label>
                <div className="relative">
                  <input
                    ref={emailRef}
                    type="email"
                    placeholder="email@ejemplo.com"
                    value={nuevoCliente.email}
                    onChange={(e) => setNuevoCliente({ ...nuevoCliente, email: e.target.value })}
                    className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const input = emailRef.current;
                      if (!input) return;
                      const pos = input.selectionStart ?? input.value.length;
                      const val = input.value;
                      const newVal = val.slice(0, pos) + "@" + val.slice(pos);
                      setNuevoCliente({ ...nuevoCliente, email: newVal });
                      setTimeout(() => {
                        input.focus();
                        input.setSelectionRange(pos + 1, pos + 1);
                      }, 0);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 text-sm font-mono px-1.5 py-0.5 rounded hover:bg-indigo-50 transition-colors"
                    tabIndex={-1}
                  >
                    @
                  </button>
                </div>
              </div>
```

- [ ] **Step 3: Commit**

```bash
git add components/NuevoIngresoModal.js
git commit -m "feat: botón @ discreto en campo de email"
```

---

## Task 5: Fix redondeo de presupuestos

**Files:**
- Modify: `components/NuevoIngresoModal.js:474-476,499-501`

**Nota:** Si seguiste el Task 3 en orden, los `step="0.01"` ya fueron cambiados a `step="any"` como parte del reemplazo de los inputs de presupuesto. Este task es para verificar que no haya quedado ningún `step="0.01"` residual en los inputs de presupuesto.

- [ ] **Step 1: Verificar que ambos inputs de presupuesto tengan `step="any"`**

Buscar en `components/NuevoIngresoModal.js` que no quede ningún `step="0.01"` en los inputs de `monto_presupuesto_taller` y `monto_presupuesto`. Si Task 3 fue ejecutado correctamente, ya están cambiados. Si no, cambiar manualmente:

En cada input de presupuesto, reemplazar:
```jsx
step="0.01"
```
Con:
```jsx
step="any"
```

- [ ] **Step 2: Commit (solo si hubo cambios)**

```bash
git add components/NuevoIngresoModal.js
git commit -m "fix: usar step=any en presupuestos para evitar redondeo"
```

---

## Task 6: Verificación manual

- [ ] **Step 1: Ejecutar el servidor de desarrollo**

```bash
npm run dev
```

- [ ] **Step 2: Probar checklist**

1. Abrir formulario de nueva orden
2. Marcar "En garantía" → campos de presupuesto se deshabilitan y se limpian
3. Desmarcar → campos vuelven a habilitarse
4. Crear cliente nuevo → verificar que el botón `@` aparece en el campo de email
5. Tocar botón `@` → se inserta `@` en la posición del cursor
6. Ingresar 500 en presupuesto → verificar que queda como 500, no 499.99
7. Crear orden con garantía → verificar que `en_garantia = true` en la base de datos y presupuestos son null
