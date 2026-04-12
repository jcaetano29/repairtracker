# Notificaciones por Email vía Resend

**Fecha:** 2026-04-12
**Estado:** Diseño aprobado

## Contexto

Actualmente, las notificaciones a clientes se envían exclusivamente por WhatsApp vía Meta Cloud API (`lib/notifications/whatsapp.js`). Las plantillas están en la tabla `plantillas_whatsapp` y son editables desde el admin (`/api/admin/plantillas`).

Se quiere incorporar un segundo canal: **email vía Resend**. Los dos canales deben convivir en el backend, pero el frontend admin solo debe exponer la gestión de plantillas de email en esta iteración.

## Objetivo

- Agregar envío de email como canal de notificación, conservando el envío por WhatsApp.
- Permitir al admin editar asunto y cuerpo de las plantillas de email desde la UI.
- Mantener `sendNotification(type, data)` como único punto de entrada, que despacha a todos los canales disponibles según los datos del cliente.

## Arquitectura

### Dispatcher multi-canal

`sendNotification(type, data)` corre ambos canales en paralelo con `Promise.allSettled`. Un fallo en un canal no bloquea al otro; cada error se loguea por separado.

- Si `data.clienteEmail` → envía email (Resend)
- Si `data.clienteTelefono` → envía WhatsApp (lógica actual, intacta)
- Si no hay ninguno → no-op silencioso (igual que hoy)

### Módulos

```
lib/notifications/
├── index.js              ← sendNotification (dispatcher)
├── whatsapp.js           ← sendWhatsApp (intacto)
├── email.js              ← sendEmail (NUEVO, usa Resend SDK)
└── email-template.js     ← renderEmailHtml, wrapper con branding (NUEVO)
```

### Frontend

Solo se expone la gestión de plantillas de **email** en `app/admin/configuracion/`. Las plantillas de WhatsApp siguen existiendo en DB pero no se muestran en esta iteración.

## Base de Datos

### Nueva tabla `plantillas_email`

Migración: `supabase/013_plantillas_email.sql`

```sql
CREATE TABLE plantillas_email (
  tipo text PRIMARY KEY,
  asunto text NOT NULL,
  cuerpo text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE plantillas_email ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read plantillas_email"
  ON plantillas_email FOR SELECT
  TO authenticated
  USING (true);
```

Escrituras se realizan desde API con service role (validación de rol admin en el endpoint), mismo patrón que `plantillas_whatsapp`.

### Tipos

Mismos tres tipos que WhatsApp: `PRESUPUESTO`, `LISTO_PARA_RETIRO`, `RECORDATORIO_MANTENIMIENTO`.

### Seed

Plantillas por defecto, tono formal, con interpolación `{{var}}`. Variables disponibles por tipo:

- **PRESUPUESTO:** `clienteNombre`, `numeroOrden`, `tipoArticulo`, `monto`
- **LISTO_PARA_RETIRO:** `clienteNombre`, `numeroOrden`, `tipoArticulo`, `trackingUrl`
- **RECORDATORIO_MANTENIMIENTO:** `clienteNombre`, `tipoServicio`, `ultimaFecha`

Ejemplo seed `PRESUPUESTO`:
- Asunto: `Presupuesto listo — Orden #{{numeroOrden}}`
- Cuerpo: texto plano con saltos de línea, tono cordial y formal.

La tabla `plantillas_whatsapp` **no se modifica**.

## Envío de Email

### `lib/notifications/email.js`

```js
import { Resend } from "resend";
import { renderEmailHtml } from "./email-template";

const FROM = "Riviera Joyas <info@rivierajoyas.com.uy>";

export async function sendEmail({ to, subject, body }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Email] RESEND_API_KEY no configurado");
    return;
  }
  if (!to) return;

  const html = renderEmailHtml({ body });
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    text: body,
  });

  if (error) {
    console.error("[Email] Error al enviar:", {
      name: error.name,
      statusCode: error.statusCode,
    });
    throw new Error(`Resend error: ${error.name}`);
  }
}
```

Mismo estilo defensivo que `sendWhatsApp`: si falta la key, warn + return. Errores se loguean con código pero sin filtrar detalles sensibles.

### `lib/notifications/email-template.js`

Wrapper HTML con estilos inline (compatibilidad con clientes de email):

- **Ancho:** ~600px centrado
- **Header:** banda con color neutro/elegante, texto "Riviera Joyas"
- **Body:** texto del admin, escapado de HTML para prevenir inyección, `\n` → `<br>`
- **Footer:** texto gris chico con "Riviera Joyas · info@rivierajoyas.com.uy" y aviso "Este es un email automático, no responder."

Firma de la función:

```js
export function renderEmailHtml({ body }: { body: string }): string
```

### Constantes hardcodeadas

- Remitente: `Riviera Joyas <info@rivierajoyas.com.uy>`
- Nombre del negocio (header/footer): `Riviera Joyas`

Estos valores viven en una constante del módulo. Si mañana cambian, se tocan en un solo lugar. No se exponen como env vars porque no varían entre entornos.

### Variables de entorno

Agregar a `.env.example`:

```
RESEND_API_KEY=tu-resend-api-key-aqui
```

## Dispatcher

Refactor de `lib/notifications/index.js`:

```js
export async function sendNotification(type, data) {
  const results = await Promise.allSettled([
    sendViaEmail(type, data),
    sendViaWhatsApp(type, data),
  ]);
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const canal = i === 0 ? "email" : "whatsapp";
      console.error(`[Notifications] ${canal} falló:`, r.reason);
    }
  });
}

async function sendViaEmail(type, data) {
  if (!data.clienteEmail) return;
  const { data: row } = await getSupabaseAdmin()
    .from("plantillas_email")
    .select("asunto, cuerpo")
    .eq("tipo", type)
    .single();
  if (!row) return;
  const subject = interpolate(row.asunto, data);
  const body = interpolate(row.cuerpo, data);
  await sendEmail({ to: data.clienteEmail, subject, body });
}

async function sendViaWhatsApp(type, data) {
  // lógica actual, movida desde sendNotification
}
```

`interpolate` se reutiliza sin cambios.

## Callers a actualizar

Pasar `clienteEmail` en el `data`:

- `app/api/cron/recordatorios/route.js` (~L87) — agregar `clienteEmail: orden.clientes.email`
- `components/DetalleOrdenModal.js` (~L70) — agregar `clienteEmail: orden.cliente_email`
- `app/api/notify/route.js` — verificar que los callers del endpoint incluyan `clienteEmail` en el body

## API Admin

Nuevo endpoint: `app/api/admin/plantillas-email/route.js` (mirror de `/api/admin/plantillas`).

### GET

- Auth: sesión requerida (401 si no)
- Respuesta: `{ plantillas: [{ tipo, asunto, cuerpo, updated_at }] }` ordenado por `tipo`

### PATCH

- Auth: rol `admin` requerido (403 si no)
- Body: `{ tipo, asunto, cuerpo }`
- Validación:
  - `tipo` en lista blanca: `["PRESUPUESTO", "LISTO_PARA_RETIRO", "RECORDATORIO_MANTENIMIENTO"]`
  - `asunto`: string no vacío, ≤150 caracteres
  - `cuerpo`: string no vacío, ≤2000 caracteres
- 404 si la plantilla no existe
- Mismo patrón de respuestas que `/api/admin/plantillas`

## Frontend Admin

En `app/admin/configuracion/configuracion-client.js`, nueva sección **"Plantillas de Email"**:

- 3 cards, una por tipo
- Cada card contiene:
  - Input de **Asunto** (una línea, maxlength 150)
  - Textarea de **Cuerpo** (~10 filas, maxlength 2000)
  - Lista de variables disponibles visible arriba del textarea
  - Botón **Guardar** por card (PATCH independiente a `/api/admin/plantillas-email`)
  - Contador de caracteres para ambos campos
- Feedback vía toast (`lib/toast.js` ya existe)

La sección de plantillas WhatsApp **no se agrega** en esta iteración (aunque la tabla y el endpoint existan).

## Tests

### Backend

- **`__tests__/notifications.test.js`** (ampliar):
  - Envía a email si hay `clienteEmail`
  - Envía a WhatsApp si hay `clienteTelefono`
  - Envía a ambos si tiene los dos datos
  - No-op si no tiene ninguno
  - Un canal fallando no impide el otro (Promise.allSettled)
  - Interpolación correcta en asunto y cuerpo del email

- **`lib/notifications/__tests__/email.test.js`** (nuevo, mockear `resend`):
  - Warning + early return si falta `RESEND_API_KEY`
  - Llamada al SDK con `from`, `to`, `subject`, `html`, `text` correctos
  - HTML escape: inputs con `<script>` o `<`/`>` salen escapados en el HTML
  - `\n` en body se convierte a `<br>` en el HTML

- **`app/api/admin/plantillas-email/__tests__/route.test.js`** (nuevo, mirror del de plantillas WhatsApp):
  - 401 en GET sin sesión
  - 403 en PATCH sin rol admin
  - Validaciones: tipo inválido, asunto/cuerpo vacíos, largo máximo excedido
  - PATCH exitoso devuelve `{ success: true, data }`

### Frontend

- **`app/admin/configuracion/__tests__/page.test.js`** (ampliar):
  - Render de las 3 cards de email
  - Botón Guardar llama a `/api/admin/plantillas-email` con el tipo correcto
  - Toast de éxito/error según respuesta

## Consideraciones Operativas

- **Verificación de dominio:** `rivierajoyas.com.uy` debe estar verificado en Resend (SPF/DKIM) antes de producción para evitar spam.
- **Rotación de API key:** la key compartida en chat debe rotarse antes del deploy.
- **Extensibilidad:** el dispatcher queda preparado para exponer WhatsApp en el admin en una futura iteración — tabla, endpoint y lógica de envío ya existen; solo falta UI.

## Archivos

### Nuevos

- `supabase/013_plantillas_email.sql`
- `lib/notifications/email.js`
- `lib/notifications/email-template.js`
- `app/api/admin/plantillas-email/route.js`
- `lib/notifications/__tests__/email.test.js`
- `app/api/admin/plantillas-email/__tests__/route.test.js`

### Modificados

- `lib/notifications/index.js` — dispatcher multi-canal
- `app/admin/configuracion/configuracion-client.js` — sección plantillas email
- `app/api/cron/recordatorios/route.js` — pasar `clienteEmail`
- `components/DetalleOrdenModal.js` — pasar `clienteEmail`
- `.env.example` — `RESEND_API_KEY`
- `package.json` — dep `resend`
- `__tests__/notifications.test.js` — cobertura ampliada
- `app/admin/configuracion/__tests__/page.test.js` — tests de la sección nueva
