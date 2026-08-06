# Diseño: Reimpresión de ticket de ingreso

**Fecha:** 2026-08-06  
**Estado:** Aprobado

## Problema

Al crear una orden se genera automáticamente un ticket PDF térmico (80mm). Si el usuario cierra la ventana por error o necesita una copia extra, no hay forma de volver a imprimirlo sin crear una nueva orden falsa.

## Solución

Agregar un botón "🖨️ Reimprimir ticket" en el modal de detalle de orden (`DetalleOrdenModal`) que invoca la misma función `generarTicketIngreso()` ya existente en `lib/ticket.js`.

## Alcance

- **Archivo modificado:** `components/DetalleOrdenModal.js` (único cambio)
- **Sin cambios en:** backend, base de datos, `lib/ticket.js`, API routes

## Diseño técnico

### Nuevo handler

```js
async function handleReimprimir() {
  const res = await fetch("/api/configuracion")
  const config = await res.json()
  const nombreNegocio = config.nombre_negocio || "RepairTrack"
  const cliente = { nombre: orden.cliente_nombre, telefono: orden.cliente_telefono }
  generarTicketIngreso(orden, cliente, nombreNegocio)
}
```

- Fetch a `/api/configuracion` solo cuando el usuario hace clic (lazy)
- `cliente_nombre` y `cliente_telefono` ya están disponibles en el objeto `orden` del modal (vienen de `v_ordenes_dashboard`)
- Llama a `generarTicketIngreso()` — abre nueva pestaña con PDF y dispara diálogo de impresión

### Botón en UI

- **Ubicación:** sección inferior del modal, junto al botón de eliminar orden
- **Texto:** `🖨️ Reimprimir ticket`
- **Estados:** disponible en todos los estados de la orden
- **Import a agregar:** `generarTicketIngreso` desde `lib/ticket.js`

## Comportamiento esperado

1. Usuario abre una orden existente en el modal de detalle
2. Hace clic en "🖨️ Reimprimir ticket"
3. Se fetcha el nombre del negocio desde config
4. Se abre una nueva pestaña con el PDF de 2 páginas (copia joyería + copia cliente)
5. El navegador dispara el diálogo de impresión automáticamente
