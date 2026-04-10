# Órdenes RECHAZADO Visibles en Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que las órdenes con estado RECHAZADO aparezcan siempre en el dashboard (tabla y kanban), junto con las demás órdenes activas.

**Architecture:** Dos cambios quirúrgicos: eliminar el bloque que excluye RECHAZADO hard-coded en la query de `lib/data.js`, y quitar el filtro que lo excluye de las columnas kanban en `app/page.js`. Sin nuevos parámetros, sin nuevos componentes.

**Tech Stack:** Next.js 14, Supabase (`@supabase/supabase-js`), React 18, Tailwind CSS

---

## File Map

| Acción | Archivo |
|--------|---------|
| Modificar | `lib/data.js` |
| Modificar | `app/page.js` |

---

### Task 1: Eliminar exclusión de RECHAZADO en la query

**Files:**
- Modify: `lib/data.js`

- [ ] **Step 1: Leer el archivo para ubicar el bloque exacto**

Leer `lib/data.js` y ubicar el bloque en `getOrdenes` que dice:

```js
if (estado !== "RECHAZADO") {
  query = query.neq("estado", "RECHAZADO");
}
```

Está alrededor de las líneas 34–36.

- [ ] **Step 2: Eliminar el bloque**

El resultado en esa zona del archivo debe quedar así (sin el bloque RECHAZADO):

```js
  if (!incluirEntregados && estado !== "ENTREGADO") {
    query = query.neq("estado", "ENTREGADO");
  }

  if (estado && estado !== "TODOS") {
    query = query.eq("estado", estado);
  }
```

- [ ] **Step 3: Correr los tests existentes**

```bash
cd /c/Users/Max/Desktop/PROJECTS/repairtracker && npm test
```

Esperado: 25 tests passing.

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker add lib/data.js
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker commit -m "feat: include RECHAZADO orders in dashboard query"
```

---

### Task 2: Incluir RECHAZADO en columnas del kanban

**Files:**
- Modify: `app/page.js`

- [ ] **Step 1: Leer el archivo para ubicar la línea exacta**

Leer `app/page.js` y ubicar la línea con `estadosActivos`:

```js
const estadosActivos = Object.entries(ESTADOS).filter(([k]) => k !== "ENTREGADO" && k !== "RECHAZADO")
```

Está alrededor de la línea 84.

- [ ] **Step 2: Modificar la línea**

Cambiar a:

```js
const estadosActivos = Object.entries(ESTADOS).filter(([k]) => k !== "ENTREGADO")
```

- [ ] **Step 3: Correr los tests**

```bash
cd /c/Users/Max/Desktop/PROJECTS/repairtracker && npm test
```

Esperado: 25 tests passing.

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker add app/page.js
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker commit -m "feat: show RECHAZADO column in kanban dashboard"
```

---

## Verificación Manual

Después de los 2 tasks, verificar en el navegador (`npm run dev`):

| Escenario | Resultado esperado |
|-----------|-------------------|
| Dashboard con órdenes rechazadas existentes | Aparecen en la tabla con badge rojo "✗ Rechazado" |
| Vista kanban con órdenes rechazadas | Columna "RECHAZADO" aparece al final del tablero |
| Vista kanban sin órdenes rechazadas | Columna "RECHAZADO" no aparece (columna vacía se oculta) |
| Filtro "Todos los estados" | Incluye órdenes rechazadas |
| Filtro "RECHAZADO" | Muestra solo las rechazadas |
| Filtro otro estado (ej: "INGRESADO") | No muestra rechazadas |
