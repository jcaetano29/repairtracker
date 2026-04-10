# Diseño: Paginación server-side en tabla de reparaciones

**Fecha:** 2026-04-10  
**Estado:** Aprobado  
**Archivos afectados:** `lib/data.js`, `app/page.js`

---

## Resumen

Agregar paginación server-side a la vista de tabla del dashboard. 20 órdenes por página. El total de registros se obtiene en el mismo request usando `{ count: 'exact' }` de Supabase. La UI muestra botones de página numerados (con elipsis), controles anterior/siguiente, e indicador de resultados. El kanban no cambia.

---

## Cambios en `lib/data.js` — `getOrdenes()`

### Nuevos parámetros
```js
export async function getOrdenes({ estado, taller_id, busqueda, incluirEntregados = false, sucursal_id, page = 1, limit = 20 })
```

### Modificaciones al query

1. Agregar `{ count: "exact" }` al `.select()`:
```js
let query = getSupabaseClient()
  .from("v_ordenes_dashboard")
  .select("*", { count: "exact" })
```

2. Agregar `.range()` antes del `await`:
```js
const from = (page - 1) * limit;
query = query.range(from, from + limit - 1);
```

3. Cambiar destructuring y return:
```js
const { data, count, error } = await query;
if (error) throw error;
return { data: data ?? [], count: count ?? 0 };
```

### Firma anterior vs nueva

| | Antes | Después |
|--|-------|---------|
| Retorno | `Order[]` | `{ data: Order[], count: number }` |
| Parámetros nuevos | — | `page`, `limit` |

---

## Cambios en `app/page.js`

### Nuevo estado

```js
const [pagina, setPagina] = useState(1)
const [totalOrdenes, setTotalOrdenes] = useState(0)
```

### Actualizar `loadData`

1. Pasar `page: pagina` a `getOrdenes()`:
```js
getOrdenes({
  estado: filtroEstado,
  taller_id: filtroTaller,
  busqueda: debouncedBusqueda || undefined,
  incluirEntregados: filtroEstado === "ENTREGADO",
  sucursal_id: sucursalFiltro,
  page: pagina,
  limit: 20,
})
```

2. Extraer `data` y `count` del resultado:
```js
const [{ data: ordenesData, count }, statsData, talleresData] = await Promise.all([...])
setOrdenes(ordenesData)
setTotalOrdenes(count)
```

3. Agregar `pagina` a las dependencias de `useCallback`:
```js
}, [filtroEstado, filtroTaller, debouncedBusqueda, filtroSucursal, isDueno, session, pagina])
```

### Reset de página al cambiar filtros

Agregar efectos que reseteen `pagina` a 1 cuando cambia cualquier filtro:
```js
useEffect(() => { setPagina(1) }, [filtroEstado, filtroTaller, debouncedBusqueda, filtroSucursal])
```

### UI de paginación

Debajo de la tabla (después del `</div>` que cierra el `overflow-x-auto`), solo si `vista === "tabla"` y `totalOrdenes > 20`:

```
← Anterior   1  2  3  ...  8   Siguiente →
        Mostrando 1–20 de 47 órdenes
```

**Lógica de páginas mostradas:**
- Siempre mostrar: página 1, última página, página actual, página actual ±1
- Elipsis (`...`) cuando hay salto de más de 1 entre páginas mostradas
- Ejemplo con 10 páginas, página actual = 5: `1 ... 4 5 6 ... 10`
- Ejemplo con 10 páginas, página actual = 2: `1 2 3 ... 10`

**Estilos:**
- Página actual: `bg-slate-900 text-white`
- Otras páginas: `border border-slate-200 text-slate-600 hover:bg-slate-50`
- Botones deshabilitados: `opacity-50 cursor-not-allowed`
- Texto informativo: `text-xs text-slate-400`

---

## Lo que NO cambia

- Vista kanban — sin paginación, sigue mostrando todos los resultados
- `getStats()` — sin cambios
- Cualquier otro caller de `getOrdenes()` si existiera — los parámetros nuevos tienen defaults

---

## Casos borde

| Caso | Comportamiento |
|------|----------------|
| Menos de 20 resultados | No se muestra el paginador |
| Cambio de filtro en página 3 | Reset automático a página 1 |
| Búsqueda activa | Pagina los resultados filtrados |
| Auto-refresh cada 30 segundos | Refresca la página actual (no resetea) |
| Última página con menos de 20 resultados | Muestra los que hay, indicador correcto |
