# Mejoras Cliente 2026-04-15 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar Nuevo Centro como centro de reparación y agregar campos de material/peso a las órdenes.

**Architecture:** Dos cambios independientes: (1) migración DB para marcar Nuevo Centro como centro de reparación + refactor de `getCentroReparacion()` para soportar múltiples centros, (2) migración DB para material/peso + actualización del formulario, data layer y vistas de detalle.

**Tech Stack:** Next.js 14, Supabase (PostgreSQL), React, Vitest

---

## File Structure

**Files to create:**
- `supabase/017_nuevo_centro_reparacion.sql` — migración: marcar Nuevo Centro como centro de reparación
- `supabase/018_material_peso.sql` — migración: agregar columnas material, material_otro, peso_gramos

**Files to modify:**
- `lib/constants.js` — agregar `MATERIALES` array
- `lib/traslados.js:190-199` — refactor `getCentroReparacion()` → `getCentrosReparacion()` (plural, sin `.single()`)
- `lib/data.js:64-106` — actualizar `crearOrden()`: aceptar material/peso, cambiar lógica de auto-transfer
- `components/NuevoIngresoModal.js:17-28,321-358` — agregar campos material/peso al formulario
- `components/DetalleOrdenModal.js:328-332` — mostrar material/peso en detalle
- `app/seguimiento/[token]/page.js:17,66-69` — agregar material/peso a query y visualización
- `lib/__tests__/traslados.test.js` — actualizar tests para múltiples centros

---

## Task 1: Migración — Nuevo Centro como centro de reparación

**Files:**
- Create: `supabase/017_nuevo_centro_reparacion.sql`

- [ ] **Step 1: Escribir la migración SQL**

```sql
-- 017_nuevo_centro_reparacion.sql
-- Habilitar Nuevo Centro como centro de reparación adicional.
-- Esto permite que las órdenes creadas en Nuevo Centro se reparen in situ.

UPDATE sucursales
SET es_centro_reparacion = true
WHERE nombre ILIKE '%nuevo centro%';
```

- [ ] **Step 2: Verificar que la sucursal existe**

Run: `grep -i "nuevo centro" supabase/*.sql` para confirmar el nombre exacto en los seeds/migraciones.
Si no aparece, buscar en la DB directamente o preguntar al usuario el nombre exacto.

- [ ] **Step 3: Commit**

```bash
git add supabase/017_nuevo_centro_reparacion.sql
git commit -m "feat: migración para habilitar Nuevo Centro como centro de reparación"
```

---

## Task 2: Refactor getCentroReparacion → soportar múltiples centros

**Files:**
- Modify: `lib/traslados.js:190-199`
- Modify: `lib/data.js:87-100`
- Test: `lib/__tests__/traslados.test.js`

- [ ] **Step 1: Escribir test para getCentrosReparacion (plural)**

En `lib/__tests__/traslados.test.js`, agregar:

```javascript
describe("getCentrosReparacion", () => {
  it("returns all sucursales with es_centro_reparacion=true", async () => {
    const mockData = [
      { id: "centro-1", nombre: "Punta Carretas", es_centro_reparacion: true },
      { id: "centro-2", nombre: "Nuevo Centro", es_centro_reparacion: true },
    ];
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      }),
    });

    const result = await trasladosModule.getCentrosReparacion();
    expect(result).toHaveLength(2);
    expect(result[0].nombre).toBe("Punta Carretas");
  });

  it("throws on supabase error", async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
      }),
    });

    await expect(trasladosModule.getCentrosReparacion()).rejects.toThrow("DB error");
  });
});
```

- [ ] **Step 2: Correr test, verificar que falla**

Run: `npx vitest run lib/__tests__/traslados.test.js --reporter=verbose`
Expected: FAIL — `getCentrosReparacion` no existe.

- [ ] **Step 3: Implementar getCentrosReparacion en traslados.js**

En `lib/traslados.js`, reemplazar `getCentroReparacion` (lines 190-199):

```javascript
/**
 * Get all sucursales marked as repair centers.
 *
 * @returns {Promise<Array>} Array of repair center sucursal records
 */
export async function getCentrosReparacion() {
  const { data, error } = await getSupabaseClient()
    .from("sucursales")
    .select("*")
    .eq("es_centro_reparacion", true);

  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Actualizar import y lógica de auto-transfer en data.js**

En `lib/data.js`, cambiar el import (line 2):

```javascript
import { getCentrosReparacion, crearTraslado, getTrasladoActivo } from "./traslados";
```

Reemplazar la lógica de auto-transfer en `crearOrden` (lines 87-103):

```javascript
  // Auto-create ida transfer if sucursal is not a repair center
  try {
    const centros = await getCentrosReparacion();
    const esCentro = centros.some((c) => c.id === sucursal_id);
    if (!esCentro && centros.length > 0) {
      const existing = await getTrasladoActivo(orden.id);
      if (!existing) {
        // Default to first repair center (Punta Carretas)
        await crearTraslado({
          orden_id: orden.id,
          sucursal_origen: sucursal_id,
          sucursal_destino: centros[0].id,
          tipo: "ida",
        });
      }
    }
  } catch (e) {
    console.error("[Traslado] Error creating auto-transfer:", e);
  }
```

- [ ] **Step 5: Actualizar tests existentes de getCentroReparacion**

En `lib/__tests__/traslados.test.js`, renombrar el describe existente de `getCentroReparacion` a `getCentrosReparacion` y ajustar los mocks para devolver arrays en vez de objetos `.single()`.

- [ ] **Step 6: Correr todos los tests**

Run: `npx vitest run --reporter=verbose`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/traslados.js lib/data.js lib/__tests__/traslados.test.js
git commit -m "feat: soportar múltiples centros de reparación en traslados y creación de órdenes"
```

---

## Task 3: Migración — Agregar material y peso a ordenes

**Files:**
- Create: `supabase/018_material_peso.sql`

- [ ] **Step 1: Escribir la migración SQL**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/018_material_peso.sql
git commit -m "feat: migración para agregar material y peso a órdenes"
```

---

## Task 4: Agregar constante MATERIALES

**Files:**
- Modify: `lib/constants.js:28-37`

- [ ] **Step 1: Agregar MATERIALES después de TIPOS_ARTICULO**

En `lib/constants.js`, después de la línea 37 (cierre de TIPOS_ARTICULO), agregar:

```javascript
export const MATERIALES = [
  { value: "oro", label: "Oro" },
  { value: "plata", label: "Plata" },
  { value: "acero", label: "Acero" },
  { value: "otro", label: "Otro" },
];
```

- [ ] **Step 2: Commit**

```bash
git add lib/constants.js
git commit -m "feat: agregar constante MATERIALES para selector de material"
```

---

## Task 5: Actualizar formulario de creación de orden

**Files:**
- Modify: `components/NuevoIngresoModal.js:5-6,17-28,91-119,321-358`

- [ ] **Step 1: Agregar import de MATERIALES**

En `components/NuevoIngresoModal.js` line 5, cambiar:

```javascript
import { TIPOS_ARTICULO, MATERIALES } from "@/lib/constants";
```

- [ ] **Step 2: Agregar campos al state del form**

En el estado inicial del form (lines 17-28), agregar `material`, `material_otro`, `peso_gramos`:

```javascript
const [form, setForm] = useState({
  tipo_articulo: "Reloj",
  marca: "",
  modelo: "",
  problema_reportado: "",
  notas_internas: "",
  nombre_articulo: "",
  monto_presupuesto: "",
  moneda: "UYU",
  tipo_servicio_id: "",
  sucursal_id: "",
  material: "",
  material_otro: "",
  peso_gramos: "",
});
```

- [ ] **Step 3: Agregar validación en handleSubmit**

En `handleSubmit` (line 91), después de la validación de sucursal (line 102), agregar:

```javascript
    if (form.material === "oro" && !form.peso_gramos) {
      setError("El peso es obligatorio para artículos de oro.");
      return;
    }

    if (form.material === "otro" && !form.material_otro.trim()) {
      setError("Especificá el material.");
      return;
    }
```

- [ ] **Step 4: Agregar material/peso al llamado de crearOrden**

En el llamado a `crearOrden` (lines 107-119), agregar los campos nuevos:

```javascript
      const orden = await crearOrden({
        cliente_id: clienteSeleccionado.id,
        tipo_articulo: form.tipo_articulo,
        marca: form.marca,
        modelo: form.modelo,
        problema_reportado: form.problema_reportado,
        notas_internas: form.notas_internas,
        nombre_articulo: form.tipo_articulo === "Otro" ? form.nombre_articulo : null,
        monto_presupuesto: form.monto_presupuesto ? parseFloat(form.monto_presupuesto) : null,
        moneda: form.moneda,
        tipo_servicio_id: form.tipo_servicio_id || null,
        sucursal_id: form.sucursal_id,
        material: form.material || null,
        material_otro: form.material === "otro" ? form.material_otro : null,
        peso_gramos: form.peso_gramos ? parseFloat(form.peso_gramos) : null,
      });
```

- [ ] **Step 5: Agregar campos de UI al formulario (Step 2 del form)**

Después del bloque de tipo de artículo (después de line 358, tras el cierre del condicional `tipo_articulo === "Otro"`), agregar:

```jsx
              {/* Material */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Material
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {MATERIALES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setForm({ ...form, material: form.material === m.value ? "" : m.value, material_otro: "" })}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        form.material === m.value
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Material otro - texto libre */}
              {form.material === "otro" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ¿Qué material es?
                  </label>
                  <input
                    type="text"
                    value={form.material_otro}
                    onChange={(e) => setForm({ ...form, material_otro: e.target.value })}
                    placeholder="Ej: Titanio, Platino..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
              )}

              {/* Peso */}
              {form.material && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Peso (gramos){form.material === "oro" ? " *" : ""}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.peso_gramos}
                    onChange={(e) => setForm({ ...form, peso_gramos: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  {form.material === "oro" && (
                    <p className="text-xs text-amber-600 mt-1">Obligatorio para artículos de oro.</p>
                  )}
                </div>
              )}
```

- [ ] **Step 6: Commit**

```bash
git add components/NuevoIngresoModal.js
git commit -m "feat: agregar campos de material y peso al formulario de nueva orden"
```

---

## Task 6: Actualizar data layer (crearOrden)

**Files:**
- Modify: `lib/data.js:64-82`

- [ ] **Step 1: Agregar parámetros material/peso a crearOrden**

Actualizar la firma y el insert en `lib/data.js`:

```javascript
export async function crearOrden({ cliente_id, tipo_articulo, marca, modelo, problema_reportado, notas_internas, monto_presupuesto, moneda, nombre_articulo, tipo_servicio_id, sucursal_id, material, material_otro, peso_gramos }) {
  const { data: orden, error } = await getSupabaseClient()
    .from("ordenes")
    .insert({
      cliente_id,
      tipo_articulo,
      marca,
      modelo,
      problema_reportado,
      notas_internas,
      monto_presupuesto: monto_presupuesto || null,
      moneda: moneda || "UYU",
      nombre_articulo: nombre_articulo || null,
      tipo_servicio_id: tipo_servicio_id || null,
      sucursal_id,
      sucursal_recepcion_id: sucursal_id,
      sucursal_retiro_id: sucursal_id,
      material: material || null,
      material_otro: material_otro || null,
      peso_gramos: peso_gramos || null,
    })
    .select("*")
    .single();
```

- [ ] **Step 2: Correr tests**

Run: `npx vitest run --reporter=verbose`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/data.js
git commit -m "feat: aceptar material y peso en crearOrden"
```

---

## Task 7: Mostrar material y peso en detalle de orden

**Files:**
- Modify: `components/DetalleOrdenModal.js:328-332`

- [ ] **Step 1: Agregar material y peso al bloque de artículo**

En `components/DetalleOrdenModal.js`, reemplazar el bloque de Artículo (lines 328-332):

```jsx
            <div className="bg-slate-50 p-3 rounded-lg">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Artículo</div>
              <div className="text-sm font-bold text-slate-900">{orden.tipo_articulo}</div>
              <div className="text-xs text-slate-500">{orden.marca || "—"}</div>
              {orden.material && (
                <div className="text-xs text-slate-500 mt-1">
                  Material: {orden.material === "otro" ? orden.material_otro : orden.material.charAt(0).toUpperCase() + orden.material.slice(1)}
                  {orden.peso_gramos ? ` — ${orden.peso_gramos} g` : ""}
                </div>
              )}
            </div>
```

- [ ] **Step 2: Commit**

```bash
git add components/DetalleOrdenModal.js
git commit -m "feat: mostrar material y peso en detalle de orden"
```

---

## Task 8: Mostrar material y peso en página de seguimiento

**Files:**
- Modify: `app/seguimiento/[token]/page.js:17,66-69`

- [ ] **Step 1: Agregar campos a la query de Supabase**

En `app/seguimiento/[token]/page.js` line 17, agregar `material, material_otro, peso_gramos` al select:

```javascript
    .select("numero_orden, tipo_articulo, marca, material, material_otro, peso_gramos, estado, fecha_ingreso, fecha_envio_taller, fecha_aprobacion, fecha_listo, fecha_entrega, tracking_token, clientes(nombre), talleres(nombre)")
```

- [ ] **Step 2: Agregar visualización después del artículo**

En la sección de detalle (después de line 69), agregar una fila de material/peso:

```jsx
            {orden.material && (
              <div className="flex gap-2">
                <span className="text-slate-400 w-24 flex-shrink-0">Material</span>
                <span className="text-slate-700">
                  {orden.material === "otro" ? orden.material_otro : orden.material.charAt(0).toUpperCase() + orden.material.slice(1)}
                  {orden.peso_gramos ? ` — ${orden.peso_gramos} g` : ""}
                </span>
              </div>
            )}
```

- [ ] **Step 3: Commit**

```bash
git add app/seguimiento/[token]/page.js
git commit -m "feat: mostrar material y peso en página de seguimiento"
```

---

## Task 9: Verificación final

- [ ] **Step 1: Correr todos los tests**

Run: `npx vitest run --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 2: Verificar build**

Run: `npx next build`
Expected: Build success sin errores

- [ ] **Step 3: Revisión visual manual**

Verificar en el navegador:
1. Crear orden en Nuevo Centro → no se crea traslado automático
2. Crear orden en otra sucursal → traslado se crea correctamente
3. Crear orden con material Oro sin peso → error de validación
4. Crear orden con material Oro con peso → éxito
5. Crear orden con material Otro → campo de texto aparece
6. Ver detalle de orden → material y peso visibles
7. Ver seguimiento público → material y peso visibles
