# Checkbox "Trasladar a Punta Carretas" desde Nuevo Centro

**Fecha:** 2026-04-15
**Alcance:** Permitir a empleadas de Nuevo Centro iniciar un traslado a Punta Carretas al crear una orden.

---

## Problema

Nuevo Centro es un centro de reparación (`es_centro_reparacion = true`), por lo que la lógica de auto-traslado no se activa al crear órdenes desde ahí. Pero Nuevo Centro no repara todo — algunas órdenes necesitan ir a Punta Carretas. Actualmente no hay forma de iniciar ese traslado desde el formulario de nueva orden.

## Diseño

**UI:** Checkbox "Trasladar a Punta Carretas" en el formulario de nueva orden (NuevoIngresoModal).

**Visibilidad:** Solo aparece cuando:
- La sucursal del usuario es un centro de reparación
- Existen otros centros de reparación (en la práctica: el usuario está en Nuevo Centro y Punta Carretas existe)

**Comportamiento:** Si está marcado, después de crear la orden se crea un traslado de tipo "ida" con destino Punta Carretas (el primer centro de reparación que no sea la sucursal actual).

**No requiere columna en DB.** Es un flag local del formulario que condiciona la creación del traslado.

## Implementación

**`lib/data.js` — `crearOrden()`:**
- Nuevo parámetro `forzar_traslado_a` (UUID de sucursal destino, o null).
- Si `forzar_traslado_a` tiene valor, crear traslado ida independientemente de si la sucursal es centro o no.
- La lógica existente de auto-traslado para sucursales no-centro sigue igual.

**`components/NuevoIngresoModal.js`:**
- Cargar centros de reparación (reusar `getCentrosReparacion` de `lib/traslados.js`).
- Si la sucursal del usuario es centro y hay otros centros, mostrar checkbox.
- El label muestra el nombre del centro destino (ej: "Trasladar a Punta Carretas").
- Al submit, pasar `forzar_traslado_a: centroDestino.id` si está marcado.

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `lib/data.js` | Aceptar `forzar_traslado_a` en `crearOrden()`, crear traslado si tiene valor |
| `components/NuevoIngresoModal.js` | Checkbox condicional, cargar centros, pasar flag al submit |

## Fuera de alcance

- Selector de destino múltiple (destino es siempre el otro centro disponible).
- Traslado manual post-creación desde detalle de orden.
