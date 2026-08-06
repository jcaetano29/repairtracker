# Remover canal de notificaciones por email

**Fecha:** 2026-06-13
**Tipo:** Refactor / cleanup
**Scope:** UI + código (sin tocar schema ni datos de DB)

## Resumen

Después de integrar WhatsApp Cloud API como canal único de notificaciones, las notificaciones por email dejan de usarse. Este spec define qué se remueve y qué se conserva.

El cambio es de un canal en paralelo (email + WhatsApp dispatcheados con `Promise.allSettled`) a un solo canal (WhatsApp). El módulo `lib/notifications/` se mantiene como capa de indirección para preservar las firmas que los callers usan hoy, dejando lugar para agregar canales en el futuro sin rearmar la abstracción.

Como efecto colateral, el teléfono del cliente pasa a ser **requerido** al crear un cliente (antes el email era requerido y el teléfono opcional).

## Decisiones tomadas

- **Nivel de remoción**: UI + código. El schema (`plantillas_email`, columna `cliente_email`) **se conserva** con sus datos, dormido. Esto facilita rollback y deja los datos históricos accesibles si en el futuro hay que exportarlos.
- **Arquitectura interna**: el módulo `lib/notifications/` se mantiene. `sendNotification(type, data)` queda como wrapper de un solo canal — sin `Promise.allSettled` porque no hay paralelismo. Si se agrega SMS u otro canal después, la abstracción ya existe.
- **Input email del cliente**: queda visible como **opcional** en el formulario de creación. No se valida, no se requiere, no se usa para nada. Sirve como dato de contacto.
- **Input teléfono del cliente**: pasa a ser **requerido**. Sin teléfono no hay forma de notificar.
- **Texto del checkbox de notificación**: pasa a ser explícito — `"Notificar al cliente por WhatsApp"`.
- **Página admin de plantillas de email**: se elimina completa (API + UI).

## Alcance — qué se remueve

### Archivos a borrar completos

- `lib/notifications/email.js`
- `lib/notifications/__tests__/email.test.js`
- `app/api/admin/plantillas-email/route.js`

### Archivos a modificar

- `lib/notifications/index.js` — eliminar `sendViaEmail`, eliminar import de `sendEmail`, eliminar `Promise.allSettled`. `sendNotification` queda llamando directo a `sendViaWhatsApp`. Eliminar también `export function interpolate()` — solo la usaba `sendViaEmail`; el path de WhatsApp no interpola strings (manda parámetros posicionales a Meta).
- `app/api/notify/route.js` — sin cambios de firma. Sigue aceptando `data.clienteEmail` en el body sin romper, pero `sendNotification` lo ignora.
- `app/api/cron/recordatorios/route.js` — eliminar el path de email (si lo tiene). La inserción a `notificaciones_enviadas` con `canal='email'` se borra.
- `app/api/traslados/route.js` — sacar el campo `clienteEmail` del payload que se pasa a `sendNotification`.
- `components/DetalleOrdenModal.js`:
  - Remover el `fetch("/api/admin/plantillas-email")` y todo el manejo del estado `plantillas`.
  - Remover el preview interpolado de la plantilla (el bloque que muestra el mensaje que va a enviarse — depende de las plantillas que ya no van a estar disponibles).
  - Remover `clienteEmail: orden.cliente_email` del body del `triggerNotify`.
  - Cambiar las condiciones `(orden.cliente_email || orden.cliente_telefono)` → `orden.cliente_telefono` solo.
  - Cambiar el texto del label en los dos checkboxes (`"Notificar al cliente por WhatsApp y email"` y la variante `"… por WhatsApp"` cuando no hay email) → siempre `"Notificar al cliente por WhatsApp"`.
- `components/NuevoIngresoModal.js`:
  - Remover la validación de email requerido en `handleCrearCliente` (línea ~98) y en el `disabled` del botón (línea ~353).
  - Agregar la validación de teléfono requerido visualmente (asterisco rojo).
  - Cambiar el texto `"…recibirá un recordatorio por email…"` → `"…recibirá un recordatorio por WhatsApp…"`.
  - El input email queda visible como opcional (sin asterisco).
- `app/admin/configuracion/page.jsx` — eliminar la query a `plantillas_email` y la prop `plantillasEmail`.
- `app/admin/configuracion/configuracion-client.js` — eliminar toda la sección UI de plantillas de email (formulario de edición de subject/body).
- `__tests__/notifications.test.js` — adaptar: eliminar el mock `mockSendEmail`, eliminar los casos que prueban envío de email, casos de paralelo email+whatsapp, casos de error de email. Sobreviven los casos puramente de WhatsApp.
- `app/admin/configuracion/__tests__/page.test.js` — si testea plantillas email, sacar.
- `.env.example` — eliminar línea `RESEND_API_KEY`.

### Archivos que NO se tocan

- `lib/notifications/whatsapp.js`
- `app/api/webhook/whatsapp/route.js`
- `__tests__/whatsapp.test.js`
- `__tests__/webhook-whatsapp.test.js`
- `lib/notifications/plantillas_whatsapp_meta` (tabla y migración 028)
- Cualquier código relacionado con Meta Cloud API

### Schema y datos — NO se tocan

- Tabla `plantillas_email` y sus filas → quedan en DB.
- Columna `cliente_email` en `clientes` → queda con datos existentes.
- Tabla `plantillas_whatsapp` (legacy, migración 012) → fuera de scope, no se toca acá.

## Comportamiento visible — antes vs. después

### Crear cliente

| Campo | Antes | Después |
|---|---|---|
| Nombre | requerido | requerido |
| Documento | requerido | requerido |
| Teléfono | requerido | **requerido** (sigue) |
| Email | requerido | **opcional** |

Botón "Crear cliente y continuar" se habilita cuando los 3 requeridos están llenos.

### Cambiar estado a "Listo para retiro" o "Esperando aprobación"

- Antes: el checkbox aparece si el cliente tiene email **o** teléfono. Label: `"Notificar al cliente por WhatsApp y email"` (o solo WhatsApp si no hay email).
- Después: el checkbox aparece si el cliente tiene teléfono. Label: `"Notificar al cliente por WhatsApp"` (siempre).

### `/admin/configuracion`

- Antes: hay una sección "Plantillas de email" con formularios para editar asunto y cuerpo por tipo de notificación.
- Después: esa sección desaparece. Las demás configuraciones quedan intactas.

### Cron de recordatorios de mantenimiento

- Antes: corre email y WhatsApp en paralelo.
- Después: solo WhatsApp. Si el cliente no tiene teléfono, no se manda nada (silencioso, no error).

## Edge cases

- **Cliente existente sin teléfono**: notificaciones no se mandan. No hay error visible (la guarda `if (!data.clienteTelefono) return` ya existe en `sendViaWhatsApp`).
- **Cliente existente sin email**: mismo comportamiento que antes — el email opcional no afecta nada.
- **Caller viejo que manda `clienteEmail` en el body de `/api/notify`**: el campo se ignora silenciosamente. No rompe.
- **Llamada al endpoint borrado `/api/admin/plantillas-email`**: responde 404. El frontend ya no lo llama, pero si alguna petición vieja queda en caché del navegador, devuelve 404 y el `DetalleOrdenModal` la maneja (catch silencioso, plantillas vacías → preview vacío).

## Plan de testing

### Tests automatizados

1. `__tests__/notifications.test.js` actualizado y verde.
2. `__tests__/whatsapp.test.js` sin cambios — pasa.
3. `__tests__/webhook-whatsapp.test.js` sin cambios — pasa.
4. Tests de `configuracion/page` actualizados si testeaba plantillas email.

### Smoke test manual (antes de merge)

- [ ] Crear cliente nuevo con teléfono y SIN email → permite crearlo.
- [ ] Crear cliente nuevo SIN teléfono → bloquea el botón "Crear cliente".
- [ ] Cambiar orden a "Esperando aprobación" + cargar monto + tildar notificar → llega WhatsApp.
- [ ] Cambiar orden a "Listo para retiro" + tildar notificar → llega WhatsApp.
- [ ] Abrir `/admin/configuracion` → no aparece la sección de plantillas email.
- [ ] `npm run test` verde.
- [ ] `npm run build` verde sin warnings nuevos.

## Cleanup post-merge (fuera del PR)

Tareas que el usuario hace manualmente después de mergear, **no parte del PR**:

- Borrar `RESEND_API_KEY` de Vercel (Settings → Environment Variables).
- Cancelar cuenta de Resend si no se usa para otra cosa.
- (Opcional) `npm uninstall resend` para sacar el SDK del `package.json`.
- (Opcional, a futuro) Migración para dropear tabla `plantillas_email` y columna `cliente_email` si se decide limpieza completa del schema.

## Out of scope

- Selector de prefijo de país con bandera en inputs de teléfono → spec separado.
- Migración de schema (dropear tabla email, columna email).
- Cambios en la integración con Meta Cloud API o el webhook.
- Cualquier mejora a notificaciones de WhatsApp más allá del cleanup.

## Riesgos

- **Bajo**: el cambio es local, no toca schema ni la integración con Meta.
- Si algún caller externo (hipotético) llama a `/api/admin/plantillas-email`, va a recibir 404. No hay callers externos conocidos.
- Si alguien tenía cargado solo email (sin teléfono) en un cliente, ese cliente queda incontactable. Los datos no se pierden — el email sigue en la columna.
