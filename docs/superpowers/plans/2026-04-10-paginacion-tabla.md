# Paginación server-side en tabla de reparaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paginar la tabla de reparaciones a 20 órdenes por página usando Supabase `.range()` con count exacto en el mismo request.

**Architecture:** `getOrdenes()` recibe `page` y `limit`, aplica `.range()` y devuelve `{ data, count }`. `app/page.js` gestiona el estado de página, resetea al cambiar filtros, y renderiza la UI de paginación debajo de la tabla. El kanban no cambia.

**Tech Stack:** Next.js 14, React 18, Supabase `@supabase/supabase-js` (`.range()`, `{ count: "exact" }`), Tailwind CSS, Vitest

---

## File Map

| Acción | Archivo |
|--------|---------|
| Modificar | `lib/data.js` |
| Modificar | `app/page.js` |
| Modificar (tests) | `__tests__/` — no hay tests para `getOrdenes`, se valida con build |

---

### Task 1: Agregar paginación a `getOrdenes` en `lib/data.js`

**Files:**
- Modify: `lib/data.js` (líneas 24–60)

- [ ] **Step 1: Leer el archivo para ubicar la función exacta**

Leer `lib/data.js` y confirmar que `getOrdenes` está en línea 24 con esta firma:

```js
export async function getOrdenes({ estado, taller_id, busqueda, incluirEntregados = false, sucursal_id }) {
```

- [ ] **Step 2: Reemplazar la función completa**

Reemplazar toda la función `getOrdenes` (líneas 24–60) con la versión paginada:

```js
export async function getOrdenes({ estado, taller_id, busqueda, incluirEntregados = false, sucursal_id, page = 1, limit = 20 }) {
  let query = getSupabaseClient()
    .from("v_ordenes_dashboard")
    .select("*", { count: "exact" })
    .order("fecha_ingreso", { ascending: false });

  // Exclude terminal/non-operational states by default unless explicitly filtering for them
  if (!incluirEntregados && estado !== "ENTREGADO") {
    query = query.neq("estado", "ENTREGADO");
  }

  if (estado && estado !== "TODOS") {
    query = query.eq("estado", estado);
  }

  if (taller_id && taller_id !== "TODOS") {
    if (taller_id === "LOCAL") {
      query = query.is("taller_id", null);
    } else {
      query = query.eq("taller_id", taller_id);
    }
  }

  if (sucursal_id && sucursal_id !== "TODAS") {
    query = query.eq("sucursal_id", sucursal_id);
  }

  if (busqueda) {
    query = query.or(
      `cliente_nombre.ilike.%${busqueda}%,marca.ilike.%${busqueda}%,cliente_telefono.ilike.%${busqueda}%`
    );
  }

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, count, error } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}
```

- [ ] **Step 3: Correr los tests para verificar que no hay regresiones**

```bash
cd /c/Users/Max/Desktop/PROJECTS/repairtracker && npm test 2>&1 | tail -10
```

Esperado: 31 tests passing. (Los tests existentes no cubren `getOrdenes` directamente — el build confirma que no hay errores de sintaxis.)

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker add lib/data.js
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker commit -m "feat: add server-side pagination to getOrdenes"
```

---

### Task 2: Actualizar `loadData` en `app/page.js` para usar paginación

**Files:**
- Modify: `app/page.js`

- [ ] **Step 1: Leer el archivo para ubicar las secciones a modificar**

Leer `app/page.js` y confirmar:
- Estado declarado alrededor de líneas 19–32
- `loadData` definido alrededor de líneas 38–60
- `useCallback` con dependencias en línea ~60

- [ ] **Step 2: Agregar nuevo estado de paginación**

Después del `const [loading, setLoading] = useState(true)` (línea ~32), agregar:

```js
const [pagina, setPagina] = useState(1)
const [totalOrdenes, setTotalOrdenes] = useState(0)
```

- [ ] **Step 3: Actualizar `loadData` — pasar page y limit, extraer count**

Dentro de `loadData`, cambiar la llamada a `getOrdenes` para incluir `page` y `limit`:

```js
// Antes
getOrdenes({
  estado: filtroEstado,
  taller_id: filtroTaller,
  busqueda: debouncedBusqueda || undefined,
  incluirEntregados: filtroEstado === "ENTREGADO",
  sucursal_id: sucursalFiltro,
}),

// Después
getOrdenes({
  estado: filtroEstado,
  taller_id: filtroTaller,
  busqueda: debouncedBusqueda || undefined,
  incluirEntregados: filtroEstado === "ENTREGADO",
  sucursal_id: sucursalFiltro,
  page: pagina,
  limit: 20,
}),
```

Cambiar la desestructuración del resultado de `Promise.all`:

```js
// Antes
const [ordenesData, statsData, talleresData] = await Promise.all([...])
setOrdenes(ordenesData)

// Después
const [{ data: ordenesData, count: ordenesCount }, statsData, talleresData] = await Promise.all([...])
setOrdenes(ordenesData)
setTotalOrdenes(ordenesCount)
```

- [ ] **Step 4: Agregar `pagina` a las dependencias de `useCallback`**

Cambiar la línea de dependencias de `useCallback`:

```js
// Antes
}, [filtroEstado, filtroTaller, debouncedBusqueda, filtroSucursal, isDueno, session])

// Después
}, [filtroEstado, filtroTaller, debouncedBusqueda, filtroSucursal, isDueno, session, pagina])
```

- [ ] **Step 5: Agregar useEffect que resetea la página al cambiar filtros**

Después del `useEffect` que llama `loadData` (alrededor de línea ~70), agregar:

```js
// Reset a página 1 cuando cambian los filtros
useEffect(() => {
  setPagina(1)
}, [filtroEstado, filtroTaller, debouncedBusqueda, filtroSucursal])
```

- [ ] **Step 6: Correr los tests**

```bash
cd /c/Users/Max/Desktop/PROJECTS/repairtracker && npm test 2>&1 | tail -10
```

Esperado: 31 tests passing.

- [ ] **Step 7: Commit**

```bash
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker add app/page.js
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker commit -m "feat: wire pagination state into loadData"
```

---

### Task 3: Agregar UI de paginación debajo de la tabla

**Files:**
- Modify: `app/page.js`

- [ ] **Step 1: Agregar la función helper para calcular páginas visibles**

Dentro del componente `DashboardPage`, antes del `return`, agregar esta función:

```js
function getPaginasVisibles(paginaActual, totalPaginas) {
  if (totalPaginas <= 7) return Array.from({ length: totalPaginas }, (_, i) => i + 1)
  const paginas = new Set([1, totalPaginas, paginaActual])
  if (paginaActual > 1) paginas.add(paginaActual - 1)
  if (paginaActual < totalPaginas) paginas.add(paginaActual + 1)
  const sorted = Array.from(paginas).sort((a, b) => a - b)
  const result = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("...")
    result.push(sorted[i])
  }
  return result
}
```

- [ ] **Step 2: Calcular totalPaginas antes del return**

Agregar antes del `return`:

```js
const totalPaginas = Math.ceil(totalOrdenes / 20)
```

- [ ] **Step 3: Agregar la UI de paginación en el JSX**

Después del bloque `{/* Vista Tabla */}` (después del `</div>` que cierra el `overflow-x-auto`, alrededor de línea ~287), agregar:

```jsx
{/* Paginación */}
{!loading && vista === "tabla" && totalPaginas > 1 && (
  <div className="mt-4 flex flex-col items-center gap-2">
    <div className="flex items-center gap-1">
      <button
        onClick={() => setPagina((p) => Math.max(1, p - 1))}
        disabled={pagina === 1}
        className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ← Anterior
      </button>

      {getPaginasVisibles(pagina, totalPaginas).map((p, i) =>
        p === "..." ? (
          <span key={`dots-${i}`} className="px-2 text-slate-400 text-xs">...</span>
        ) : (
          <button
            key={p}
            onClick={() => setPagina(p)}
            className={`w-8 h-8 text-xs font-medium rounded-lg border transition-colors ${
              p === pagina
                ? "bg-slate-900 text-white border-slate-900"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
        disabled={pagina === totalPaginas}
        className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Siguiente →
      </button>
    </div>
    <p className="text-xs text-slate-400">
      Mostrando {(pagina - 1) * 20 + 1}–{Math.min(pagina * 20, totalOrdenes)} de {totalOrdenes} órdenes
    </p>
  </div>
)}
```

- [ ] **Step 4: Correr los tests**

```bash
cd /c/Users/Max/Desktop/PROJECTS/repairtracker && npm test 2>&1 | tail -10
```

Esperado: 31 tests passing.

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker add app/page.js
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker commit -m "feat: add pagination UI below repairs table"
```

---

## Verificación Manual

Después de los 3 tasks, verificar en el navegador (`npm run dev`):

| Escenario | Resultado esperado |
|-----------|-------------------|
| Menos de 20 órdenes en total | Paginador no aparece |
| Más de 20 órdenes | Paginador aparece con botones numerados |
| Click en página 2 | Tabla muestra las siguientes 20 órdenes |
| Click en "← Anterior" en página 1 | Botón deshabilitado, no hace nada |
| Click en "Siguiente →" en última página | Botón deshabilitado, no hace nada |
| Cambiar filtro de estado | Vuelve a página 1 automáticamente |
| Cambiar búsqueda | Vuelve a página 1 automáticamente |
| Auto-refresh (30s) | Refresca la página actual sin resetear |
| Vista kanban | No muestra paginador, muestra todas las órdenes |
| Última página con < 20 resultados | Indicador muestra el número correcto (ej: "41–47 de 47") |
