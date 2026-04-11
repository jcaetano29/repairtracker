# Pipeline Fix + Columna Ubicación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir las transiciones del pipeline de órdenes para requerir aprobación de presupuesto antes de iniciar reparación, agregar acciones explícitas Aprobar/Rechazar, y mostrar la ubicación real (taller externo o sucursal local) en tabla y kanban.

**Architecture:** Cambios en cuatro archivos sin migraciones de DB. La lógica de transiciones vive en `lib/constants.js` (objeto TRANSICIONES). Las acciones de negocio viven en `lib/data.js`. La UI de aprobación se maneja en `components/DetalleOrdenModal.js`. La columna Ubicación se actualiza en `app/page.js`.

**Tech Stack:** Next.js 14, Supabase, Vitest (tests con `npx vitest run`)

---

## Archivos

| Acción | Archivo | Responsabilidad |
|---|---|---|
| Modify | `lib/constants.js` | Corregir TRANSICIONES |
| Modify | `lib/data.js` | Agregar aprobarPresupuesto / rechazarPresupuesto |
| Modify | `components/DetalleOrdenModal.js` | UI Aprobar/Rechazar para ESPERANDO_APROBACION |
| Modify | `app/page.js` | Columna Ubicación en tabla y kanban |
| Modify | `__tests__/constants.test.js` | Actualizar tests de transiciones al flujo correcto |

---

## Task 1: Corregir TRANSICIONES y actualizar tests

**Files:**
- Modify: `lib/constants.js`
- Modify: `__tests__/constants.test.js`

- [ ] **Step 1: Actualizar los tests de transiciones para reflejar el flujo correcto**

En `__tests__/constants.test.js`, reemplazar el bloque `describe('8-state structure', ...)` (líneas 85–113) con:

```js
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

  it('INGRESADO transitions to EN_TALLER and ESPERANDO_APROBACION, not EN_REPARACION', () => {
    expect(TRANSICIONES.INGRESADO).toContain('EN_TALLER');
    expect(TRANSICIONES.INGRESADO).toContain('ESPERANDO_APROBACION');
    expect(TRANSICIONES.INGRESADO).not.toContain('EN_REPARACION');
  });

  it('ESPERANDO_APROBACION transitions to EN_REPARACION and RECHAZADO, not LISTO_EN_TALLER', () => {
    expect(TRANSICIONES.ESPERANDO_APROBACION).toContain('EN_REPARACION');
    expect(TRANSICIONES.ESPERANDO_APROBACION).toContain('RECHAZADO');
    expect(TRANSICIONES.ESPERANDO_APROBACION).not.toContain('LISTO_EN_TALLER');
  });

  it('EN_REPARACION transitions to LISTO_EN_TALLER and LISTO_PARA_RETIRO', () => {
    expect(TRANSICIONES.EN_REPARACION).toContain('LISTO_EN_TALLER');
    expect(TRANSICIONES.EN_REPARACION).toContain('LISTO_PARA_RETIRO');
  });

  it('every state except ENTREGADO has at least one transition', () => {
    Object.entries(TRANSICIONES).forEach(([estado, siguientes]) => {
      if (estado === 'ENTREGADO') {
        expect(siguientes).toHaveLength(0);
      } else {
        expect(siguientes.length).toBeGreaterThan(0);
      }
    });
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
npx vitest run __tests__/constants.test.js
```

Esperado: FAIL en los tests de transiciones (los tests nuevos fallan porque el código todavía tiene las transiciones viejas).

- [ ] **Step 3: Corregir TRANSICIONES en `lib/constants.js`**

Reemplazar el bloque `export const TRANSICIONES` (líneas 17–26) con:

```js
// Transiciones permitidas
export const TRANSICIONES = {
  INGRESADO:            ["EN_TALLER", "ESPERANDO_APROBACION"],
  EN_TALLER:            ["ESPERANDO_APROBACION"],
  ESPERANDO_APROBACION: ["EN_REPARACION", "RECHAZADO"],
  RECHAZADO:            ["LISTO_PARA_RETIRO"],
  EN_REPARACION:        ["LISTO_EN_TALLER", "LISTO_PARA_RETIRO"],
  LISTO_EN_TALLER:      ["LISTO_PARA_RETIRO"],
  LISTO_PARA_RETIRO:    ["ENTREGADO"],
  ENTREGADO:            [],
};
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

```bash
npx vitest run __tests__/constants.test.js
```

Esperado: PASS en todos los tests.

- [ ] **Step 5: Correr suite completa para detectar regresiones**

```bash
npx vitest run
```

Esperado: PASS en todos los tests. Si algún test falla por los cambios de transición, actualizar ese test para reflejar el flujo correcto.

- [ ] **Step 6: Commit**

```bash
git add lib/constants.js __tests__/constants.test.js
git commit -m "fix: corregir transiciones del pipeline — requerir presupuesto antes de reparacion"
```

---

## Task 2: Agregar aprobarPresupuesto y rechazarPresupuesto en data.js

**Files:**
- Modify: `lib/data.js`

- [ ] **Step 1: Agregar las dos funciones después de `registrarPresupuesto` (línea 148)**

En `lib/data.js`, luego de la función `registrarPresupuesto`, agregar:

```js
export async function aprobarPresupuesto(orden_id) {
  return cambiarEstado(orden_id, "EN_REPARACION", { presupuesto_aprobado: true });
}

export async function rechazarPresupuesto(orden_id) {
  return cambiarEstado(orden_id, "RECHAZADO", { presupuesto_aprobado: false });
}
```

- [ ] **Step 2: Correr los tests para verificar que no hay regresiones**

```bash
npx vitest run
```

Esperado: PASS en todos los tests.

- [ ] **Step 3: Commit**

```bash
git add lib/data.js
git commit -m "feat: agregar aprobarPresupuesto y rechazarPresupuesto"
```

---

## Task 3: UI Aprobar/Rechazar en DetalleOrdenModal

**Files:**
- Modify: `components/DetalleOrdenModal.js`

- [ ] **Step 1: Agregar el import de las nuevas funciones**

En `components/DetalleOrdenModal.js`, línea 6, agregar `aprobarPresupuesto` y `rechazarPresupuesto` al import de `@/lib/data`:

```js
import { cambiarEstado, asignarTaller, registrarPresupuesto, entregarAlCliente, getHistorial, getTalleres, deleteOrden, aprobarPresupuesto, rechazarPresupuesto } from "@/lib/data";
```

- [ ] **Step 2: Agregar handlers de aprobación y rechazo**

En `components/DetalleOrdenModal.js`, después de `handlePresupuesto` (línea 94), agregar:

```js
async function handleAprobar() {
  setLoading(true);
  setError(null);
  try {
    await aprobarPresupuesto(orden.id);
    onUpdated();
    onClose();
  } catch (e) {
    setError(e.message);
  } finally {
    setLoading(false);
  }
}

async function handleRechazar() {
  setLoading(true);
  setError(null);
  try {
    await rechazarPresupuesto(orden.id);
    onUpdated();
    onClose();
  } catch (e) {
    setError(e.message);
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 3: Reemplazar la sección de Transiciones para manejar ESPERANDO_APROBACION distinto**

En `components/DetalleOrdenModal.js`, reemplazar el bloque `{/* Transiciones */}` (líneas 282–309) con:

```jsx
{/* Aprobar / Rechazar presupuesto */}
{orden.estado === "ESPERANDO_APROBACION" && !showAsignar && !showPresupuesto && !showEntrega && (
  <div>
    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
      Decisión del presupuesto
    </div>
    <div className="flex flex-wrap gap-2">
      <button
        onClick={handleAprobar}
        disabled={loading}
        className="px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors hover:opacity-80 disabled:opacity-50"
        style={{ borderColor: "#3b82f6", backgroundColor: "#eff6ff", color: "#3b82f6" }}
      >
        ✓ Aprobar presupuesto
      </button>
      <button
        onClick={handleRechazar}
        disabled={loading}
        className="px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors hover:opacity-80 disabled:opacity-50"
        style={{ borderColor: "#ef4444", backgroundColor: "#fef2f2", color: "#ef4444" }}
      >
        ✗ Rechazar
      </button>
    </div>
  </div>
)}

{/* Transiciones genéricas (todos los estados excepto ESPERANDO_APROBACION) */}
{orden.estado !== "ESPERANDO_APROBACION" && siguientes.length > 0 && !showAsignar && !showPresupuesto && !showEntrega && (
  <div>
    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
      Cambiar estado
    </div>
    <div className="flex flex-wrap gap-2">
      {siguientes.map((s) => {
        const next = ESTADOS[s];
        return (
          <button
            key={s}
            onClick={() => handleCambiarEstado(s)}
            disabled={loading}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors hover:opacity-80 disabled:opacity-50"
            style={{
              borderColor: next.color,
              backgroundColor: next.bg,
              color: next.color,
            }}
          >
            {next.icon} {next.label}
          </button>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 4: Correr los tests para verificar que no hay regresiones**

```bash
npx vitest run
```

Esperado: PASS en todos los tests.

- [ ] **Step 5: Commit**

```bash
git add components/DetalleOrdenModal.js
git commit -m "feat: agregar botones Aprobar/Rechazar presupuesto en modal de orden"
```

---

## Task 4: Columna Ubicación en tabla y kanban

**Files:**
- Modify: `app/page.js`

La vista `v_ordenes_dashboard` ya incluye `sucursal_nombre`. La lógica de display es:
- Si `taller_nombre` existe → `📍 taller_nombre` (taller externo)
- Si no → `🏠 sucursal_nombre` (en el local)

- [ ] **Step 1: Actualizar el encabezado de la columna en la tabla**

En `app/page.js`, en el array de encabezados de la tabla (línea 246), reemplazar `"Taller"` por `"Ubicación"`:

```jsx
{["Orden", "Cliente", "Artículo", "Estado", "Ubicación", "Monto", "Días", ""].map(
```

- [ ] **Step 2: Actualizar la celda de la tabla**

Reemplazar la celda de taller (línea 287):

```jsx
// Antes:
<td className="px-4 py-3 text-xs text-slate-600">{o.taller_nombre || "—"}</td>

// Después:
<td className="px-4 py-3 text-xs text-slate-600">
  {o.taller_nombre
    ? <span className="text-purple-600">📍 {o.taller_nombre}</span>
    : <span className="text-slate-500">🏠 {o.sucursal_nombre}</span>
  }
</td>
```

- [ ] **Step 3: Actualizar la kanban card**

En `app/page.js`, dentro del kanban card (línea 414), reemplazar el bloque de taller:

```jsx
// Antes:
{o.taller_nombre && (
  <div className="text-[10px] text-purple-600 mt-1">
    📍 {o.taller_nombre}
  </div>
)}

// Después:
<div className="text-[10px] mt-1">
  {o.taller_nombre
    ? <span className="text-purple-600">📍 {o.taller_nombre}</span>
    : <span className="text-slate-400">🏠 {o.sucursal_nombre}</span>
  }
</div>
```

- [ ] **Step 4: Correr los tests para verificar que no hay regresiones**

```bash
npx vitest run
```

Esperado: PASS en todos los tests.

- [ ] **Step 5: Commit**

```bash
git add app/page.js
git commit -m "feat: columna Ubicacion muestra sucursal o taller externo en tabla y kanban"
```

---

## Self-Review

**Spec coverage:**
- ✅ TRANSICIONES corregidas (Task 1)
- ✅ `aprobarPresupuesto` / `rechazarPresupuesto` en data.js (Task 2)
- ✅ `presupuesto_aprobado` seteado a true/false en aprobación/rechazo (Task 2 via cambiarEstado extras)
- ✅ Botones Aprobar/Rechazar en DetalleOrdenModal (Task 3)
- ✅ Botones genéricos suprimidos para ESPERANDO_APROBACION (Task 3)
- ✅ Columna Ubicación en tabla (Task 4)
- ✅ Columna Ubicación en kanban (Task 4)
- ✅ Tests actualizados (Task 1)

**Placeholders:** Ninguno.

**Type consistency:** `aprobarPresupuesto(orden_id)` y `rechazarPresupuesto(orden_id)` definidos en Task 2, importados en Task 3. Consistente.
