# State Simplification + UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce states from 10 to 8, rename ENVIADO_A_TALLER→EN_TALLER, remove ESPERANDO_PRESUPUESTO/PRESUPUESTO_RECIBIDO, add budget field on ingreso, add "Otro" text input for tipo_articulo, and add talleres CRUD to admin panel.

**Architecture:** DB migration first (data + constraints + trigger + view), then JS constants, then data layer functions, then UI components in dependency order. Tests updated in parallel with their respective layer.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL), Vitest, Resend (email — not touched here)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/004_state_simplification.sql` | Create | DB migration: rename states, update CHECK, trigger, view |
| `lib/constants.js` | Modify | Remove 2 states, rename EN_TALLER, update TRANSICIONES |
| `lib/data.js` | Modify | Fix asignarTaller, getStats, crearOrden budget, talleres CRUD |
| `components/DetalleOrdenModal.js` | Modify | Fix EN_TALLER string reference |
| `components/NuevoIngresoModal.js` | Modify | "Otro" text input + optional budget field |
| `app/admin/talleres/page.js` | Create | Talleres CRUD admin page |
| `app/admin/layout.js` | Modify | Add Talleres tab |
| `__tests__/constants.test.js` | Modify | Update tests for new state structure |

---

### Task 1: DB Migration

**Files:**
- Create: `supabase/004_state_simplification.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/004_state_simplification.sql
-- Migrate from 10 states to 8:
-- Remove: ESPERANDO_PRESUPUESTO, PRESUPUESTO_RECIBIDO
-- Rename: ENVIADO_A_TALLER → EN_TALLER
-- Keep: INGRESADO, EN_TALLER, ESPERANDO_APROBACION, RECHAZADO,
--        EN_REPARACION, LISTO_EN_TALLER, LISTO_PARA_RETIRO, ENTREGADO

BEGIN;

-- 1. Drop the view that references old state names
DROP VIEW IF EXISTS v_ordenes_dashboard;

-- 2. Drop the CHECK constraint on ordenes.estado
ALTER TABLE ordenes DROP CONSTRAINT IF EXISTS ordenes_estado_check;

-- 3. Migrate data: bridge orphaned states first
-- ESPERANDO_PRESUPUESTO → INGRESADO (no budget info gathered yet)
UPDATE ordenes SET estado = 'INGRESADO' WHERE estado = 'ESPERANDO_PRESUPUESTO';
-- PRESUPUESTO_RECIBIDO → ESPERANDO_APROBACION (equivalent meaning)
UPDATE ordenes SET estado = 'ESPERANDO_APROBACION' WHERE estado = 'PRESUPUESTO_RECIBIDO';
-- ENVIADO_A_TALLER → EN_TALLER (rename)
UPDATE ordenes SET estado = 'EN_TALLER' WHERE estado = 'ENVIADO_A_TALLER';

-- 4. Migrate historial_estados references
UPDATE historial_estados SET estado = 'INGRESADO' WHERE estado = 'ESPERANDO_PRESUPUESTO';
UPDATE historial_estados SET estado = 'ESPERANDO_APROBACION' WHERE estado = 'PRESUPUESTO_RECIBIDO';
UPDATE historial_estados SET estado = 'EN_TALLER' WHERE estado = 'ENVIADO_A_TALLER';

-- 5. Recreate CHECK constraint with 8 states
ALTER TABLE ordenes ADD CONSTRAINT ordenes_estado_check CHECK (
  estado IN (
    'INGRESADO',
    'EN_TALLER',
    'ESPERANDO_APROBACION',
    'RECHAZADO',
    'EN_REPARACION',
    'LISTO_EN_TALLER',
    'LISTO_PARA_RETIRO',
    'ENTREGADO'
  )
);

-- 6. Recreate the trigger function with updated state references
CREATE OR REPLACE FUNCTION log_estado_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO historial_estados (orden_id, estado, notas)
    VALUES (NEW.id, NEW.estado, NEW.notas_internas);

    -- Update date fields based on new state
    IF NEW.estado = 'EN_TALLER' THEN
      NEW.fecha_envio_taller = NOW();
    END IF;
    IF NEW.estado = 'LISTO_PARA_RETIRO' THEN
      NEW.fecha_listo = NOW();
    END IF;
    IF NEW.estado = 'ENTREGADO' THEN
      NEW.fecha_entrega = NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Recreate v_ordenes_dashboard view
CREATE OR REPLACE VIEW v_ordenes_dashboard AS
SELECT
  o.*,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
  c.email AS cliente_email,
  t.nombre AS taller_nombre,
  CASE
    WHEN o.estado = 'ENTREGADO' THEN 'ninguno'
    WHEN o.estado = 'INGRESADO' AND (NOW() - o.created_at) > INTERVAL '5 days' THEN 'grave'
    WHEN o.estado = 'INGRESADO' AND (NOW() - o.created_at) > INTERVAL '2 days' THEN 'leve'
    WHEN o.estado = 'EN_TALLER' AND (NOW() - COALESCE(o.fecha_envio_taller, o.created_at)) > INTERVAL '14 days' THEN 'grave'
    WHEN o.estado = 'EN_TALLER' AND (NOW() - COALESCE(o.fecha_envio_taller, o.created_at)) > INTERVAL '7 days' THEN 'leve'
    WHEN o.estado = 'ESPERANDO_APROBACION' AND (NOW() - o.updated_at) > INTERVAL '3 days' THEN 'grave'
    WHEN o.estado = 'ESPERANDO_APROBACION' AND (NOW() - o.updated_at) > INTERVAL '1 day' THEN 'leve'
    WHEN o.estado = 'EN_REPARACION' AND (NOW() - o.updated_at) > INTERVAL '7 days' THEN 'grave'
    WHEN o.estado = 'EN_REPARACION' AND (NOW() - o.updated_at) > INTERVAL '3 days' THEN 'leve'
    WHEN o.estado = 'LISTO_EN_TALLER' AND (NOW() - o.updated_at) > INTERVAL '3 days' THEN 'grave'
    WHEN o.estado = 'LISTO_EN_TALLER' AND (NOW() - o.updated_at) > INTERVAL '1 day' THEN 'leve'
    WHEN o.estado = 'LISTO_PARA_RETIRO' AND (NOW() - COALESCE(o.fecha_listo, o.updated_at)) > INTERVAL '7 days' THEN 'grave'
    WHEN o.estado = 'LISTO_PARA_RETIRO' AND (NOW() - COALESCE(o.fecha_listo, o.updated_at)) > INTERVAL '3 days' THEN 'leve'
    ELSE 'ninguno'
  END AS nivel_retraso
FROM ordenes o
LEFT JOIN clientes c ON o.cliente_id = c.id
LEFT JOIN talleres t ON o.taller_id = t.id;

COMMIT;
```

- [ ] **Step 2: Apply migration to Supabase**

```bash
# Apply via Supabase CLI (if configured locally):
supabase db push
# OR apply directly via MCP tool or Supabase dashboard SQL editor
```

Expected: No errors, all rows migrated successfully.

- [ ] **Step 3: Verify migration**

Run in Supabase SQL editor:
```sql
-- Should return 0 rows (no orphaned old state names)
SELECT estado, COUNT(*) FROM ordenes
WHERE estado IN ('ESPERANDO_PRESUPUESTO', 'PRESUPUESTO_RECIBIDO', 'ENVIADO_A_TALLER')
GROUP BY estado;

-- Should return only the 8 new states
SELECT DISTINCT estado FROM ordenes ORDER BY estado;
```

Expected: First query returns 0 rows. Second query shows only valid states.

- [ ] **Step 4: Commit**

```bash
git add supabase/004_state_simplification.sql
git commit -m "feat: db migration — simplify to 8 states, rename EN_TALLER"
```

---

### Task 2: Update Constants

**Files:**
- Modify: `lib/constants.js`

- [ ] **Step 1: Write failing test for new state structure**

Add to `__tests__/constants.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { ESTADOS, TRANSICIONES } from '../lib/constants';

describe('8-state structure', () => {
  it('has exactly 8 states', () => {
    expect(Object.keys(ESTADOS)).toHaveLength(8);
  });

  it('does not contain removed states', () => {
    expect(ESTADOS).not.toHaveProperty('ESPERANDO_PRESUPUESTO');
    expect(ESTADOS).not.toHaveProperty('PRESUPUESTO_RECIBIDO');
    expect(ESTADOS).not.toHaveProperty('ENVIADO_A_TALLER');
  });

  it('contains EN_TALLER instead of ENVIADO_A_TALLER', () => {
    expect(ESTADOS).toHaveProperty('EN_TALLER');
  });

  it('INGRESADO transitions to EN_TALLER and EN_REPARACION only', () => {
    expect(TRANSICIONES.INGRESADO).toEqual(
      expect.arrayContaining(['EN_TALLER', 'EN_REPARACION'])
    );
    expect(TRANSICIONES.INGRESADO).not.toContain('ESPERANDO_PRESUPUESTO');
    expect(TRANSICIONES.INGRESADO).not.toContain('ENVIADO_A_TALLER');
  });

  it('ESPERANDO_APROBACION transitions to LISTO_EN_TALLER and RECHAZADO', () => {
    expect(TRANSICIONES.ESPERANDO_APROBACION).toEqual(
      expect.arrayContaining(['LISTO_EN_TALLER', 'RECHAZADO'])
    );
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test -- --reporter=verbose 2>&1 | grep -A 5 "8-state structure"
```

Expected: FAIL — `has exactly 8 states` fails (currently 10).

- [ ] **Step 3: Update lib/constants.js**

Replace the ESTADOS, TRANSICIONES, and UMBRALES_RETRASO sections:

```js
export const ESTADOS = {
  INGRESADO:            { label: "Ingresado",             color: "blue",   icon: "📥" },
  EN_TALLER:            { label: "En Taller",             color: "purple", icon: "🚚" },
  ESPERANDO_APROBACION: { label: "Esperando Aprobación",  color: "orange", icon: "📞" },
  RECHAZADO:            { label: "Rechazado",             color: "red",    icon: "✗"  },
  EN_REPARACION:        { label: "En Reparación",         color: "indigo", icon: "🔧" },
  LISTO_EN_TALLER:      { label: "Listo en Taller",       color: "teal",   icon: "✓"  },
  LISTO_PARA_RETIRO:    { label: "Listo para Retiro",     color: "green",  icon: "🎉" },
  ENTREGADO:            { label: "Entregado",             color: "gray",   icon: "✅" },
};

export const TRANSICIONES = {
  INGRESADO:            ["EN_TALLER", "EN_REPARACION"],
  EN_TALLER:            ["ESPERANDO_APROBACION"],
  ESPERANDO_APROBACION: ["LISTO_EN_TALLER", "RECHAZADO"],
  RECHAZADO:            ["LISTO_PARA_RETIRO"],
  EN_REPARACION:        ["LISTO_PARA_RETIRO"],
  LISTO_EN_TALLER:      ["LISTO_PARA_RETIRO"],
  LISTO_PARA_RETIRO:    ["ENTREGADO"],
  ENTREGADO:            [],
};

export const UMBRALES_RETRASO = {
  INGRESADO:            { leve: 2,  grave: 5  },
  EN_TALLER:            { leve: 7,  grave: 14 },
  ESPERANDO_APROBACION: { leve: 1,  grave: 3  },
  EN_REPARACION:        { leve: 3,  grave: 7  },
  LISTO_EN_TALLER:      { leve: 1,  grave: 3  },
  LISTO_PARA_RETIRO:    { leve: 3,  grave: 7  },
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test -- --reporter=verbose 2>&1 | grep -A 5 "8-state structure"
```

Expected: PASS — all 5 assertions green.

- [ ] **Step 5: Commit**

```bash
git add lib/constants.js __tests__/constants.test.js
git commit -m "feat: simplify constants to 8 states, rename EN_TALLER"
```

---

### Task 3: Update Data Layer

**Files:**
- Modify: `lib/data.js`

- [ ] **Step 1: Fix asignarTaller state name**

Find this line in `asignarTaller`:
```js
return cambiarEstado(orden_id, "ENVIADO_A_TALLER", { taller_id });
```
Change to:
```js
return cambiarEstado(orden_id, "EN_TALLER", { taller_id });
```

- [ ] **Step 2: Fix getStats enTaller filter**

Find the `enTaller` filter in `getStats`:
```js
enTaller: data.filter((o) =>
  ["ENVIADO_A_TALLER", "EN_REPARACION", "LISTO_EN_TALLER"].includes(o.estado)
).length,
```
Change to:
```js
enTaller: data.filter((o) =>
  ["EN_TALLER", "EN_REPARACION", "LISTO_EN_TALLER"].includes(o.estado)
).length,
```

- [ ] **Step 3: Add monto_presupuesto to crearOrden**

Find `crearOrden` function and update the insert to accept and pass `monto_presupuesto`:

```js
export async function crearOrden({
  cliente_id,
  tipo_articulo,
  nombre_articulo,
  marca,
  modelo,
  problema_reportado,
  notas_internas,
  monto_presupuesto,
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ordenes")
    .insert({
      cliente_id,
      tipo_articulo,
      nombre_articulo,
      marca,
      modelo,
      problema_reportado,
      notas_internas,
      monto_presupuesto: monto_presupuesto || null,
      estado: "INGRESADO",
    })
    .select()
    .single();
  if (error) throw error;
  await triggerNotification(data.id, "ORDEN_CREADA");
  return data;
}
```

Note: `nombre_articulo` is used when `tipo_articulo === 'OTRO'`. Check if the column exists in schema; if not, it may be stored in `modelo` or `notas_internas` — adjust accordingly after reading schema.

- [ ] **Step 4: Add talleres CRUD functions**

Append these functions to `lib/data.js`:

```js
// ─── Talleres ──────────────────────────────────────────────────────────────

export async function crearTaller({ nombre, telefono, email, direccion }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("talleres")
    .insert({ nombre, telefono, email, direccion })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTaller(id, { nombre, telefono, email, direccion }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("talleres")
    .update({ nombre, telefono, email, direccion })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTaller(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("talleres").delete().eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: All existing tests still pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add lib/data.js
git commit -m "feat: fix EN_TALLER refs in data layer, add budget param, add talleres CRUD"
```

---

### Task 4: Fix DetalleOrdenModal

**Files:**
- Modify: `components/DetalleOrdenModal.js`

- [ ] **Step 1: Find and fix the EN_TALLER string reference**

Search for `"ENVIADO_A_TALLER"` in DetalleOrdenModal.js. There should be a conditional like:
```js
if (nuevoEstado === "ENVIADO_A_TALLER") {
```

Change every occurrence to `"EN_TALLER"`:
```js
if (nuevoEstado === "EN_TALLER") {
```

- [ ] **Step 2: Verify taller selector still shows correctly**

The taller selector (shown when transitioning to EN_TALLER) depends on this string comparison. After the change, clicking "En Taller" transition button should still show the taller dropdown.

- [ ] **Step 3: Run tests**

```bash
npm run test 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/DetalleOrdenModal.js
git commit -m "fix: update EN_TALLER string reference in DetalleOrdenModal"
```

---

### Task 5: NuevoIngresoModal — "Otro" Input + Budget Field

**Files:**
- Modify: `components/NuevoIngresoModal.js`

- [ ] **Step 1: Add nombre_articulo and monto_presupuesto to form state**

Find the initial form state object (likely in `useState`). Add two new fields:

```js
const [form, setForm] = useState({
  tipo_articulo: "",
  nombre_articulo: "",      // NEW: used when tipo_articulo === "OTRO"
  marca: "",
  modelo: "",
  problema_reportado: "",
  notas_internas: "",
  monto_presupuesto: "",    // NEW: optional budget at ingreso
});
```

- [ ] **Step 2: Add "Otro" conditional text input after tipo_articulo pills**

Find where `tipo_articulo` pill buttons are rendered. Immediately after the pill buttons block, add:

```jsx
{form.tipo_articulo === "OTRO" && (
  <div className="mt-3">
    <label className="block text-sm font-medium text-gray-700 mb-1">
      ¿Qué tipo de artículo es?
    </label>
    <input
      type="text"
      value={form.nombre_articulo}
      onChange={(e) => setForm({ ...form, nombre_articulo: e.target.value })}
      placeholder="Ej: Consola de videojuegos, Impresora..."
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      autoFocus
    />
  </div>
)}
```

- [ ] **Step 3: Add optional budget field (on step 2 after tipo_articulo section)**

After the tipo_articulo section (and the "Otro" conditional), add:

```jsx
<div className="mt-4">
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Presupuesto (opcional)
  </label>
  <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
    <input
      type="number"
      min="0"
      step="0.01"
      value={form.monto_presupuesto}
      onChange={(e) => setForm({ ...form, monto_presupuesto: e.target.value })}
      placeholder="0.00"
      className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </div>
  <p className="text-xs text-gray-400 mt-1">
    Completá si ya tenés el monto. Podés dejarlo vacío y cargarlo después.
  </p>
</div>
```

- [ ] **Step 4: Pass new fields to crearOrden**

Find the form submission call to `crearOrden`. Update it to pass the new fields:

```js
await crearOrden({
  cliente_id: clienteSeleccionado.id,
  tipo_articulo: form.tipo_articulo,
  nombre_articulo: form.tipo_articulo === "OTRO" ? form.nombre_articulo : null,
  marca: form.marca,
  modelo: form.modelo,
  problema_reportado: form.problema_reportado,
  notas_internas: form.notas_internas,
  monto_presupuesto: form.monto_presupuesto ? parseFloat(form.monto_presupuesto) : null,
});
```

- [ ] **Step 5: Add "OTRO" validation if nombre_articulo is empty**

In the form validation (before submit), add:

```js
if (form.tipo_articulo === "OTRO" && !form.nombre_articulo.trim()) {
  setError("Por favor especificá el tipo de artículo.");
  return;
}
```

- [ ] **Step 6: Check schema for nombre_articulo column**

Read `supabase/001_schema.sql` to confirm `nombre_articulo` column exists on `ordenes` table. If it doesn't exist, add it to the migration file (Task 1) or create a new migration `supabase/005_add_nombre_articulo.sql`:

```sql
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS nombre_articulo TEXT;
```

- [ ] **Step 7: Run tests**

```bash
npm run test 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add components/NuevoIngresoModal.js
git commit -m "feat: add Otro text input and optional budget field on ingreso"
```

---

### Task 6: Admin — Talleres CRUD Page

**Files:**
- Create: `app/admin/talleres/page.js`
- Modify: `app/admin/layout.js`

- [ ] **Step 1: Create talleres admin page following tipos-servicio pattern**

```js
// app/admin/talleres/page.js
"use client";
import { useState, useEffect } from "react";
import {
  getTalleres,
  crearTaller,
  updateTaller,
  deleteTaller,
} from "@/lib/data";

export default function TalleresPage() {
  const [talleres, setTalleres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ nombre: "", telefono: "", email: "", direccion: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const data = await getTalleres();
      setTalleres(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ nombre: "", telefono: "", email: "", direccion: "" });
    setShowForm(true);
  }

  function openEdit(taller) {
    setEditingId(taller.id);
    setForm({
      nombre: taller.nombre || "",
      telefono: taller.telefono || "",
      email: taller.email || "",
      direccion: taller.direccion || "",
    });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateTaller(editingId, form);
      } else {
        await crearTaller(form);
      }
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este taller? Esta acción no se puede deshacer.")) return;
    try {
      await deleteTaller(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <p className="p-6 text-gray-500">Cargando talleres...</p>;

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Talleres</h1>
        <button
          onClick={openCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Nuevo taller
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">
            {editingId ? "Editar taller" : "Nuevo taller"}
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input
                type="text"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
            <input
              type="text"
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear taller"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {talleres.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🏪</p>
          <p className="font-medium">No hay talleres registrados</p>
          <p className="text-sm mt-1">Agregá el primero con el botón de arriba.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {talleres.map((taller) => (
            <div
              key={taller.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between"
            >
              <div>
                <p className="font-semibold text-gray-900">{taller.nombre}</p>
                <div className="text-sm text-gray-500 mt-1 space-y-0.5">
                  {taller.telefono && <p>📞 {taller.telefono}</p>}
                  {taller.email && <p>✉️ {taller.email}</p>}
                  {taller.direccion && <p>📍 {taller.direccion}</p>}
                </div>
              </div>
              <div className="flex gap-2 ml-4 shrink-0">
                <button
                  onClick={() => openEdit(taller)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(taller.id)}
                  className="text-sm text-red-500 hover:text-red-700 font-medium"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add Talleres tab to admin layout**

Read `app/admin/layout.js`. Find the nav links array. Add a Talleres link following the same pattern as existing tabs:

```jsx
{ href: "/admin/talleres", label: "Talleres" }
```

Or if inline, add alongside existing links:
```jsx
<Link
  href="/admin/talleres"
  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
    pathname === "/admin/talleres"
      ? "bg-blue-600 text-white"
      : "text-gray-600 hover:bg-gray-100"
  }`}
>
  Talleres
</Link>
```

- [ ] **Step 3: Run tests**

```bash
npm run test 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/admin/talleres/page.js app/admin/layout.js
git commit -m "feat: add Talleres CRUD admin page"
```

---

### Task 7: Schema Check — nombre_articulo Column

**Files:**
- Possibly modify: `supabase/004_state_simplification.sql` or create `supabase/005_add_nombre_articulo.sql`

- [ ] **Step 1: Check if nombre_articulo exists in schema**

```bash
grep -n "nombre_articulo" supabase/001_schema.sql
```

- [ ] **Step 2: If column missing, create migration**

If the grep returns no results, create:

```sql
-- supabase/005_add_nombre_articulo.sql
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS nombre_articulo TEXT;
-- Used when tipo_articulo = 'OTRO' to store the custom article description
```

Apply it:
```bash
supabase db push
# OR run via Supabase MCP / dashboard SQL editor
```

- [ ] **Step 3: Commit if migration was needed**

```bash
git add supabase/005_add_nombre_articulo.sql
git commit -m "feat: add nombre_articulo column to ordenes"
```

---

## Self-Review

**Spec coverage:**
- ✅ "Otro" tipo_articulo text input → Task 5 Step 2
- ✅ Optional budget at ingreso → Task 5 Steps 3-4
- ✅ Talleres admin CRUD → Tasks 6
- ✅ 8-state simplification → Tasks 1, 2, 3, 4
- ✅ EN_TALLER rename → Tasks 1, 2, 3, 4
- ✅ ESPERANDO_PRESUPUESTO + PRESUPUESTO_RECIBIDO removed → Tasks 1, 2

**Placeholder scan:** None — all steps have exact code.

**Type consistency:** `crearTaller/updateTaller/deleteTaller` defined in Task 3, imported in Task 6. `nombre_articulo` and `monto_presupuesto` parameters consistent across Tasks 3 and 5.

**Order dependency:** Task 1 (DB) must run before app is deployed. Tasks 2-7 are independent of each other after Task 1.
