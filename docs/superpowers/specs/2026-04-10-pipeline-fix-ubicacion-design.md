# Pipeline Fix + Columna Ubicación — Design Doc

**Fecha:** 2026-04-10  
**Estado:** Aprobado

---

## Contexto

RepairTrack tiene dos flujos legítimos de reparación:

1. **Taller externo:** el artículo se envía a un taller tercero para presupuesto y reparación.
2. **Local (en el local):** el artículo se presupuesta y repara en la propia sucursal.

El pipeline actual tiene tres inconsistencias que permiten saltear el flujo de presupuesto:

| Problema | Ubicación | Impacto |
|---|---|---|
| `INGRESADO → EN_REPARACION` permitido | `lib/constants.js` TRANSICIONES | Salta todo el flujo de aprobación |
| `ESPERANDO_APROBACION → LISTO_EN_TALLER` | `lib/constants.js` TRANSICIONES | El artículo pasa a "listo" sin repararse |
| `presupuesto_aprobado` nunca se setea | `lib/data.js` | Campo DB muerto, datos de rechazo incorrectos |

Adicionalmente, la columna "Taller" muestra "—" para órdenes en el local, perdiendo información de ubicación útil para el operador.

---

## Flujos correctos

### Flujo taller externo
```
INGRESADO → EN_TALLER → ESPERANDO_APROBACION → EN_REPARACION → LISTO_EN_TALLER → LISTO_PARA_RETIRO → ENTREGADO
```

### Flujo local (presupuesto inmediato)
```
INGRESADO → ESPERANDO_APROBACION → EN_REPARACION → LISTO_PARA_RETIRO → ENTREGADO
```

---

## Cambios de diseño

### 1. Transiciones corregidas

**Archivo:** `lib/constants.js`

```js
export const TRANSICIONES = {
  INGRESADO:            ["EN_TALLER", "ESPERANDO_APROBACION"],
  EN_TALLER:            ["ESPERANDO_APROBACION"],
  ESPERANDO_APROBACION: ["EN_REPARACION", "RECHAZADO"],
  RECHAZADO:            ["LISTO_PARA_RETIRO"],
  EN_REPARACION:        ["LISTO_EN_TALLER", "LISTO_PARA_RETIRO"],
  LISTO_EN_TALLER:      ["LISTO_PARA_RETIRO"],
  LISTO_PARA_RETIRO:    ["ENTREGADO"],
  ENTREGADO:            [],
}
```

Cambios respecto al estado actual:
- `INGRESADO`: se elimina `EN_REPARACION`, se agrega `ESPERANDO_APROBACION`
- `ESPERANDO_APROBACION`: se reemplaza `LISTO_EN_TALLER` por `EN_REPARACION`
- `EN_REPARACION`: se agrega `LISTO_EN_TALLER` (para cuando vuelve del taller externo)

### 2. Aprobar/Rechazar explícito

**Archivo:** `components/DetalleOrdenModal.js`

Cuando `orden.estado === "ESPERANDO_APROBACION"`, los botones genéricos de transición se reemplazan por dos acciones específicas:

- **✓ Aprobar presupuesto** → llama `cambiarEstado(id, "EN_REPARACION", { presupuesto_aprobado: true })`
- **✗ Rechazar presupuesto** → llama `cambiarEstado(id, "RECHAZADO", { presupuesto_aprobado: false })`

Esto activa el campo `presupuesto_aprobado` en la tabla `ordenes`, que actualmente existe en DB pero nunca se setea.

**Archivo:** `lib/data.js`

Agregar dos funciones de conveniencia:

```js
export async function aprobarPresupuesto(orden_id) {
  return cambiarEstado(orden_id, "EN_REPARACION", { presupuesto_aprobado: true })
}

export async function rechazarPresupuesto(orden_id) {
  return cambiarEstado(orden_id, "RECHAZADO", { presupuesto_aprobado: false })
}
```

### 3. Columna "Ubicación"

**Archivo:** `app/page.js`

`sucursal_nombre` ya está disponible en `v_ordenes_dashboard`. La lógica de display:

```js
const ubicacion = orden.taller_nombre ?? orden.sucursal_nombre
const ubicacionIcon = orden.taller_nombre ? "📍" : "🏠"
```

**Tabla:**
- Encabezado "Taller" → "Ubicación"
- Celda: muestra `📍 Taller X` o `🏠 Sucursal Y` en lugar de "—"

**Kanban card:**
- Reemplaza la lógica actual `{o.taller_nombre && <div>📍 {o.taller_nombre}</div>}`
- Por `{ubicacion && <div>{ubicacionIcon} {ubicacion}</div>}` (siempre visible)

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/constants.js` | TRANSICIONES corregidas (4 líneas cambian) |
| `lib/data.js` | Agregar `aprobarPresupuesto` y `rechazarPresupuesto` |
| `components/DetalleOrdenModal.js` | Lógica Aprobar/Rechazar + suprimir botones genéricos en ESPERANDO_APROBACION |
| `app/page.js` | Columna Ubicación en tabla y kanban |

Sin migraciones de DB requeridas.

---

## Lo que no cambia

- La lógica de `registrarPresupuesto` (sigue manejando `ESPERANDO_APROBACION`)
- La lógica de `asignarTaller` (sigue siendo el handler para `EN_TALLER`)
- El campo `monto_presupuesto` y su display
- El historial de estados
