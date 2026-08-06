# Bandeja de WhatsApp — Spec de Diseño

> **Nota de actualización (2026-08-06, previa a implementación):** este spec se escribió contra una rama local desactualizada. Entre esa exploración y la ejecución del plan, `origin/main` avanzó con trabajo que cambia varias asunciones de este documento: (1) ya existe `app/api/webhook/whatsapp/route.js` manejando status updates de Meta (entregado/leído/fallido) — no se crea un webhook nuevo, se **extiende** ese mismo archivo; (2) el envío de WhatsApp pasó de texto libre a Message Templates de Meta (`sendWhatsApp({to, templateName, languageCode, parameters})`), y el canal de email se eliminó por completo del sistema de notificaciones; (3) un hardening de seguridad (`030`-`032_*.sql`) bloqueó el acceso anónimo a `clientes`/`ordenes` (datos PII) — todas las lecturas pasan ahora por rutas `/api/*` autenticadas con el cliente admin (`getSupabaseAdmin()`), así que esta feature usa ese mismo patrón para leer y actualizar la bandeja (polling autenticado vía fetch, no Supabase Realtime con anon key — este proyecto nunca usó Realtime y el anon key ya no tiene ningún acceso a datos de clientes); (4) los clientes ahora pueden ser de 7 países (selector de prefijo con bandera, `lib/countries.js`), no solo Uruguay. Las secciones de abajo quedan corregidas para reflejar esto — el plan de implementación (`docs/superpowers/plans/2026-08-06-whatsapp-inbox.md`) tiene el detalle técnico completo y actualizado.

## Resumen

El negocio envía notificaciones a clientes por WhatsApp (Meta Cloud API directa, sin BSP), usando Message Templates aprobados. El número está migrado por completo a la API, así que la app de WhatsApp Business del celular ya no funciona con ese número — no hay dónde ver las respuestas de los clientes. Hoy existe un webhook (`app/api/webhook/whatsapp/route.js`) pero solo procesa confirmaciones de entrega de nuestros propios envíos; no hay nada que capture ni muestre las respuestas de los clientes.

Se agrega: (1) manejo de mensajes entrantes en el webhook existente, persistiéndolos vinculados a `clientes` por teléfono, y (2) una pestaña nueva `/whatsapp`, visible para admin y empleados (no cadetes), con una interfaz tipo WhatsApp Web que muestra el hilo completo (entrantes + salientes) por cliente.

**Alcance v1: solo lectura.** No se responde desde la interfaz — el envío sigue siendo el automático existente (Message Templates). Bidireccional queda fuera de alcance por ahora; ver sección "Fuera de alcance" para el razonamiento de seguridad.

---

## Base de datos (`supabase/034_whatsapp_inbox.sql`)

### Columna nueva: `clientes.telefono_e164`

`clientes.telefono` puede tener varios formatos hoy: legado uruguayo local (`"099123456"`) o, desde que existe el selector de país (`lib/countries.js`), un string concatenado `dial + número` sin `+` para cualquiera de 7 países (ej. `"59899123456"` UY, `"5491112345678"` AR). Ninguno matchea directo contra el `wa_id` que manda Meta (dígitos con código de país, sin `+`, ej. `"59899111222"`).

```sql
ALTER TABLE clientes ADD COLUMN telefono_e164 TEXT;
CREATE INDEX idx_clientes_telefono_e164 ON clientes(telefono_e164);
```

Se puebla vía una función de normalización que reutiliza la lista de países de `lib/countries.js` (mismo criterio de matching: probar los dial codes de mayor a menor longitud), con un fallback para el formato legado uruguayo sin prefijo. Aplicada en un backfill de la migración y disponible en `lib/phone.js` para el webhook y el envío saliente.

### Tabla `whatsapp_conversaciones`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | UUID | PK, default gen_random_uuid() |
| cliente_id | UUID | FK → clientes, NOT NULL, UNIQUE |
| telefono_e164 | TEXT | NOT NULL |
| last_message_at | TIMESTAMPTZ | NOT NULL |
| last_message_preview | TEXT | Nullable |
| created_at | TIMESTAMPTZ | NOT NULL, default now() |

Una conversación por cliente. Solo se crea cuando el teléfono matchea un cliente existente (ver "Números desconocidos" abajo).

### Tabla `whatsapp_mensajes`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | UUID | PK, default gen_random_uuid() |
| conversacion_id | UUID | FK → whatsapp_conversaciones ON DELETE CASCADE, NOT NULL |
| direccion | TEXT | CHECK ('entrante', 'saliente'), NOT NULL |
| wa_message_id | TEXT | UNIQUE — id de Meta, dedupe ante reintentos del webhook |
| tipo | TEXT | CHECK ('text', 'other'), NOT NULL |
| body | TEXT | Nullable — solo cuando tipo = 'text' |
| estado | TEXT | Nullable — para salientes: 'enviado' / 'error' |
| created_at | TIMESTAMPTZ | NOT NULL, default now() |

Índice en `conversacion_id` + `created_at` para cargar el hilo ordenado.

### RLS

**Corregido:** estas tablas contienen PII (identidad del cliente vía FK, teléfono, contenido de mensajes) — mismo criterio que `031_lockdown_pii.sql` aplicó a `clientes`/`ordenes`. Se habilita RLS **sin ninguna policy para anon/authenticated**: todo acceso pasa por el cliente admin (`getSupabaseAdmin()`) desde rutas `/api/*` autenticadas con sesión de NextAuth. `service_role` bypasea RLS automáticamente.

---

## Webhook (`app/api/webhook/whatsapp/route.js` — existente, se extiende)

El archivo ya maneja `GET` (verificación) y `POST` con `value.statuses[]` (delivery tracking hacia `notificaciones_enviadas`). Se agrega:

1. **Verificación de firma** (gap de seguridad pre-existente, no cubierto hoy): leer el body crudo, calcular HMAC-SHA256 con `WHATSAPP_APP_SECRET` y compararlo contra `X-Hub-Signature-256`. Si `WHATSAPP_APP_SECRET` no está configurado, se loguea una advertencia y se sigue sin bloquear (para no romper el tracking de status ya en producción hasta que se configure la env var nueva); si está configurado, una firma inválida devuelve 401.
2. **Manejo de `value.messages[]`** (nuevo): por cada mensaje entrante, normalizar el `wa_id` a `telefono_e164`, buscar `cliente` por ese valor.
   - **Sin match:** se descarta, no se persiste.
   - **Con match:** upsert de `whatsapp_conversaciones` + insert en `whatsapp_mensajes` con `direccion: 'entrante'`, `wa_message_id` (idempotente ante reintentos de Meta).
   - Si `type === "text"` → `tipo: 'text'`, `body: text.body`. Cualquier otro tipo → `tipo: 'other'`, `body: null` (sin descarga de multimedia en v1).
3. El comportamiento existente (status updates) no cambia. Un error procesando un mensaje individual no aborta el resto ni la respuesta — siempre 200.

### Variables de entorno nuevas (`.env.example`)

`WHATSAPP_VERIFY_TOKEN` ya existe. Se agrega:

```
WHATSAPP_APP_SECRET=app-secret-de-meta-for-developers
```

---

## Integración con el envío existente

`lib/notifications/index.js` → `sendViaWhatsApp()` ya llama a `sendWhatsApp({to, templateName, languageCode, parameters})`, que devuelve el `wa_message_id` de Meta (o `null`). Tras un envío exitoso, se agrega: resolver/crear la `whatsapp_conversacion` del cliente (por teléfono) e insertar el mensaje saliente en `whatsapp_mensajes` (`direccion: 'saliente'`, `wa_message_id` devuelto por `sendWhatsApp`, `estado: 'enviado'`).

Como el envío ya no interpola texto libre (son parámetros posicionales de un template), el texto legible para el hilo se arma reutilizando la tabla `plantillas_whatsapp` (sigue existiendo, sigue editable desde `/admin` — hoy solo se usa para previsualización administrativa): se interpola su `mensaje` con los mismos `data` que arma el `param_keys` del template, y ese texto interpolado es el `body` que se guarda en `whatsapp_mensajes`. Si no hay plantilla de preview para ese tipo, se usa un fallback simple (parámetros unidos por `" · "`).

Si este registro falla, se loguea pero **no** debe hacer fallar el envío real del WhatsApp — es contabilidad secundaria.

---

## Interfaz (`/whatsapp`)

### Acceso

Ruta nueva de nivel superior (no bajo `/admin`, que el middleware restringe solo a `role === 'admin'`). Visible para `admin` y `employee`. El middleware ya redirige a cualquier `cadete` fuera de `/cadete` sin cambios adicionales.

### Botón de entrada

En el header principal (`app/page.js`), al lado de "🚚 Cadete": botón verde WhatsApp (`#25D366`) con ícono del logo (SVG inline) y texto "WhatsApp".

### Layout (`app/whatsapp/page.js` + `components/WhatsAppHilo.js`)

- **Sidebar izquierda:** lista de conversaciones ordenadas por `last_message_at` desc — nombre del cliente, preview del último mensaje, hora relativa. Buscador simple que filtra por nombre de cliente.
- **Panel derecho:** hilo de mensajes de la conversación seleccionada, en burbujas — salientes alineados a la derecha (verde), entrantes a la izquierda (gris claro), con hora. Mensajes `tipo: 'other'` se muestran como placeholder genérico "📎 Mensaje multimedia".
- Sin estado de leído/no leído en v1.
- Estado vacío: "Seleccioná una conversación" / "Todavía no hay conversaciones".

### Actualización en vivo — **corregido: polling, no Realtime**

Como `clientes`/PII-adyacentes están bloqueadas para el anon key (ver RLS arriba), los datos de esta pantalla se leen vía rutas `/api/whatsapp/*` autenticadas, igual que `ordenes`/`stats` en el dashboard principal. Este proyecto no usa Supabase Realtime en ningún lado — el patrón establecido es polling (`app/page.js` cada 30s, `TrasladosPanel.js` cada 5s). Se sigue el mismo criterio: lista de conversaciones cada 15s, hilo de la conversación abierta cada 5s.

### Responsividad

Mismo enfoque que el resto de la app (mobile-first, breakpoints `sm`/`md`/`lg`). En celular, la sidebar y el hilo ocupan pantalla completa alternando (como WhatsApp Web en mobile), no dos columnas fijas.

---

## Testing (Vitest, mismo patrón que `__tests__/notifications.test.js` y `__tests__/webhook-whatsapp.test.js`)

- `lib/phone.js`: normalización multi-país a E.164 (reutilizando `lib/countries.js`) + fallback legado uruguayo.
- Webhook (extendiendo `__tests__/webhook-whatsapp.test.js`): firma válida/inválida/no configurada, mensaje de tipo texto, mensaje de tipo distinto a texto, número sin match, `wa_message_id` duplicado — preservando todos los tests existentes de status updates sin romperlos.
- Integración de envío (extendiendo `__tests__/notifications.test.js`): insert en `whatsapp_mensajes` tras `sendWhatsApp()` exitoso, usando el `wa_message_id` devuelto; que un fallo del insert no rompa el envío.
- Rutas `/api/whatsapp/conversaciones` y `/api/whatsapp/conversaciones/[id]/mensajes`: requieren sesión (mismo criterio que `/api/clientes`, `/api/admin/plantillas`).

---

## Archivos a crear/modificar

### Nuevos
- `supabase/034_whatsapp_inbox.sql` — columna `telefono_e164`, tablas, RLS bloqueada
- `lib/phone.js` — normalización de teléfono a E.164 (multi-país)
- `lib/whatsapp-webhook.js` — verificación de firma + parseo de mensajes entrantes
- `lib/whatsapp.js` — funciones server-side (`getSupabaseAdmin()`) para conversaciones/mensajes
- `app/api/whatsapp/conversaciones/route.js` — GET lista de conversaciones (sesión requerida)
- `app/api/whatsapp/conversaciones/[id]/mensajes/route.js` — GET hilo de una conversación (sesión requerida)
- `app/whatsapp/page.js` — vista principal
- `components/WhatsAppHilo.js`
- `components/WhatsAppIcon.js` — SVG del logo

### Modificados
- `app/api/webhook/whatsapp/route.js` — agregar verificación de firma + manejo de mensajes entrantes, preservando el manejo de status existente
- `lib/notifications/index.js` — registrar mensaje saliente en `whatsapp_mensajes` tras enviar
- `app/page.js` — botón "WhatsApp" en el header
- `.env.example` — `WHATSAPP_APP_SECRET`

---

## Fuera de alcance

- **Responder desde la interfaz (bidireccional).** Introduce riesgos que ameritan su propio diseño: gate estricto de rol admin en la ruta de envío, resolución del teléfono destino en el servidor (nunca desde el cliente, para evitar IDOR/abuso de la cuota de Meta), rate limiting, y manejo de la ventana de 24hs de atención al cliente de Meta. Fast-follow una vez validado el v1 de solo lectura en producción.
- Descarga y visualización de contenido multimedia (fotos, audios, documentos) — se muestran como placeholder.
- Modo "coexistencia" (mensajes originados desde la app del celular) — no aplica, el número está migrado por completo a la API.
- Marcado de leído/no leído, notificaciones push al staff por mensaje nuevo.
- Historial retroactivo — solo se capturan mensajes recibidos a partir de que el webhook queda activo.
