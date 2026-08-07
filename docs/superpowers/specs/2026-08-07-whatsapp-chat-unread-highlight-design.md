# Resaltado de chats con mensajes nuevos — Spec de Diseño

## Resumen

Hoy el inbox de WhatsApp (`app/whatsapp/page.js`) solo avisa que "hay mensajes sin leer" a nivel global, con un globito en el botón "WhatsApp" del dashboard (ver `docs/superpowers/specs/2026-08-06-whatsapp-badge-y-dark-mode-design.md`). Ese globito se apaga apenas se abre la página del inbox, antes de mirar ningún chat puntual.

Esta feature agrega resaltado **por conversación** dentro de la lista de chats: el o los chats que tienen un mensaje entrante sin leer se muestran en negrita con un punto verde, independiente del estado global del badge del header.

## Por qué no alcanza con `last_message_at`

`whatsapp_conversaciones.last_message_at` se actualiza tanto por mensajes entrantes (webhook, `app/api/webhook/whatsapp/route.js:131`) como por mensajes salientes (notificaciones automáticas del sistema, `lib/notifications/index.js:87`). No sirve para detectar "hay un mensaje del cliente sin leer" — el mismo problema que ya se documentó para el badge global.

## Modelo de datos

Dos columnas nuevas en `whatsapp_conversaciones` (migración `supabase/037_whatsapp_conversaciones_unread.sql`):

```sql
ALTER TABLE whatsapp_conversaciones
  ADD COLUMN last_incoming_message_at TIMESTAMPTZ,
  ADD COLUMN last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
```

- `last_incoming_message_at` — se actualiza únicamente cuando llega un mensaje entrante (a diferencia de `last_message_at`). Empieza en `NULL` para conversaciones existentes; se completa recién con el próximo mensaje entrante de cada una.
- `last_read_at` — marca de lectura por conversación. Default `NOW()` en la migración para que ninguna conversación existente aparezca resaltada apenas se despliega el cambio.

**Un chat está "no leído" cuando:** `last_incoming_message_at IS NOT NULL AND last_incoming_message_at > last_read_at`.

No hace falta índice adicional: la comparación se hace en memoria sobre las filas ya traídas por `getConversaciones()` (la tabla es de tamaño acotado, un negocio maneja cientos de conversaciones, no millones).

## Backend

### `app/api/webhook/whatsapp/route.js`

El upsert de `persistIncomingMessage` (línea ~127) agrega `last_incoming_message_at: new Date().toISOString()` junto a `last_message_at`.

### `lib/whatsapp.js`

```js
export async function getConversaciones() {
  const { data, error } = await getSupabaseAdmin()
    .from("whatsapp_conversaciones")
    .select("id, cliente_id, telefono_e164, last_message_at, last_message_preview, last_incoming_message_at, last_read_at, clientes(nombre)")
    .order("last_message_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((c) => ({
    ...c,
    unread: !!c.last_incoming_message_at && c.last_incoming_message_at > c.last_read_at,
  }));
}

export async function marcarConversacionLeida(conversacionId) {
  const { error } = await getSupabaseAdmin()
    .from("whatsapp_conversaciones")
    .update({ last_read_at: new Date().toISOString() })
    .eq("id", conversacionId);
  if (error) throw error;
}
```

`last_read_at`/`last_incoming_message_at` no se exponen tal cual al frontend más allá de lo necesario — alcanza con el booleano `unread` calculado; los timestamps crudos igual viajan en el objeto porque `select` los trae, pero el frontend solo consume `unread`.

### Ruta nueva: `app/api/whatsapp/conversaciones/[id]/marcar-leido/route.js`

Mismo patrón que `app/api/whatsapp/conversaciones/[id]/mensajes/route.js`: `auth()` de `@/auth` (401 sin sesión), valida `id` como UUID (400 si no matchea), llama `marcarConversacionLeida(id)`, responde `{ ok: true }`.

```js
export async function POST(_request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    await marcarConversacionLeida(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/whatsapp/conversaciones/:id/marcar-leido] POST error:", e);
    return NextResponse.json({ error: "Error al marcar como leído" }, { status: 500 });
  }
}
```

## Frontend (`app/whatsapp/page.js`)

- **Al hacer click en un chat** (`onClick` del botón de cada conversación en la lista): además de `setSeleccionada(c.id)`, dispara `fetch(POST /api/whatsapp/conversaciones/${c.id}/marcar-leido)` (fire-and-forget, mismo estilo que el `marcar-leido` global existente) y actualiza el estado local `conversaciones` seteando `unread: false` en esa conversación al instante — así el resaltado desaparece sin esperar al próximo poll.

- **Mientras un chat sigue seleccionado:** el intervalo de polling existente (`cargarConversaciones`, cada 15s) ya vuelve a pedir la lista completa. Después de actualizar `conversaciones` con la respuesta del servidor, si `seleccionada` sigue siendo un id presente en la lista y esa conversación vino con `unread: true` (por ejemplo, llegó un mensaje nuevo del mismo cliente mientras estaba abierta), se vuelve a llamar `marcar-leido` para esa conversación. Esto evita que un chat abierto en pantalla quede resaltado como "no leído" hasta el próximo click.

- **Render de cada fila** (línea ~98-114 actual):

```jsx
<div className="flex justify-between items-baseline gap-2">
  <span className={`text-sm truncate flex items-center gap-1.5 ${
    c.unread ? "font-bold text-slate-900 dark:text-white" : "font-medium text-slate-800 dark:text-slate-100"
  }`}>
    {c.unread && <span className="w-2 h-2 rounded-full bg-[#25D366] shrink-0" aria-label="Mensaje nuevo" />}
    {c.clientes?.nombre ?? c.telefono_e164}
  </span>
  <span className="text-[10px] text-slate-400 shrink-0">{formatFecha(c.last_message_at)}</span>
</div>
```

El resto de la fila (preview del mensaje, fecha) no cambia de estilo — solo el nombre y el puntito indican "no leído", consistente con el patrón de WhatsApp real.

## Fuera de alcance

- Contador de mensajes sin leer por chat (solo indicador booleano, igual que el badge global).
- Resaltado "por usuario admin" — el estado de lectura es compartido entre todas las computadoras que usan el inbox, igual que el badge global existente.
- Sonido/notificación push al llegar un mensaje.
- Cambios al comportamiento del badge global del header (`hayMensajesSinLeer`/`marcarInboxLeido`) — sigue funcionando exactamente igual, sin relación con este cambio.

## Archivos a crear/modificar

### Nuevos
- `supabase/037_whatsapp_conversaciones_unread.sql`
- `app/api/whatsapp/conversaciones/[id]/marcar-leido/route.js`
- `app/api/whatsapp/conversaciones/[id]/marcar-leido/__tests__/route.test.js`

### Modificados
- `app/api/webhook/whatsapp/route.js` — agrega `last_incoming_message_at` al upsert.
- `lib/whatsapp.js` — `getConversaciones()` calcula `unread`; nueva `marcarConversacionLeida()`.
- `lib/__tests__/whatsapp.test.js` — casos para `unread` y `marcarConversacionLeida`.
- `__tests__/webhook-whatsapp.test.js` — el caso `'persists a text message from a known client and updates the conversation'` (línea 214) también verifica que el upsert setea `last_incoming_message_at`.
- `app/whatsapp/page.js` — marcar leído al click (optimista) y al re-pollear con el chat abierto; render de negrita + punto verde.

## Testing

- `getConversaciones()`: `unread: true` cuando `last_incoming_message_at > last_read_at`; `false` cuando es anterior o igual; `false` cuando `last_incoming_message_at` es `null`.
- `marcarConversacionLeida()`: actualiza `last_read_at` de la fila con el `id` dado.
- Ruta `marcar-leido`: 401 sin sesión, 400 con UUID inválido, llama a `marcarConversacionLeida` con el id y responde `{ ok: true }` en éxito.
- Webhook: el upsert de conversación incluye `last_incoming_message_at` con el mismo valor que `last_message_at`.
- No hay tests automatizados de estilos visuales en este proyecto — verificación manual: mandar un mensaje de prueba, confirmar que el chat aparece en negrita con punto verde, clickearlo y confirmar que se apaga; confirmar que sigue apagado tras el siguiente poll.
