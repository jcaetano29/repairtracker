# Ticket de Ingreso — Spec de Diseño

## Resumen

Generación automática de un PDF con formato de ticket térmico (80mm de ancho) al crear cada orden. El PDF se abre en una nueva pestaña para imprimir o descargar. El nombre del negocio es configurable por el admin.

---

## Configuración

Nuevo campo `nombre_negocio` en la tabla `configuracion` existente. Valor por defecto: `"RepairTrack"`. Editable desde el panel de administración en `/admin/configuracion`.

---

## Generación del ticket

- Se dispara automáticamente al crear una orden exitosamente en `NuevoIngresoModal`
- Generación client-side con `jspdf` (librería JS ligera, sin endpoint nuevo)
- El PDF se abre en una nueva pestaña del navegador (`window.open`)
- Ancho del PDF: 80mm (tamaño estándar de impresora térmica Citizen)
- Alto: dinámico según contenido

---

## Contenido del ticket

De arriba a abajo:

1. **Nombre del negocio** — desde `configuracion.nombre_negocio`
2. **"Boleta de Ingreso"** — subtítulo fijo
3. **Nro de boleta** — `#0064` (= `numero_orden`, formateado con padStart 4)
4. **Fecha de ingreso** — formato `dd/mm/yyyy HH:mm`
5. **Separador** — línea punteada
6. **Artículo** — tipo_articulo, marca, modelo (los que apliquen)
7. **Problema reportado** — texto del problema
8. **Separador** — línea punteada
9. **Cliente** — nombre y teléfono
10. **Fecha de entrega estimada** — formato `dd/mm/yyyy` (si existe, sino "A confirmar")
11. **Separador** — línea punteada
12. **Texto de agradecimiento** — hardcodeado: "Gracias por su confianza"

No se incluyen montos ni presupuestos en el ticket de ingreso.

---

## Número de orden

Se mantiene el tipo `SERIAL` actual (integer, máximo ~2.1 mil millones). No requiere cambios.

---

## Archivos a crear/modificar

### Nuevos
- `lib/ticket.js` — función `generarTicketIngreso(orden, nombreNegocio)` que genera y abre el PDF

### Modificados
- `package.json` — agregar dependencia `jspdf`
- `components/NuevoIngresoModal.js` — después de `crearOrden` exitoso, llamar a `generarTicketIngreso`
- `app/admin/configuracion/page.js` — agregar campo editable para `nombre_negocio`
- `app/api/configuracion/route.js` — soportar `nombre_negocio` en GET/POST (si no lo soporta ya genéricamente)

---

## Fuera de alcance

- Conexión directa con impresora térmica (se hará cuando tengan la Citizen conectada)
- Reimprimir ticket desde el detalle de la orden (se puede agregar después)
- Logo/imagen en el ticket
- Código de barras o QR
