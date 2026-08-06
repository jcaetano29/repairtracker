# Bandeja de WhatsApp — Spec de Diseño

## Resumen

El negocio envía notificaciones a clientes por WhatsApp (Meta Cloud API directa, sin BSP). El número está migrado por completo a la API, así que la app de WhatsApp Business del celular ya no funciona con ese número — no hay dónde ver las respuestas de los clientes. Hoy no existe ningún receptor de webhook en el repo; `lib/notifications/whatsapp.js` solo envía.

Se agrega: (1) un webhook que recibe y persiste los mensajes entrantes de Meta, vinculándolos a `clientes` por teléfono, y (2) una pestaña nueva `/whatsapp`, visible para admin y empleados (no cadetes), con una interfaz tipo WhatsApp Web que muestra el hilo completo (entrantes + salientes) por cliente.

**Alcance v1: solo lectura.** No se responde desde la interfaz — el envío sigue siendo el automático existente (plantillas). Bidireccional queda fuera de alcance por ahora; ver sección "Fuera de alcance" para el razonamiento de seguridad.

---

## Base de datos (`supabase/028_whatsapp_inbox.sql`)

### Columna nueva: `clientes.telefono_e164`

`clientes.telefono` está en formato local (ej. "099 111 222") y no matchea contra el `wa_id` que manda Meta (ej. "59899111222"). Se agrega:

```sql
ALTER TABLE clientes ADD COLUMN telefono_e164 TEXT;
CREATE INDEX idx_clientes_telefono_e164 ON clientes(telefono_e164);
```

Se puebla vía una función de normalización (Uruguay, código de país 598) aplicada tanto en un backfill de la migración como en cada alta/edición de cliente de ahí en adelante (`lib/phone.js`, compartida entre backend de clientes y el webhook).

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

Mismo patrón que el resto de las tablas del proyecto (`001_schema.sql`): policy "Authenticated users full access" con `auth.role() = 'authenticated'`. No se introduce un modelo de seguridad nuevo — la autorización real vive en las rutas de API (como ya ocurre hoy con `getSupabaseAdmin()` en el resto del código).

---

## Webhook (`app/api/webhooks/whatsapp/route.js`)

`export const runtime = "nodejs"` (necesario para `crypto`).

### GET — verificación

Meta llama con `?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`. Se compara `hub.verify_token` contra `process.env.WHATSAPP_VERIFY_TOKEN`; si coincide, se responde el `hub.challenge` en texto plano (200). Si no, 403.

### POST — mensajes entrantes

1. Leer el body **crudo** (`await request.text()`) antes de parsear — necesario para validar la firma.
2. Calcular HMAC-SHA256 del body crudo con `WHATSAPP_APP_SECRET`, comparar contra el header `X-Hub-Signature-256` con `crypto.timingSafeEqual`. Si no matchea → 401, sin loguear el body ni el número.
3. Parsear JSON. Recorrer `entry[].changes[].value.messages[]`. Por cada mensaje:
   - Normalizar `wa_id` (viene como dígitos con código de país) a `+598...` con la misma función de `lib/phone.js`.
   - Buscar cliente por `telefono_e164`.
     - **Sin match:** se descarta, no se persiste (confirmado con el usuario — prioridad a mantener el alcance simple).
     - **Con match:** upsert de `whatsapp_conversaciones` (actualiza `last_message_at`/`preview`) + insert en `whatsapp_mensajes` con `direccion: 'entrante'`, `wa_message_id: message.id` (`ON CONFLICT (wa_message_id) DO NOTHING` para idempotencia).
   - Si `message.type === "text"` → `tipo: 'text'`, `body: message.text.body`.
   - Si es cualquier otro tipo (imagen, audio, ubicación, sticker, reacción, etc.) → `tipo: 'other'`, `body: null`. No se descarga contenido multimedia de la Graph API en v1.
4. Un error al procesar un mensaje individual no debe abortar el resto del batch ni la respuesta. El endpoint siempre devuelve 200 rápido (Meta puede deshabilitar el webhook tras fallos repetidos).

### Variables de entorno nuevas (`.env.example`)

```
# WhatsApp Webhook (mensajes entrantes)
WHATSAPP_VERIFY_TOKEN=un-token-propio-que-vos-elijas
WHATSAPP_APP_SECRET=app-secret-de-meta-for-developers
```

---

## Integración con el envío existente

`lib/notifications/index.js` ya llama a `sendWhatsApp()` y loguea en `notificaciones_enviadas`. Se agrega, en el mismo punto y tras un envío exitoso: resolver/crear la `whatsapp_conversacion` del `cliente_id` (ya se conoce, no viene del cliente) e insertar el mensaje saliente en `whatsapp_mensajes` (`direccion: 'saliente'`, `tipo: 'text'`, `body`, `estado: 'enviado'`/`'error'`).

Si este insert falla, se loguea pero **no** debe hacer fallar el envío real del WhatsApp — el guardado en el hilo es secundario respecto de la notificación al cliente.

---

## Interfaz (`/whatsapp`)

### Acceso

Ruta nueva de nivel superior (no bajo `/admin`, que el middleware restringe solo a `role === 'admin'`). Visible para `admin` y `employee`. El middleware ya redirige a cualquier `cadete` fuera de `/cadete` sin cambios adicionales.

### Botón de entrada

En el header principal (`app/page.js`), al lado de "🚚 Cadete": botón verde WhatsApp (`#25D366`) con ícono del logo (SVG inline) y texto "WhatsApp".

### Layout (`app/whatsapp/page.js` + componentes en `components/whatsapp/`)

- **Sidebar izquierda:** lista de conversaciones ordenadas por `last_message_at` desc — nombre del cliente, preview del último mensaje, hora relativa. Buscador simple que filtra por nombre de cliente.
- **Panel derecho:** hilo de mensajes de la conversación seleccionada, en burbujas — salientes alineados a la derecha (verde), entrantes a la izquierda (gris claro), con hora. Mensajes `tipo: 'other'` se muestran como placeholder genérico "📎 Mensaje multimedia".
- Sin estado de leído/no leído en v1.
- Estado vacío: "Seleccioná una conversación" / "Todavía no hay conversaciones".

### Tiempo real

Canal de Supabase Realtime sobre `whatsapp_mensajes` (y `whatsapp_conversaciones` para reordenar la lista), usando `getSupabaseClient()` (anon key), igual que el resto de la app accede a datos desde el browser. Primera vez que se usa Realtime en el proyecto: si el canal se cae, hay un refetch periódico de respaldo (cada 60s) mientras se reestablece la conexión.

### Responsividad

Mismo enfoque que el resto de la app (mobile-first, breakpoints `sm`/`md`/`lg`). En celular, la sidebar y el hilo ocupan pantalla completa alternando (como WhatsApp Web en mobile), no dos columnas fijas.

---

## Testing (Vitest, mismo patrón que `__tests__/notifications.test.js`)

- `lib/phone.js`: normalización de números UY a E.164 (con y sin código de país, con espacios/guiones).
- Webhook: verificación de firma válida/inválida, verificación GET, mensaje de tipo texto, mensaje de tipo distinto a texto, número sin match, `wa_message_id` duplicado, payload malformado (no debe tirar 500).
- Integración de envío: insert en `whatsapp_mensajes` tras `sendWhatsApp()` exitoso; que un fallo del insert no rompa el envío.
- Gate de acceso a `/whatsapp` y sus rutas de API (admin y employee sí, cadete no).

---

## Archivos a crear/modificar

### Nuevos
- `supabase/028_whatsapp_inbox.sql` — columna `telefono_e164`, tablas, RLS
- `lib/phone.js` — normalización de teléfono a E.164
- `app/api/webhooks/whatsapp/route.js` — GET verificación + POST mensajes entrantes
- `app/api/whatsapp/conversaciones/route.js` — GET lista de conversaciones (admin, employee)
- `app/api/whatsapp/conversaciones/[id]/mensajes/route.js` — GET hilo de una conversación (admin, employee)
- `app/whatsapp/page.js` — vista principal
- `components/whatsapp/ConversacionesSidebar.js`
- `components/whatsapp/HiloMensajes.js`
- `components/whatsapp/WhatsAppIcon.js` — SVG del logo

### Modificados
- `lib/notifications/index.js` — insertar mensaje saliente en `whatsapp_mensajes` tras enviar
- `app/page.js` — botón "WhatsApp" en el header
- `.env.example` — `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`

---

## Fuera de alcance

- **Responder desde la interfaz (bidireccional).** Introduce riesgos que ameritan su propio diseño: gate estricto de rol admin en la ruta de envío, resolución del teléfono destino en el servidor (nunca desde el cliente, para evitar IDOR/abuso de la cuota de Meta), rate limiting, y manejo de la ventana de 24hs de atención al cliente de Meta (fuera de esa ventana el texto libre falla y hoy `sendWhatsApp` puede devolver éxito silencioso con teléfono vacío). Fast-follow una vez validado el v1 de solo lectura en producción.
- Descarga y visualización de contenido multimedia (fotos, audios, documentos) — se muestran como placeholder.
- Modo "coexistencia" (mensajes originados desde la app del celular) — no aplica, el número está migrado por completo a la API.
- Marcado de leído/no leído, notificaciones push al staff por mensaje nuevo.
- Historial retroactivo — solo se capturan mensajes recibidos a partir de que el webhook queda activo.
