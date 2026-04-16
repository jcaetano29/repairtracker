# Ajustes post-reunión cliente v2 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 3 features independientes: RUT/cédula en clientes, doble presupuesto (taller vs nuestro), y menú de marcas administrable.

**Architecture:** Cada feature es una migración SQL + cambios en `lib/data.js` + cambios en componentes UI. Se implementan en orden secuencial para evitar conflictos en la vista `v_ordenes_dashboard` que se recrea en cada migración.

**Tech Stack:** Next.js 14, Supabase (PostgreSQL), React, Tailwind CSS

---

## Task 1: RUT/Cédula — Migración SQL

**Files:**
- Create: `supabase/020_documento_cliente.sql`

- [ ] **Step 1: Crear migración SQL**

```sql
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
```

- [ ] **Step 2: Ejecutar migración en Supabase**

Ejecutar el SQL anterior via `mcp__claude_ai_Supabase__execute_sql` contra proyecto `ljvncjytkccozahktevk`.

- [ ] **Step 3: Commit**

```bash
git add supabase/020_documento_cliente.sql
git commit -m "feat: agregar campo documento (cédula/RUT) a tabla clientes"
```

---

## Task 2: RUT/Cédula — Backend (búsqueda y creación)

**Files:**
- Modify: `lib/data.js:243-267` (funciones `buscarClientes` y `crearCliente`)

- [ ] **Step 1: Actualizar `buscarClientes` para soportar búsqueda exacta por documento**

En `lib/data.js`, reemplazar la función `buscarClientes` (líneas 243-256):

```javascript
export async function buscarClientes(query) {
  const sanitized = query.replace(/[%_]/g, "");
  if (!sanitized.trim()) return [];

  // Búsqueda exacta por documento primero
  const { data: exactMatch, error: exactError } = await getSupabaseClient()
    .from("clientes")
    .select("*")
    .eq("documento", sanitized.trim());

  if (exactError) throw exactError;
  if (exactMatch && exactMatch.length > 0) return exactMatch;

  // Búsqueda fuzzy por nombre o teléfono
  const { data, error } = await getSupabaseClient()
    .from("clientes")
    .select("*")
    .or(`nombre.ilike.%${sanitized}%,telefono.ilike.%${sanitized}%`)
    .limit(10);

  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Actualizar `crearCliente` para aceptar documento**

En `lib/data.js`, reemplazar la función `crearCliente` (líneas 258-267):

```javascript
export async function crearCliente({ nombre, telefono, email, documento }) {
  const { data, error } = await getSupabaseClient()
    .from("clientes")
    .insert({ nombre, telefono, email, documento })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/data.js
git commit -m "feat: búsqueda exacta por documento y campo documento en crearCliente"
```

---

## Task 3: RUT/Cédula — UI (formulario y visualización)

**Files:**
- Modify: `components/NuevoIngresoModal.js:15,79-81,227-283,199-213`
- Modify: `components/DetalleOrdenModal.js:323-327`
- Modify: `app/seguimiento/[token]/page.js:17,60-64`

- [ ] **Step 1: Agregar campo documento al formulario de nuevo cliente**

En `components/NuevoIngresoModal.js`, agregar `documento` al estado `nuevoCliente` (línea 15):

```javascript
const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", telefono: "", email: "", documento: "" });
```

Actualizar validación en `handleCrearCliente` (línea 80):

```javascript
if (!nuevoCliente.nombre.trim() || !nuevoCliente.telefono.trim() || !nuevoCliente.email.trim() || !nuevoCliente.documento.trim()) return;
```

Actualizar botón disabled (línea 278):

```javascript
disabled={!nuevoCliente.nombre || !nuevoCliente.telefono || !nuevoCliente.email || !nuevoCliente.documento || loading}
```

- [ ] **Step 2: Agregar input de documento en el formulario de crear cliente**

En `components/NuevoIngresoModal.js`, agregar ANTES del campo Nombre (antes de línea 239), dentro del bloque `step === 1 && creandoCliente`:

```jsx
<div>
  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
    Cédula / RUT *
  </label>
  <input
    ref={inputRef}
    type="text"
    placeholder="Ej: 1.234.567-8"
    value={nuevoCliente.documento}
    onChange={(e) => setNuevoCliente({ ...nuevoCliente, documento: e.target.value })}
    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
  />
</div>
```

Y quitar el `ref={inputRef}` del input de Nombre para que el foco vaya al documento.

- [ ] **Step 3: Mostrar documento en resultados de búsqueda de clientes**

En `components/NuevoIngresoModal.js`, en el listado de clientes encontrados (línea 210-211), agregar documento:

```jsx
<div className="font-semibold text-sm text-slate-900">{c.nombre}</div>
<div className="text-xs text-slate-500">{c.telefono} {c.documento ? `• ${c.documento}` : ""}</div>
```

- [ ] **Step 4: Mostrar documento en detalle de orden**

En `components/DetalleOrdenModal.js`, en la sección de info del cliente (líneas 323-327), agregar documento:

```jsx
<div className="bg-slate-50 p-3 rounded-lg">
  <div className="text-[10px] text-slate-400 font-semibold uppercase">Cliente</div>
  <div className="text-sm font-bold text-slate-900">{orden.cliente_nombre}</div>
  <div className="text-xs text-slate-500">{orden.cliente_telefono}</div>
  {orden.cliente_documento && (
    <div className="text-xs text-slate-500">Doc: {orden.cliente_documento}</div>
  )}
</div>
```

- [ ] **Step 5: Agregar `cliente_documento` a la vista v_ordenes_dashboard**

Esto requiere recrear la vista. Se hace en la migración de Task 4 (doble presupuesto) para evitar múltiples DROP/CREATE de la misma vista.

- [ ] **Step 6: Commit**

```bash
git add components/NuevoIngresoModal.js components/DetalleOrdenModal.js
git commit -m "feat: campo documento en formulario de cliente, búsqueda y detalle de orden"
```

---

## Task 4: Doble presupuesto — Migración SQL

**Files:**
- Create: `supabase/021_doble_presupuesto.sql`

- [ ] **Step 1: Crear migración SQL**

```sql
-- 021_doble_presupuesto.sql
-- Agregar presupuesto del taller y documento del cliente a vista dashboard.

ALTER TABLE ordenes ADD COLUMN monto_presupuesto_taller NUMERIC(12,2);

-- Recrear vista con campos nuevos: monto_presupuesto_taller + cliente_documento
DROP VIEW IF EXISTS v_ordenes_dashboard;

CREATE VIEW v_ordenes_dashboard AS
SELECT
  o.id,
  o.numero_orden,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
  c.documento AS cliente_documento,
  c.id AS cliente_id,
  o.tipo_articulo,
  o.marca,
  o.modelo,
  o.problema_reportado,
  o.estado,
  o.taller_id,
  t.nombre AS taller_nombre,
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
  END AS nivel_retraso
FROM ordenes o
LEFT JOIN clientes c ON o.cliente_id = c.id
LEFT JOIN talleres t ON o.taller_id = t.id;
```

**Nota:** Esta vista también incluye `cliente_documento` del Task 3, evitando tener que recrear la vista dos veces.

- [ ] **Step 2: Ejecutar migración en Supabase**

Ejecutar via `mcp__claude_ai_Supabase__execute_sql`.

- [ ] **Step 3: Commit**

```bash
git add supabase/021_doble_presupuesto.sql
git commit -m "feat: campo monto_presupuesto_taller y cliente_documento en vista dashboard"
```

---

## Task 5: Doble presupuesto — Backend

**Files:**
- Modify: `lib/data.js:64-84` (función `crearOrden`)
- Modify: `lib/data.js:149-154` (función `registrarPresupuesto`)

- [ ] **Step 1: Aceptar `monto_presupuesto_taller` en `crearOrden`**

En `lib/data.js`, actualizar la firma y el insert de `crearOrden` (línea 64):

```javascript
export async function crearOrden({ cliente_id, tipo_articulo, marca, modelo, problema_reportado, notas_internas, monto_presupuesto, monto_presupuesto_taller, moneda, nombre_articulo, tipo_servicio_id, sucursal_id, material, material_otro, peso_gramos }) {
```

Y en el objeto del insert (después de línea 74), agregar:

```javascript
monto_presupuesto_taller: monto_presupuesto_taller || null,
```

- [ ] **Step 2: Actualizar `registrarPresupuesto` para aceptar ambos montos**

En `lib/data.js`, reemplazar `registrarPresupuesto` (líneas 149-154):

```javascript
export async function registrarPresupuesto(orden_id, monto, moneda = "UYU", monto_taller = null) {
  return cambiarEstado(orden_id, "ESPERANDO_APROBACION", {
    monto_presupuesto: monto,
    monto_presupuesto_taller: monto_taller,
    moneda,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/data.js
git commit -m "feat: soportar monto_presupuesto_taller en crearOrden y registrarPresupuesto"
```

---

## Task 6: Doble presupuesto — UI

**Files:**
- Modify: `components/NuevoIngresoModal.js:17-31,120-135,437-464`
- Modify: `components/DetalleOrdenModal.js:19,126,168-187,346-358,470-519`

- [ ] **Step 1: Agregar campo presupuesto taller al formulario de nueva orden**

En `components/NuevoIngresoModal.js`, agregar al estado `form` (línea 17):

```javascript
monto_presupuesto_taller: "",
```

En `handleSubmit`, agregar al objeto que se pasa a `crearOrden` (después de línea 128):

```javascript
monto_presupuesto_taller: form.monto_presupuesto_taller ? parseFloat(form.monto_presupuesto_taller) : null,
```

- [ ] **Step 2: Agregar input de presupuesto taller en el formulario**

En `components/NuevoIngresoModal.js`, reemplazar la sección de presupuesto (líneas 437-464) con dos campos:

```jsx
{/* Presupuestos (opcionales) */}
<div className="mt-4 space-y-3">
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Presupuesto taller (opcional)
    </label>
    <div className="flex gap-2">
      <select
        value={form.moneda}
        onChange={(e) => setForm({ ...form, moneda: e.target.value })}
        className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="UYU">$U</option>
        <option value="USD">US$</option>
      </select>
      <input
        type="number"
        min="0"
        step="0.01"
        value={form.monto_presupuesto_taller}
        onChange={(e) => setForm({ ...form, monto_presupuesto_taller: e.target.value })}
        placeholder="0.00"
        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
    <p className="text-xs text-gray-400 mt-1">Lo que cobra el taller (uso interno).</p>
  </div>
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Presupuesto cliente (opcional)
    </label>
    <div className="flex gap-2">
      <select
        value={form.moneda}
        onChange={(e) => setForm({ ...form, moneda: e.target.value })}
        className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="UYU">$U</option>
        <option value="USD">US$</option>
      </select>
      <input
        type="number"
        min="0"
        step="0.01"
        value={form.monto_presupuesto}
        onChange={(e) => setForm({ ...form, monto_presupuesto: e.target.value })}
        placeholder="0.00"
        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
    <p className="text-xs text-gray-400 mt-1">Lo que se le cobra al cliente.</p>
  </div>
</div>
```

- [ ] **Step 3: Agregar presupuesto taller al panel de registrar presupuesto en DetalleOrdenModal**

En `components/DetalleOrdenModal.js`, agregar estado para monto taller (después de línea 19):

```javascript
const [montoTaller, setMontoTaller] = useState("");
```

Actualizar `handlePresupuesto` (línea 168) para pasar monto taller:

```javascript
async function handlePresupuesto() {
  if (!monto || parseFloat(monto) <= 0) return;
  setLoading(true);
  try {
    await registrarPresupuesto(orden.id, parseFloat(monto), moneda, montoTaller ? parseFloat(montoTaller) : null);
```

Pre-cargar monto taller cuando se abre el panel (línea 126):

```javascript
if (nuevoEstado === "ESPERANDO_APROBACION") {
  if (orden.monto_presupuesto) setMonto(String(orden.monto_presupuesto));
  if (orden.monto_presupuesto_taller) setMontoTaller(String(orden.monto_presupuesto_taller));
  setShowPresupuesto(true);
  return;
}
```

- [ ] **Step 4: Agregar input de presupuesto taller en el panel de presupuesto del DetalleOrdenModal**

En `components/DetalleOrdenModal.js`, dentro del bloque `showPresupuesto` (después de la línea del `<div className="text-sm font-semibold text-cyan-900">Registrar presupuesto</div>`), agregar campo de presupuesto taller ANTES del campo de monto existente:

```jsx
<div>
  <label className="block text-xs text-slate-500 mb-1">Presupuesto taller</label>
  <input
    type="number"
    min="0"
    step="0.01"
    placeholder="Monto del taller"
    value={montoTaller}
    onChange={(e) => setMontoTaller(e.target.value)}
    className="w-full px-3 py-2 border rounded-lg text-sm"
  />
</div>
<div>
  <label className="block text-xs text-slate-500 mb-1">Presupuesto cliente</label>
```

(El input de monto existente ya está, solo agregar el label "Presupuesto cliente" arriba.)

- [ ] **Step 5: Mostrar ambos presupuestos en el detalle de orden**

En `components/DetalleOrdenModal.js`, donde se muestra el monto (líneas 353-356), reemplazar:

```jsx
{orden.monto_presupuesto && (
  <div className="text-sm">
    <span className="font-bold text-slate-900">
      Cliente: {formatMonto(orden.monto_presupuesto, orden.moneda)}
    </span>
    {orden.monto_presupuesto_taller && (
      <span className="text-xs text-slate-500 ml-2">
        (Taller: {formatMonto(orden.monto_presupuesto_taller, orden.moneda)})
      </span>
    )}
  </div>
)}
```

- [ ] **Step 6: Verificar que seguimiento NO muestra presupuesto taller**

Revisar `app/seguimiento/[token]/page.js` — NO selecciona `monto_presupuesto` ni `monto_presupuesto_taller`, así que no se expone al cliente. No requiere cambios.

- [ ] **Step 7: Commit**

```bash
git add components/NuevoIngresoModal.js components/DetalleOrdenModal.js
git commit -m "feat: doble presupuesto (taller vs cliente) en formularios y detalle"
```

---

## Task 7: Menú de marcas — Migración SQL

**Files:**
- Create: `supabase/022_tabla_marcas.sql`

- [ ] **Step 1: Crear migración SQL**

```sql
-- 022_tabla_marcas.sql
-- Tabla de marcas administrables.

CREATE TABLE marcas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE marcas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON marcas
  FOR ALL USING (auth.role() = 'authenticated');
```

- [ ] **Step 2: Ejecutar migración en Supabase**

Ejecutar via `mcp__claude_ai_Supabase__execute_sql`.

- [ ] **Step 3: Commit**

```bash
git add supabase/022_tabla_marcas.sql
git commit -m "feat: crear tabla marcas administrable"
```

---

## Task 8: Menú de marcas — Backend

**Files:**
- Modify: `lib/data.js` (agregar funciones CRUD de marcas al final)

- [ ] **Step 1: Agregar funciones CRUD de marcas**

Al final de `lib/data.js`, agregar:

```javascript
// ============================================================
// MARCAS
// ============================================================

export async function getMarcas({ soloActivas = true } = {}) {
  let query = getSupabaseClient()
    .from("marcas")
    .select("*")
    .order("nombre");

  if (soloActivas) {
    query = query.eq("activo", true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function crearMarca({ nombre }) {
  const { data, error } = await getSupabaseClient()
    .from("marcas")
    .insert({ nombre })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMarca(id, { nombre, activo }) {
  const updates = {};
  if (nombre !== undefined) updates.nombre = nombre;
  if (activo !== undefined) updates.activo = activo;

  const { data, error } = await getSupabaseClient()
    .from("marcas")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMarca(id) {
  const { error } = await getSupabaseClient()
    .from("marcas")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/data.js
git commit -m "feat: funciones CRUD para marcas"
```

---

## Task 9: Menú de marcas — UI (selector en formulario)

**Files:**
- Modify: `components/NuevoIngresoModal.js:6,38-39,466-478`

- [ ] **Step 1: Importar `getMarcas` y cargar marcas**

En `components/NuevoIngresoModal.js`, agregar `getMarcas` al import (línea 6):

```javascript
import { buscarClientes, crearCliente, crearOrden, getTiposServicio, getSucursales, getMarcas } from "@/lib/data";
```

Agregar estado para marcas (después de línea 33):

```javascript
const [marcas, setMarcas] = useState([]);
```

Agregar useEffect para cargar marcas (junto a los otros useEffect, después de línea 39):

```javascript
useEffect(() => {
  getMarcas().then(setMarcas).catch(() => {});
}, []);
```

- [ ] **Step 2: Reemplazar input de marca por selector**

En `components/NuevoIngresoModal.js`, reemplazar el bloque de marca (líneas 466-478):

```jsx
<div>
  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
    Marca
  </label>
  <select
    value={form.marca}
    onChange={(e) => setForm({ ...form, marca: e.target.value })}
    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
  >
    <option value="">Seleccionar marca...</option>
    {marcas.map((m) => (
      <option key={m.id} value={m.nombre}>{m.nombre}</option>
    ))}
    <option value="__otra__">Otra</option>
  </select>
</div>
{form.marca === "__otra__" && (
  <div>
    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
      Especificar marca
    </label>
    <input
      type="text"
      placeholder="Nombre de la marca..."
      value={form.marca_otra}
      onChange={(e) => setForm({ ...form, marca_otra: e.target.value })}
      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
      autoFocus
    />
  </div>
)}
```

Agregar `marca_otra` al estado `form` (línea 17):

```javascript
marca_otra: "",
```

Actualizar `handleSubmit` para resolver la marca (antes del `crearOrden` call):

```javascript
const marcaFinal = form.marca === "__otra__" ? form.marca_otra : form.marca;
```

Y cambiar `marca: form.marca` a `marca: marcaFinal` en el objeto que se pasa a `crearOrden`.

- [ ] **Step 3: Commit**

```bash
git add components/NuevoIngresoModal.js
git commit -m "feat: selector de marcas en formulario de nueva orden"
```

---

## Task 10: Menú de marcas — Panel admin

**Files:**
- Create: `app/admin/marcas/page.js`
- Modify: `app/admin/layout.js:27-33`

- [ ] **Step 1: Agregar tab de Marcas al layout admin**

En `app/admin/layout.js`, agregar entrada en el array de nav (después de la línea de Talleres):

```javascript
{ href: "/admin/marcas", label: "🏷️ Marcas" },
```

- [ ] **Step 2: Crear página admin de marcas**

Crear `app/admin/marcas/page.js` siguiendo el patrón de `app/admin/tipos-servicio/page.js`:

```jsx
"use client";

import { useState, useEffect } from "react";
import { getMarcas, crearMarca, updateMarca, deleteMarca } from "@/lib/data";

export default function MarcasPage() {
  const [marcas, setMarcas] = useState([]);
  const [nombre, setNombre] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingNombre, setEditingNombre] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadMarcas();
  }, []);

  async function loadMarcas() {
    try {
      const data = await getMarcas({ soloActivas: false });
      setMarcas(data);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleCrear() {
    if (!nombre.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await crearMarca({ nombre: nombre.trim() });
      setNombre("");
      await loadMarcas();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(id) {
    if (!editingNombre.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await updateMarca(id, { nombre: editingNombre.trim() });
      setEditingId(null);
      setEditingNombre("");
      await loadMarcas();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActivo(id, activo) {
    setLoading(true);
    try {
      await updateMarca(id, { activo: !activo });
      await loadMarcas();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar esta marca?")) return;
    setLoading(true);
    try {
      await deleteMarca(id);
      await loadMarcas();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold text-slate-900 mb-6">Marcas</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Crear marca */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Nueva marca..."
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCrear()}
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
        />
        <button
          onClick={handleCrear}
          disabled={!nombre.trim() || loading}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50"
        >
          Agregar
        </button>
      </div>

      {/* Lista de marcas */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {marcas.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">No hay marcas registradas</div>
        )}
        {marcas.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            {editingId === m.id ? (
              <>
                <input
                  type="text"
                  value={editingNombre}
                  onChange={(e) => setEditingNombre(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUpdate(m.id)}
                  className="flex-1 px-2 py-1 border rounded text-sm"
                  autoFocus
                />
                <button onClick={() => handleUpdate(m.id)} className="text-xs text-indigo-600 font-semibold">Guardar</button>
                <button onClick={() => setEditingId(null)} className="text-xs text-slate-400">Cancelar</button>
              </>
            ) : (
              <>
                <span className={`flex-1 text-sm ${m.activo ? "text-slate-900" : "text-slate-400 line-through"}`}>
                  {m.nombre}
                </span>
                <button
                  onClick={() => { setEditingId(m.id); setEditingNombre(m.nombre); }}
                  className="text-xs text-indigo-500 hover:text-indigo-700"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleToggleActivo(m.id, m.activo)}
                  className={`text-xs ${m.activo ? "text-amber-500" : "text-green-500"}`}
                >
                  {m.activo ? "Desactivar" : "Activar"}
                </button>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/marcas/page.js app/admin/layout.js
git commit -m "feat: panel admin para gestión de marcas"
```

---

## Task 11: Verificación final

- [ ] **Step 1: Ejecutar build**

```bash
npm run build
```

Verificar que no hay errores de compilación.

- [ ] **Step 2: Verificar que la vista tiene todos los campos necesarios**

Ejecutar SQL para verificar columnas de la vista:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'v_ordenes_dashboard'
ORDER BY ordinal_position;
```

Confirmar que incluye: `cliente_documento`, `monto_presupuesto_taller`.

- [ ] **Step 3: Commit final si hay ajustes**

```bash
git add -A
git commit -m "fix: ajustes de verificación final"
```
