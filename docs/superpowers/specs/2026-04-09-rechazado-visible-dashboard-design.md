# Diseño: Órdenes RECHAZADO siempre visibles en el dashboard

**Fecha:** 2026-04-09  
**Estado:** Aprobado  
**Archivos afectados:** `lib/data.js`, `app/page.js`

---

## Resumen

Las órdenes con estado `RECHAZADO` deben aparecer siempre en el dashboard (tabla y kanban), junto con las demás órdenes activas. El usuario también puede filtrar específicamente por este estado. Actualmente están excluidas hard-coded de la query y del tablero kanban.

---

## Cambios

### 1. `lib/data.js` — Eliminar exclusión hard-coded de RECHAZADO

**Eliminar** el siguiente bloque (líneas 34–36):

```js
if (estado !== "RECHAZADO") {
  query = query.neq("estado", "RECHAZADO");
}
```

Con este cambio, RECHAZADO se incluye en todos los resultados igual que cualquier otro estado activo. El filtrado específico por estado sigue funcionando correctamente gracias al bloque existente:

```js
if (estado && estado !== "TODOS") {
  query = query.eq("estado", estado);
}
```

### 2. `app/page.js` — Incluir RECHAZADO en estadosActivos (kanban)

**Cambiar** línea 84:

```js
// Antes
const estadosActivos = Object.entries(ESTADOS).filter(([k]) => k !== "ENTREGADO" && k !== "RECHAZADO")

// Después
const estadosActivos = Object.entries(ESTADOS).filter(([k]) => k !== "ENTREGADO")
```

---

## Comportamiento resultante

| Vista | Comportamiento |
|-------|----------------|
| **Tabla** | RECHAZADO aparece mezclado con las otras órdenes. Badge rojo existente (`✗ Rechazado`). |
| **Kanban** | Columna RECHAZADO aparece al final del tablero cuando hay órdenes rechazadas. Se oculta automáticamente si está vacía (comportamiento heredado del código existente). |
| **Filtro de estado** | "RECHAZADO" ya existe en el dropdown — sigue funcionando. Al seleccionarlo muestra solo las rechazadas. |
| **"Todos los estados"** | Ahora incluye órdenes RECHAZADO. |

---

## Lo que NO cambia

- `Badge.js` — ya tiene estilos para RECHAZADO (rojo `#ef4444`, fondo `#fef2f2`, ícono `✗`)
- `lib/constants.js` — RECHAZADO ya está definido en `ESTADOS` y `TRANSICIONES`
- API routes — sin cambios
- Lógica de ENTREGADO — no se toca

---

## Casos borde

| Caso | Comportamiento |
|------|----------------|
| No hay órdenes rechazadas | Columna kanban oculta, no aparece en tabla. Todo normal. |
| Usuario filtra por otro estado (ej: INGRESADO) | Solo ve INGRESADO, RECHAZADO no aparece (filtro específico por estado funciona). |
| Usuario filtra por RECHAZADO | Solo ve RECHAZADO. |
| Usuario selecciona "Todos los estados" | Ve todas las órdenes incluyendo RECHAZADO. |
