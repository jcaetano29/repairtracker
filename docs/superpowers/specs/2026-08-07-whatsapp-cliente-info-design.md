# Teléfono en la lista + detalles del cliente en el chat — Spec de Diseño

## Resumen

Dos agregados chicos al inbox de WhatsApp (`app/whatsapp/page.js` / `components/WhatsAppHilo.js`), agrupados porque ambos giran en torno a mostrar más información del cliente sin pedir datos nuevos al servidor:

1. **Teléfono en la lista de chats:** cada fila muestra el número del cliente entre paréntesis junto al nombre.
2. **Detalles del cliente en el hilo:** un menú de 3 puntos en el header del chat abierto, con una opción "Ver detalles del usuario" que abre un modal de solo lectura con nombre, teléfono y email.

## Parte 1: Teléfono en la lista de chats

### Datos

`getConversaciones()` (`lib/whatsapp.js`) ya trae `telefono_e164` a nivel de la conversación. Solo falta el email del cliente para la Parte 2, así que el `select` se amplía en el mismo lugar:

```js
// antes
.select("id, cliente_id, telefono_e164, last_message_at, last_message_preview, last_incoming_message_at, last_read_at, clientes(nombre)")

// después
.select("id, cliente_id, telefono_e164, last_message_at, last_message_preview, last_incoming_message_at, last_read_at, clientes(nombre, email)")
```

No hace falta ruta nueva ni cambio en el shape de `unread` — el `.map()` que ya calcula `unread` sigue igual.

### Render (`app/whatsapp/page.js`)

La línea que hoy muestra `{c.clientes?.nombre ?? c.telefono_e164}` pasa a:

```jsx
{c.clientes?.nombre ? `${c.clientes.nombre} (${c.telefono_e164})` : c.telefono_e164}
```

Si no hay cliente vinculado a la conversación (caso borde ya contemplado por el `??` original), se sigue mostrando solo el teléfono, sin paréntesis vacíos. El teléfono se muestra tal cual está guardado en formato E.164 (ej. `+59899111222`), sin agregar formateo — no existe hoy una utilidad de formateo de teléfono para mostrar en el proyecto, y agregar una es innecesario para este alcance.

## Parte 2: Menú de 3 puntos y modal de detalles del cliente

### `WhatsAppHilo` recibe el cliente completo, no solo el nombre

Hoy `app/whatsapp/page.js` le pasa a `WhatsAppHilo` un `clienteNombre` ya resuelto:

```jsx
<WhatsAppHilo
  conversacionId={seleccionada}
  clienteNombre={conversacionActual?.clientes?.nombre ?? conversacionActual?.telefono_e164}
/>
```

Pasa a pasarle el objeto cliente completo, para que `WhatsAppHilo` tenga todo lo que necesita el modal sin pedir datos de nuevo:

```jsx
<WhatsAppHilo
  conversacionId={seleccionada}
  cliente={{
    nombre: conversacionActual?.clientes?.nombre,
    telefono: conversacionActual?.telefono_e164,
    email: conversacionActual?.clientes?.email,
  }}
/>
```

Dentro de `WhatsAppHilo`, el nombre a mostrar en el header se deriva igual que antes: `cliente?.nombre ?? cliente?.telefono`.

### Header del hilo: nombre + menú de 3 puntos

La barra oscura del header (hoy `<div className="px-4 py-3 bg-slate-800 text-white font-semibold text-sm shrink-0">{clienteNombre}</div>`) pasa a `flex items-center justify-between`, con el nombre a la izquierda y un botón `⋮` a la derecha.

El botón despliega un menú chico con una sola opción, "Ver detalles del usuario", usando el mismo patrón de cierre por click afuera / Escape que ya usa `components/PhoneInput.js` (`wrapperRef` + listener de `mousedown`/`keydown` en `document`, solo mientras el menú está abierto). Todo el estado (`menuAbierto`, `mostrarDetalle`) vive local en `WhatsAppHilo` — no se levanta a `WhatsAppPage`.

Al clickear "Ver detalles del usuario" se cierra el menú y se abre el modal.

### `DetalleClienteModal` (nuevo: `components/DetalleClienteModal.js`)

Modal de solo lectura, mismo estilo de overlay que `components/DetalleOrdenModal.js` (`fixed inset-0 bg-black/50` + click afuera cierra + botón `×`). Recibe `cliente` (`{ nombre, telefono, email }`) y `onClose`. Muestra tres filas de etiqueta/valor: Nombre, Teléfono, Email — si `email` es `null`/vacío, muestra "No especificado" en su lugar. No hay edición ni llamadas a la API: los datos ya vienen del cliente que abrió el modal.

## Fuera de alcance

- Edición de los datos del cliente desde este modal (el spec original de creación de clientes ya cubre eso en otro flujo).
- Formateo "bonito" del teléfono (espacios, guiones) — se muestra tal cual E.164.
- Más opciones en el menú de 3 puntos además de "Ver detalles del usuario" — el patrón queda listo para agregar más a futuro, pero no se agrega nada más ahora.
- Mostrar el documento del cliente u otros campos de `clientes` no pedidos (`notas`, `documento`).

## Archivos a crear/modificar

### Nuevos
- `components/DetalleClienteModal.js`

### Modificados
- `lib/whatsapp.js` — `getConversaciones()` trae `clientes(nombre, email)` en vez de `clientes(nombre)`.
- `lib/__tests__/whatsapp.test.js` — actualizar el string de `select` esperado.
- `app/whatsapp/page.js` — teléfono entre paréntesis en la lista; le pasa `cliente` (objeto) a `WhatsAppHilo` en vez de `clienteNombre`.
- `components/WhatsAppHilo.js` — recibe prop `cliente`; header con menú de 3 puntos; abre `DetalleClienteModal`.

## Testing

- `lib/__tests__/whatsapp.test.js`: actualizar la aserción del `select` string de `getConversaciones` para incluir `clientes(nombre, email)`.
- No hay tests automatizados de UI en este proyecto (consistente con el resto del inbox de WhatsApp) — verificación manual: confirmar que el teléfono aparece entre paréntesis en la lista, que el menú de 3 puntos abre/cierra con click afuera y Escape, que el modal muestra nombre/teléfono/email correctos (y "No especificado" cuando falta el email), y legibilidad en modo oscuro.
