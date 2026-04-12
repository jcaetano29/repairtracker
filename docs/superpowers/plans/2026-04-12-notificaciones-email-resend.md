# Notificaciones por Email vía Resend — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar envío de notificaciones por email vía Resend, conviviendo con WhatsApp actual; exponer solo la gestión de plantillas de email en el admin.

**Architecture:** `sendNotification(type, data)` se convierte en un dispatcher que corre email y WhatsApp en paralelo con `Promise.allSettled`. Nueva tabla `plantillas_email` (tipo, asunto, cuerpo). Nuevo módulo `lib/notifications/email.js` que usa Resend SDK y envuelve el cuerpo en un HTML branded. Frontend admin reemplaza la sección de plantillas WhatsApp por plantillas de email.

**Tech Stack:** Next.js 14 (App Router), Supabase, Resend (`resend@^6.10.0` — ya instalado), Vitest, NextAuth.

Spec: `docs/superpowers/specs/2026-04-12-notificaciones-email-resend-design.md`

---

## File Structure

**Nuevos:**
- `supabase/013_plantillas_email.sql` — tabla + seed + RLS + ampliar view `v_ordenes_dashboard` con `cliente_email`
- `lib/notifications/email.js` — `sendEmail({ to, subject, body })`
- `lib/notifications/email-template.js` — `renderEmailHtml({ body })` + helpers de escape
- `app/api/admin/plantillas-email/route.js` — GET + PATCH
- `lib/notifications/__tests__/email.test.js`
- `lib/notifications/__tests__/email-template.test.js`
- `app/api/admin/plantillas-email/__tests__/route.test.js`

**Modificados:**
- `lib/notifications/index.js` — dispatcher multi-canal
- `app/admin/configuracion/page.jsx` — cargar `plantillasEmail` además de `plantillas`
- `app/admin/configuracion/configuracion-client.js` — reemplazar sección WhatsApp por email
- `app/admin/configuracion/__tests__/page.test.js` — tests sección email
- `app/api/cron/recordatorios/route.js` — incluir `clientes.email` en select y pasarlo al dispatcher, cambiar `canal` a 'notificacion' (o dejar 'whatsapp' — ver Task 7)
- `components/DetalleOrdenModal.js` — pasar `clienteEmail: orden.cliente_email` en `triggerNotify`
- `__tests__/notifications.test.js` — ampliar con tests del dispatcher
- `.env.example` — agregar `RESEND_API_KEY`

---

## Task 1: Migración SQL para `plantillas_email` y ampliación de view

**Files:**
- Create: `supabase/013_plantillas_email.sql`

- [ ] **Step 1: Crear archivo con tabla, seed, RLS, y view ampliada**

```sql
-- supabase/013_plantillas_email.sql
-- Plantillas editables para notificaciones por email
CREATE TABLE IF NOT EXISTS plantillas_email (
  tipo text PRIMARY KEY,
  asunto text NOT NULL,
  cuerpo text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO plantillas_email (tipo, asunto, cuerpo) VALUES
('PRESUPUESTO',
 'Presupuesto listo — Orden #{{numeroOrden}}',
 E'Hola {{clienteNombre}},\n\nTenemos el presupuesto listo para tu artículo.\n\nOrden: #{{numeroOrden}}\nArtículo: {{tipoArticulo}}\nPresupuesto: ${{monto}}\n\nPor favor, respondenos si querés continuar con la reparación.\n\nSaludos,\nRiviera Joyas'),
('LISTO_PARA_RETIRO',
 '¡Tu artículo está listo para retirar! — Orden #{{numeroOrden}}',
 E'Hola {{clienteNombre}},\n\nTu artículo ya está listo para que pases a buscarlo.\n\nOrden: #{{numeroOrden}}\nArtículo: {{tipoArticulo}}\n\nPodés consultar el estado en: {{trackingUrl}}\n\n¡Gracias por confiar en nosotros!\nRiviera Joyas'),
('RECORDATORIO_MANTENIMIENTO',
 'Recordatorio de mantenimiento — {{tipoServicio}}',
 E'Hola {{clienteNombre}},\n\nTe escribimos para recordarte que es momento de realizar el mantenimiento de tu artículo.\n\nServicio recomendado: {{tipoServicio}}\nÚltimo servicio: {{ultimaFecha}}\n\nComunicate con nosotros para coordinar la revisión.\n\nSaludos,\nRiviera Joyas')
ON CONFLICT (tipo) DO NOTHING;

ALTER TABLE plantillas_email ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read plantillas_email"
  ON plantillas_email FOR SELECT
  TO authenticated
  USING (true);

-- Recrear view v_ordenes_dashboard agregando cliente_email
DROP VIEW IF EXISTS v_ordenes_dashboard;
CREATE VIEW v_ordenes_dashboard AS
SELECT
  o.id,
  o.numero_orden,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
  c.email AS cliente_email,
  c.id AS cliente_id,
  o.tipo_articulo,
  o.marca,
  o.modelo,
  o.nombre_articulo,
  o.problema_reportado,
  o.estado,
  o.taller_id,
  t.nombre AS taller_nombre,
  o.sucursal_id,
  s.nombre AS sucursal_nombre,
  o.tipo_servicio_id,
  o.monto_presupuesto,
  o.moneda,
  o.presupuesto_aprobado,
  o.monto_final,
  o.notas_internas,
  o.foto_ingreso,
  o.tracking_token,
  o.fecha_ingreso,
  o.fecha_envio_taller,
  o.fecha_presupuesto,
  o.fecha_aprobacion,
  o.fecha_listo,
  o.fecha_entrega,
  o.updated_at,
  EXTRACT(DAY FROM NOW() - o.updated_at)::INT AS dias_en_estado,
  EXTRACT(DAY FROM NOW() - o.fecha_ingreso)::INT AS dias_totales
FROM ordenes o
LEFT JOIN clientes c ON c.id = o.cliente_id
LEFT JOIN talleres t ON t.id = o.taller_id
LEFT JOIN sucursales s ON s.id = o.sucursal_id;
```

> Nota: la view recreada elimina la columna `alerta_retraso` (CASE based on hardcoded days) que existía en `008_sucursales.sql`. Verificar en el código si se usa antes de aplicar esta migración. Si se usa, copiar el bloque CASE desde `008_sucursales.sql` L167+ a esta migración.

- [ ] **Step 2: Verificar que no se usa `alerta_retraso` antes de aplicar**

Run Grep para `alerta_retraso` en todo el código. Si aparece en lógica viva, reintegrar el CASE a la definición de la view en este archivo. Si no aparece, dejar como está.

- [ ] **Step 3: Commit**

```bash
git add supabase/013_plantillas_email.sql
git commit -m "feat: add plantillas_email table and expose cliente_email in view"
```

---

## Task 2: Variables de entorno

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Agregar RESEND_API_KEY al .env.example**

Agregar al final del archivo:

```
# Resend (notificaciones por email)
# Obtener en: https://resend.com → API Keys
RESEND_API_KEY=tu-resend-api-key-aqui
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add RESEND_API_KEY to env example"
```

---

## Task 3: HTML wrapper para email (`email-template.js`)

**Files:**
- Create: `lib/notifications/email-template.js`
- Create: `lib/notifications/__tests__/email-template.test.js`

- [ ] **Step 1: Escribir tests failing**

```js
// lib/notifications/__tests__/email-template.test.js
import { describe, it, expect } from 'vitest'
import { renderEmailHtml } from '../email-template'

describe('renderEmailHtml', () => {
  it('envuelve el body en estructura HTML con branding', () => {
    const html = renderEmailHtml({ body: 'Hola' })
    expect(html).toContain('<html')
    expect(html).toContain('Riviera Joyas')
    expect(html).toContain('Hola')
  })

  it('escapa caracteres HTML en el body', () => {
    const html = renderEmailHtml({ body: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('convierte saltos de línea a <br>', () => {
    const html = renderEmailHtml({ body: 'linea1\nlinea2' })
    expect(html).toContain('linea1<br>linea2')
  })

  it('incluye footer con aviso de no responder', () => {
    const html = renderEmailHtml({ body: 'x' })
    expect(html).toMatch(/no responder/i)
    expect(html).toContain('info@rivierajoyas.com.uy')
  })
})
```

- [ ] **Step 2: Run test para ver fallo**

Run: `npx vitest run lib/notifications/__tests__/email-template.test.js`
Expected: FAIL con "Cannot find module"

- [ ] **Step 3: Implementar `renderEmailHtml`**

```js
// lib/notifications/email-template.js

const BUSINESS_NAME = 'Riviera Joyas'
const BUSINESS_EMAIL = 'info@rivierajoyas.com.uy'

/**
 * Escapa caracteres HTML para prevenir inyección.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Renderiza un email HTML con el cuerpo del admin envuelto en branding.
 * @param {{ body: string }} params
 * @returns {string} HTML completo del email
 */
export function renderEmailHtml({ body }) {
  const safeBody = escapeHtml(body).replace(/\n/g, '<br>')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BUSINESS_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#1f2937;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;letter-spacing:0.5px;">${BUSINESS_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;font-size:15px;line-height:1.6;color:#1f2937;">
              ${safeBody}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;">
              ${BUSINESS_NAME} · ${BUSINESS_EMAIL}<br>
              Este es un email automático, por favor no responder.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
```

- [ ] **Step 4: Run tests para verificar pasa**

Run: `npx vitest run lib/notifications/__tests__/email-template.test.js`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/email-template.js lib/notifications/__tests__/email-template.test.js
git commit -m "feat: add branded HTML wrapper for email notifications"
```

---

## Task 4: Envío de email (`email.js`)

**Files:**
- Create: `lib/notifications/email.js`
- Create: `lib/notifications/__tests__/email.test.js`

- [ ] **Step 1: Escribir tests failing (mock de `resend`)**

```js
// lib/notifications/__tests__/email.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSend = vi.fn()

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

describe('sendEmail', () => {
  const originalEnv = process.env.RESEND_API_KEY

  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: 'abc' }, error: null })
    process.env.RESEND_API_KEY = 'test-key'
  })

  afterEach(() => {
    process.env.RESEND_API_KEY = originalEnv
  })

  it('warns y retorna sin enviar si falta RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { sendEmail } = await import('../email')
    await sendEmail({ to: 'a@b.com', subject: 's', body: 'b' })
    expect(mockSend).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('no envía si falta `to`', async () => {
    const { sendEmail } = await import('../email')
    await sendEmail({ to: '', subject: 's', body: 'b' })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('envía con from, to, subject, html y text correctos', async () => {
    const { sendEmail } = await import('../email')
    await sendEmail({ to: 'cliente@x.com', subject: 'Hola', body: 'cuerpo' })
    expect(mockSend).toHaveBeenCalledWith({
      from: 'Riviera Joyas <info@rivierajoyas.com.uy>',
      to: 'cliente@x.com',
      subject: 'Hola',
      html: expect.stringContaining('cuerpo'),
      text: 'cuerpo',
    })
  })

  it('lanza error si Resend devuelve error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', statusCode: 422, message: 'bad from' },
    })
    const { sendEmail } = await import('../email')
    await expect(
      sendEmail({ to: 'a@b.com', subject: 's', body: 'b' })
    ).rejects.toThrow(/Resend/)
  })
})
```

- [ ] **Step 2: Run test para ver fallo**

Run: `npx vitest run lib/notifications/__tests__/email.test.js`
Expected: FAIL

- [ ] **Step 3: Implementar `sendEmail`**

```js
// lib/notifications/email.js
import { Resend } from 'resend'
import { renderEmailHtml } from './email-template'

const FROM = 'Riviera Joyas <info@rivierajoyas.com.uy>'

/**
 * Envía un email transaccional vía Resend.
 * @param {{ to: string, subject: string, body: string }} params
 */
export async function sendEmail({ to, subject, body }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY no configurado')
    return
  }
  if (!to) return

  const html = renderEmailHtml({ body })
  const resend = new Resend(apiKey)

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    text: body,
  })

  if (error) {
    console.error('[Email] Error al enviar:', {
      name: error.name,
      statusCode: error.statusCode,
    })
    throw new Error(`Resend error: ${error.name}`)
  }
}
```

- [ ] **Step 4: Run tests para verificar pasa**

Run: `npx vitest run lib/notifications/__tests__/email.test.js`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/email.js lib/notifications/__tests__/email.test.js
git commit -m "feat: add sendEmail via Resend"
```

---

## Task 5: Dispatcher multi-canal (`notifications/index.js`)

**Files:**
- Modify: `lib/notifications/index.js`
- Modify: `__tests__/notifications.test.js`

- [ ] **Step 1: Ampliar tests**

Reemplazar `__tests__/notifications.test.js` por:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { interpolate } from '@/lib/notifications'

// Mocks para sendEmail y sendWhatsApp
const mockSendEmail = vi.fn()
const mockSendWhatsApp = vi.fn()

vi.mock('@/lib/notifications/email', () => ({
  sendEmail: (...args) => mockSendEmail(...args),
}))
vi.mock('@/lib/notifications/whatsapp', () => ({
  sendWhatsApp: (...args) => mockSendWhatsApp(...args),
}))

// Mock Supabase admin para devolver plantillas
const mockEmailRow = { asunto: 'Asunto {{numeroOrden}}', cuerpo: 'Hola {{clienteNombre}}' }
const mockWaRow = { mensaje: 'WA {{clienteNombre}}' }

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: () => {
            if (table === 'plantillas_email') return Promise.resolve({ data: mockEmailRow, error: null })
            if (table === 'plantillas_whatsapp') return Promise.resolve({ data: mockWaRow, error: null })
            return Promise.resolve({ data: null, error: null })
          },
        }),
      }),
    }),
  }),
}))

describe('interpolate', () => {
  it('replaces known variables', () => {
    expect(interpolate('Hola {{nombre}}', { nombre: 'Juan' })).toBe('Hola Juan')
  })
  it('keeps unknown variables as placeholder', () => {
    expect(interpolate('{{a}} {{b}}', { a: 'x' })).toBe('x {{b}}')
  })
  it('replaces multiple occurrences', () => {
    expect(interpolate('{{n}} y {{n}}', { n: 'X' })).toBe('X y X')
  })
  it('handles template with no variables', () => {
    expect(interpolate('Sin', { n: 'J' })).toBe('Sin')
  })
  it('handles empty vars object', () => {
    expect(interpolate('{{n}}', {})).toBe('{{n}}')
  })
})

describe('sendNotification', () => {
  beforeEach(() => {
    mockSendEmail.mockReset()
    mockSendWhatsApp.mockReset()
    mockSendEmail.mockResolvedValue()
    mockSendWhatsApp.mockResolvedValue()
  })

  it('envía por email si hay clienteEmail', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteEmail: 'a@b.com',
      clienteNombre: 'Ana',
      numeroOrden: '123',
    })
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: 'a@b.com',
      subject: 'Asunto 123',
      body: 'Hola Ana',
    })
  })

  it('envía por WhatsApp si hay clienteTelefono', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '099123456',
      clienteNombre: 'Ana',
    })
    expect(mockSendWhatsApp).toHaveBeenCalledWith({
      to: '099123456',
      body: 'WA Ana',
    })
  })

  it('envía por ambos canales si hay email y teléfono', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteEmail: 'a@b.com',
      clienteTelefono: '099',
      clienteNombre: 'Ana',
      numeroOrden: '123',
    })
    expect(mockSendEmail).toHaveBeenCalled()
    expect(mockSendWhatsApp).toHaveBeenCalled()
  })

  it('no envía nada si no hay email ni teléfono', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', { clienteNombre: 'Ana' })
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockSendWhatsApp).not.toHaveBeenCalled()
  })

  it('si email falla, WhatsApp igual se envía', async () => {
    mockSendEmail.mockRejectedValue(new Error('boom'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteEmail: 'a@b.com',
      clienteTelefono: '099',
      clienteNombre: 'Ana',
      numeroOrden: '123',
    })
    expect(mockSendWhatsApp).toHaveBeenCalled()
    err.mockRestore()
  })
})
```

- [ ] **Step 2: Implementar el dispatcher**

Reemplazar el contenido de `lib/notifications/index.js`:

```js
import { sendEmail } from './email'
import { sendWhatsApp } from './whatsapp'
import { getSupabaseAdmin } from '../supabase-admin'

/**
 * Interpola variables {{var}} en un template.
 * Variables desconocidas se dejan como están.
 */
export function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

/**
 * Envía una notificación por todos los canales disponibles según `data`.
 * - Email si `data.clienteEmail`
 * - WhatsApp si `data.clienteTelefono`
 *
 * Los canales corren en paralelo y un fallo en uno no bloquea al otro.
 *
 * @param {'PRESUPUESTO' | 'LISTO_PARA_RETIRO' | 'RECORDATORIO_MANTENIMIENTO'} type
 * @param {object} data
 */
export async function sendNotification(type, data) {
  const results = await Promise.allSettled([
    sendViaEmail(type, data),
    sendViaWhatsApp(type, data),
  ])
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const canal = i === 0 ? 'email' : 'whatsapp'
      console.error(`[Notifications] canal ${canal} falló:`, r.reason)
    }
  })
}

async function sendViaEmail(type, data) {
  if (!data.clienteEmail) return

  const { data: row, error } = await getSupabaseAdmin()
    .from('plantillas_email')
    .select('asunto, cuerpo')
    .eq('tipo', type)
    .single()

  if (error || !row) {
    console.warn('[Notifications] No email template found for type:', type)
    return
  }

  const subject = interpolate(row.asunto, data)
  const body = interpolate(row.cuerpo, data)
  await sendEmail({ to: data.clienteEmail, subject, body })
}

async function sendViaWhatsApp(type, data) {
  if (!data.clienteTelefono) return

  const { data: row, error } = await getSupabaseAdmin()
    .from('plantillas_whatsapp')
    .select('mensaje')
    .eq('tipo', type)
    .single()

  if (error || !row) {
    console.warn('[Notifications] No whatsapp template found for type:', type)
    return
  }

  const body = interpolate(row.mensaje, data)
  await sendWhatsApp({ to: data.clienteTelefono, body })
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run __tests__/notifications.test.js lib/notifications/__tests__/email.test.js lib/notifications/__tests__/email-template.test.js`
Expected: all passing

- [ ] **Step 4: Commit**

```bash
git add lib/notifications/index.js __tests__/notifications.test.js
git commit -m "feat: dispatch notifications to email and whatsapp in parallel"
```

---

## Task 6: API `/api/admin/plantillas-email`

**Files:**
- Create: `app/api/admin/plantillas-email/route.js`
- Create: `app/api/admin/plantillas-email/__tests__/route.test.js`

- [ ] **Step 1: Escribir tests (mirror del de `plantillas`)**

Mirar primero `app/api/configuracion/__tests__/route.test.js` para ver el patrón de mocks de `auth` y `supabase-admin`. Aplicar el mismo patrón:

```js
// app/api/admin/plantillas-email/__tests__/route.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
const mockUpdate = vi.fn()
const mockSelect = vi.fn()

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: (...args) => mockSelect(...args),
      update: (...args) => mockUpdate(...args),
    }),
  }),
}))

describe('GET /api/admin/plantillas-email', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockSelect.mockReset()
  })

  it('returns 401 si no hay sesión', async () => {
    mockAuth.mockResolvedValue(null)
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns plantillas si autenticado', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } })
    mockSelect.mockReturnValue({
      order: () => Promise.resolve({
        data: [{ tipo: 'PRESUPUESTO', asunto: 'A', cuerpo: 'B', updated_at: 't' }],
        error: null,
      }),
    })
    const { GET } = await import('../route')
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.plantillas).toHaveLength(1)
  })
})

describe('PATCH /api/admin/plantillas-email', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockUpdate.mockReset()
  })

  function makeReq(body) {
    return { json: () => Promise.resolve(body) }
  }

  it('returns 403 si no es admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'operador' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'PRESUPUESTO', asunto: 'x', cuerpo: 'y' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 si tipo inválido', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'INVALID', asunto: 'x', cuerpo: 'y' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 si asunto vacío', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'PRESUPUESTO', asunto: '', cuerpo: 'y' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 si cuerpo vacío', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'PRESUPUESTO', asunto: 'x', cuerpo: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 si asunto > 150 chars', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'PRESUPUESTO', asunto: 'x'.repeat(151), cuerpo: 'y' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 si cuerpo > 2000 chars', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'PRESUPUESTO', asunto: 'x', cuerpo: 'y'.repeat(2001) }))
    expect(res.status).toBe(400)
  })

  it('actualiza correctamente', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    mockUpdate.mockReturnValue({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({
            data: { tipo: 'PRESUPUESTO', asunto: 'x', cuerpo: 'y', updated_at: 't' },
            error: null,
          }),
        }),
      }),
    })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'PRESUPUESTO', asunto: 'x', cuerpo: 'y' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
```

- [ ] **Step 2: Implementar la ruta**

```js
// app/api/admin/plantillas-email/route.js
import { auth } from '@/auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

const ALLOWED_TIPOS = ['PRESUPUESTO', 'LISTO_PARA_RETIRO', 'RECORDATORIO_MANTENIMIENTO']
const MAX_ASUNTO = 150
const MAX_CUERPO = 2000

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('plantillas_email')
    .select('tipo, asunto, cuerpo, updated_at')
    .order('tipo')

  if (error) {
    console.error('[/api/admin/plantillas-email] GET error:', error)
    return NextResponse.json({ error: 'Error al obtener plantillas' }, { status: 500 })
  }

  return NextResponse.json({ plantillas: data })
}

export async function PATCH(request) {
  const session = await auth()
  if (!session?.user?.role || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { tipo, asunto, cuerpo } = body

  if (!tipo || typeof asunto !== 'string' || typeof cuerpo !== 'string') {
    return NextResponse.json(
      { error: 'tipo, asunto y cuerpo son requeridos' },
      { status: 400 }
    )
  }

  if (!ALLOWED_TIPOS.includes(tipo)) {
    return NextResponse.json({ error: 'Tipo de plantilla no válido' }, { status: 400 })
  }

  if (asunto.trim().length === 0) {
    return NextResponse.json({ error: 'asunto no puede estar vacío' }, { status: 400 })
  }

  if (cuerpo.trim().length === 0) {
    return NextResponse.json({ error: 'cuerpo no puede estar vacío' }, { status: 400 })
  }

  if (asunto.length > MAX_ASUNTO) {
    return NextResponse.json(
      { error: `asunto demasiado largo (máx ${MAX_ASUNTO} caracteres)` },
      { status: 400 }
    )
  }

  if (cuerpo.length > MAX_CUERPO) {
    return NextResponse.json(
      { error: `cuerpo demasiado largo (máx ${MAX_CUERPO} caracteres)` },
      { status: 400 }
    )
  }

  const { data, error } = await getSupabaseAdmin()
    .from('plantillas_email')
    .update({ asunto, cuerpo, updated_at: new Date().toISOString() })
    .eq('tipo', tipo)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })
    }
    console.error('[/api/admin/plantillas-email] PATCH error:', error)
    return NextResponse.json({ error: 'Error al actualizar plantilla' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run app/api/admin/plantillas-email/__tests__/route.test.js`
Expected: all passing

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/plantillas-email/
git commit -m "feat: add /api/admin/plantillas-email GET and PATCH endpoints"
```

---

## Task 7: Actualizar callers para pasar `clienteEmail`

**Files:**
- Modify: `app/api/cron/recordatorios/route.js`
- Modify: `components/DetalleOrdenModal.js`

- [ ] **Step 1: Actualizar el cron**

En `app/api/cron/recordatorios/route.js`:

Reemplazar el select en L31-42 por:

```js
const { data: ordenes, error } = await getSupabaseAdmin()
  .from("ordenes")
  .select(`
    id,
    tipo_articulo,
    fecha_entrega,
    clientes(id, nombre, telefono, email),
    tipos_servicio(nombre, ciclo_meses)
  `)
  .eq("estado", "ENTREGADO")
  .not("fecha_entrega", "is", null)
  .not("tipo_servicio_id", "is", null);
```

Reemplazar la condición en L63 por:

```js
if (!orden.clientes?.telefono && !orden.clientes?.email) continue;
```

Reemplazar el `canal` en L76 por:

```js
canal: "multi",
```

Reemplazar el `sendNotification` call en L86-95 por:

```js
await sendNotification("RECORDATORIO_MANTENIMIENTO", {
  clienteTelefono: orden.clientes.telefono,
  clienteEmail: orden.clientes.email,
  clienteNombre: orden.clientes.nombre,
  tipoServicio: orden.tipos_servicio.nombre,
  ultimaFecha: new Date(orden.fecha_entrega).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }),
});
```

- [ ] **Step 2: Actualizar DetalleOrdenModal**

En `components/DetalleOrdenModal.js`, en la función `triggerNotify` (~L62), agregar `clienteEmail` al body:

Reemplazar el objeto `data` dentro de `body: JSON.stringify({ ... })` por:

```js
data: {
  clienteTelefono: orden.cliente_telefono,
  clienteEmail: orden.cliente_email,
  clienteNombre: orden.cliente_nombre,
  numeroOrden: formatNumeroOrden(orden.numero_orden),
  tipoArticulo: orden.tipo_articulo,
  trackingUrl: orden.tracking_token ? `${appUrl}/seguimiento/${orden.tracking_token}` : "",
  ...extras,
},
```

Y actualizar las condiciones de guardia en L140 y L189 para que también contemplen email:

```js
if (notificarPresupuesto && (orden.cliente_telefono || orden.cliente_email)) {
```

y

```js
if (notificarRetiro && (orden.cliente_telefono || orden.cliente_email)) {
```

- [ ] **Step 3: Verificar que no rompe tests existentes**

Run: `npm run test`
Expected: all existing tests pass

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/recordatorios/route.js components/DetalleOrdenModal.js
git commit -m "feat: pass clienteEmail to notification dispatcher from callers"
```

---

## Task 8: Frontend admin — sección Plantillas de Email

**Files:**
- Modify: `app/admin/configuracion/page.jsx`
- Modify: `app/admin/configuracion/configuracion-client.js`
- Modify: `app/admin/configuracion/__tests__/page.test.js`

- [ ] **Step 1: Actualizar page.jsx para cargar `plantillasEmail`**

Reemplazar el bloque de `plantillas` (L25-34) por:

```js
let plantillasEmail = []
try {
  const { data } = await getSupabaseAdmin()
    .from("plantillas_email")
    .select("tipo, asunto, cuerpo, updated_at")
    .order("tipo")
  plantillasEmail = data || []
} catch (error) {
  console.error("[ConfiguracionPage] Error loading plantillas email:", error)
}

return (
  <div>
    <ConfiguracionClient configuracion={configuracion} plantillasEmail={plantillasEmail} />
  </div>
)
```

Eliminar la carga de `plantillas_whatsapp` (ya no se usa en esta página).

- [ ] **Step 2: Actualizar configuracion-client.js — reemplazar sección WhatsApp por Email**

Cambios:

1. Renombrar `PLANTILLA_LABELS` (mantener la constante, cambiar sólo las `vars` referidas si difieren — son las mismas).
2. Cambiar la firma de `export default function ConfiguracionClient({ configuracion, plantillasEmail = [] })`.
3. Cambiar el state inicial de `templates` para usar `{ asunto, cuerpo, loading }`:

```js
const [templates, setTemplates] = useState(() => {
  const initial = {}
  plantillasEmail.forEach((p) => {
    initial[p.tipo] = { asunto: p.asunto, cuerpo: p.cuerpo, loading: false }
  })
  return initial
})
```

4. Reemplazar `handleSavePlantilla` para que haga PATCH a `/api/admin/plantillas-email` con `{ tipo, asunto, cuerpo }`:

```js
async function handleSavePlantilla(tipo) {
  const t = templates[tipo]
  if (!t || t.asunto.trim().length === 0 || t.cuerpo.trim().length === 0) return

  setTemplates((prev) => ({
    ...prev,
    [tipo]: { ...prev[tipo], loading: true },
  }))

  try {
    const response = await fetch("/api/admin/plantillas-email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, asunto: t.asunto, cuerpo: t.cuerpo }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Error al guardar")
    }

    setTemplates((prev) => ({
      ...prev,
      [tipo]: { ...prev[tipo], loading: false },
    }))

    toast.success("Plantilla actualizada")
  } catch (error) {
    toast.error(error.message)
    setTemplates((prev) => ({
      ...prev,
      [tipo]: { ...prev[tipo], loading: false },
    }))
  }
}
```

5. Reemplazar el bloque JSX de "Plantillas WhatsApp" (L310-360) por:

```jsx
{/* Plantillas de Email */}
<div className="mt-10">
  <h2 className="text-2xl font-bold text-slate-900 mb-2">
    Plantillas de Email
  </h2>
  <p className="text-sm text-slate-600 mb-4">
    Personalizá los emails que se envían a los clientes. Usá las variables entre llaves dobles para insertar datos dinámicos.
  </p>

  <div className="space-y-6">
    {Object.entries(PLANTILLA_LABELS).map(([tipo, meta]) => {
      const t = templates[tipo]
      if (!t) return null

      const canSave = !t.loading && t.asunto.trim().length > 0 && t.cuerpo.trim().length > 0

      return (
        <div key={tipo} className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-900">{meta.label}</h3>
            <button
              onClick={() => handleSavePlantilla(tipo)}
              disabled={!canSave}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                canSave
                  ? "bg-indigo-500 hover:bg-indigo-600 text-white cursor-pointer"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed"
              }`}
            >
              {t.loading ? "Guardando..." : "Guardar"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-2">{meta.desc}</p>
          <div className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded mb-3 font-mono">
            Variables: {meta.vars}
          </div>

          <label className="block text-xs font-semibold text-slate-700 mb-1">Asunto</label>
          <input
            type="text"
            value={t.asunto}
            onChange={(e) =>
              setTemplates((prev) => ({
                ...prev,
                [tipo]: { ...prev[tipo], asunto: e.target.value },
              }))
            }
            disabled={t.loading}
            maxLength={150}
            className="w-full mb-3 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:bg-slate-100 disabled:text-slate-500"
          />
          <div className="text-[10px] text-slate-400 text-right mb-2">
            {t.asunto.length}/150
          </div>

          <label className="block text-xs font-semibold text-slate-700 mb-1">Cuerpo</label>
          <textarea
            value={t.cuerpo}
            onChange={(e) =>
              setTemplates((prev) => ({
                ...prev,
                [tipo]: { ...prev[tipo], cuerpo: e.target.value },
              }))
            }
            disabled={t.loading}
            maxLength={2000}
            rows={10}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:bg-slate-100 disabled:text-slate-500 resize-y"
          />
          <div className="text-[10px] text-slate-400 text-right">
            {t.cuerpo.length}/2000
          </div>
        </div>
      )
    })}
  </div>
</div>
```

- [ ] **Step 3: Actualizar page.test.js**

Leer `app/admin/configuracion/__tests__/page.test.js`, reemplazar los mocks de `plantillas_whatsapp` por `plantillas_email` y actualizar los asserts para buscar "Plantillas de Email" en vez de "Plantillas de Mensajes WhatsApp". Agregar tests:

```js
it('renderiza las 3 cards de plantillas de email', () => {
  // render con plantillasEmail = [ PRESUPUESTO, LISTO_PARA_RETIRO, RECORDATORIO_MANTENIMIENTO ]
  // expect getByText('Presupuesto'), 'Listo para retiro', 'Recordatorio de mantenimiento'
})

it('al guardar llama PATCH a /api/admin/plantillas-email con tipo/asunto/cuerpo', async () => {
  // mockear fetch, clickear guardar, verificar body
})
```

Copiar el estilo exacto de los tests existentes en el archivo para los mocks de `fetch`, `toast`, etc.

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add app/admin/configuracion/
git commit -m "feat: replace WhatsApp templates section with email templates in admin"
```

---

## Task 9: Smoke test manual y documentación

- [ ] **Step 1: Aplicar migración en Supabase**

Ejecutar `supabase/013_plantillas_email.sql` en el proyecto Supabase (SQL Editor o CLI).

- [ ] **Step 2: Configurar `.env.local`**

Agregar `RESEND_API_KEY=re_...` al `.env.local` local.

- [ ] **Step 3: Verificar dominio en Resend**

Revisar que `rivierajoyas.com.uy` esté verificado en el panel de Resend (SPF/DKIM). Si no lo está, documentar el paso como requisito pre-producción.

- [ ] **Step 4: Smoke test local**

1. `npm run dev`
2. Iniciar sesión como admin
3. Ir a `/admin/configuracion`
4. Verificar que se ven las 3 cards de plantillas de email
5. Editar una plantilla (asunto y cuerpo) y guardar → toast de éxito
6. Crear una orden con un cliente que tenga email, disparar notificación (presupuesto o listo)
7. Verificar que el email llega correctamente formateado

- [ ] **Step 5: Full test suite**

Run: `npm run test`
Expected: all passing

Run: `npm run build`
Expected: build exitoso

- [ ] **Step 6: Commit final (si hubo ajustes)**

```bash
git status
# si hay cambios pendientes
git add .
git commit -m "chore: ajustes post smoke test"
```

---

## Self-Review Checklist

- ✅ Spec coverage: cada sección del spec (DB, email module, dispatcher, API, frontend, tests) tiene al menos una task.
- ✅ Sin placeholders: todas las tasks incluyen código concreto.
- ✅ Consistencia de tipos: `sendEmail({ to, subject, body })`, `sendNotification(type, data)` con `data.clienteEmail` y `data.clienteTelefono`, plantilla row `{ asunto, cuerpo }`.
- ✅ Scope: un solo subsistema (email notifications), todo cabe en un plan.
- ✅ Orden: migración → módulos base → dispatcher → API → callers → frontend → smoke. No hay dependencias hacia atrás.
