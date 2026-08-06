# WhatsApp Meta Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the WhatsApp Meta Cloud API integration — webhook, template-based sending, delivery tracking.

**Architecture:** Add a webhook route for Meta verification and status callbacks. Change `sendWhatsApp()` from free-text to template-based messages. Add a DB table mapping notification types to Meta template names/params. Extend `notificaciones_enviadas` with delivery status tracking.

**Tech Stack:** Next.js 14 (App Router), Supabase (PostgreSQL), Meta Cloud API v20.0, Vitest

**Spec:** `docs/superpowers/specs/2026-05-26-whatsapp-meta-integration-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/028_whatsapp_meta_templates.sql` | Create | Table `plantillas_whatsapp_meta` + seed data |
| `supabase/029_notificaciones_estado.sql` | Create | Add `wa_message_id` and `estado` columns to `notificaciones_enviadas` |
| `lib/notifications/whatsapp.js` | Modify | Switch from text to template API, return `wa_message_id` |
| `lib/notifications/index.js` | Modify | Read from `plantillas_whatsapp_meta`, build positional params |
| `app/api/webhook/whatsapp/route.js` | Create | GET verification + POST status updates |
| `__tests__/whatsapp.test.js` | Create | Tests for `sendWhatsApp()` template sending |
| `__tests__/webhook-whatsapp.test.js` | Create | Tests for webhook GET/POST |
| `__tests__/notifications.test.js` | Modify | Update mock to match new `sendWhatsApp` signature |
| `.env.example` | Modify | Add `WHATSAPP_VERIFY_TOKEN` |

---

### Task 1: Database migrations

**Files:**
- Create: `supabase/028_whatsapp_meta_templates.sql`
- Create: `supabase/029_notificaciones_estado.sql`

- [ ] **Step 1: Create `plantillas_whatsapp_meta` migration**

Create `supabase/028_whatsapp_meta_templates.sql`:

```sql
-- Mapeo entre tipos de notificación y Message Templates de Meta
CREATE TABLE IF NOT EXISTS plantillas_whatsapp_meta (
  tipo TEXT PRIMARY KEY,
  template_name TEXT NOT NULL,
  language_code TEXT NOT NULL DEFAULT 'es_AR',
  param_keys TEXT[] NOT NULL
);

INSERT INTO plantillas_whatsapp_meta (tipo, template_name, language_code, param_keys) VALUES
  ('PRESUPUESTO', 'presupuesto_listo', 'es_AR', '{clienteNombre,numeroOrden,tipoArticulo,moneda,monto}'),
  ('LISTO_PARA_RETIRO', 'listo_para_retiro', 'es_AR', '{clienteNombre,numeroOrden,tipoArticulo}'),
  ('RECORDATORIO_MANTENIMIENTO', 'recordatorio_mantenimiento', 'es_AR', '{clienteNombre,tipoServicio,ultimaFecha}')
ON CONFLICT (tipo) DO NOTHING;

ALTER TABLE plantillas_whatsapp_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read plantillas_meta"
  ON plantillas_whatsapp_meta FOR SELECT
  TO authenticated
  USING (true);
```

- [ ] **Step 2: Create `notificaciones_enviadas` migration**

Create `supabase/029_notificaciones_estado.sql`:

```sql
-- Agregar tracking de estado de entrega de WhatsApp
ALTER TABLE notificaciones_enviadas
  ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_notificaciones_wa_message_id
  ON notificaciones_enviadas(wa_message_id)
  WHERE wa_message_id IS NOT NULL;
```

- [ ] **Step 3: Run migrations on Supabase**

Run both SQL files via Supabase Dashboard > SQL Editor or MCP tool. Verify:

```sql
SELECT * FROM plantillas_whatsapp_meta;
-- Expected: 3 rows (PRESUPUESTO, LISTO_PARA_RETIRO, RECORDATORIO_MANTENIMIENTO)

SELECT column_name FROM information_schema.columns
WHERE table_name = 'notificaciones_enviadas' AND column_name IN ('wa_message_id', 'estado');
-- Expected: 2 rows
```

- [ ] **Step 4: Commit**

```bash
git add supabase/028_whatsapp_meta_templates.sql supabase/029_notificaciones_estado.sql
git commit -m "feat: add WhatsApp Meta template mapping and delivery status tracking"
```

---

### Task 2: Rewrite `sendWhatsApp()` to use templates

**Files:**
- Modify: `lib/notifications/whatsapp.js`
- Create: `__tests__/whatsapp.test.js`

- [ ] **Step 1: Write failing tests for template-based sending**

Create `__tests__/whatsapp.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Save original env
const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.WHATSAPP_TOKEN = 'test-token'
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456'
})

afterEach(() => {
  process.env = { ...originalEnv }
  vi.restoreAllMocks()
})

describe('sendWhatsApp', () => {
  it('sends a template message with correct payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: 'wamid.abc123' }] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { sendWhatsApp } = await import('@/lib/notifications/whatsapp')

    const result = await sendWhatsApp({
      to: '+54 9 11 1234-5678',
      templateName: 'presupuesto_listo',
      languageCode: 'es_AR',
      parameters: ['Juan', '1234', 'Reloj', 'UYU', '3500'],
    })

    expect(result).toBe('wamid.abc123')

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v20.0/123456/messages')
    expect(options.headers.Authorization).toBe('Bearer test-token')

    const body = JSON.parse(options.body)
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '5491112345678',
      type: 'template',
      template: {
        name: 'presupuesto_listo',
        language: { code: 'es_AR' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: 'Juan' },
            { type: 'text', text: '1234' },
            { type: 'text', text: 'Reloj' },
            { type: 'text', text: 'UYU' },
            { type: 'text', text: '3500' },
          ],
        }],
      },
    })
  })

  it('returns null when phone is missing', async () => {
    const { sendWhatsApp } = await import('@/lib/notifications/whatsapp')
    const result = await sendWhatsApp({ to: '', templateName: 'test', languageCode: 'es_AR', parameters: [] })
    expect(result).toBeNull()
  })

  it('returns null when env vars are missing', async () => {
    delete process.env.WHATSAPP_TOKEN
    const { sendWhatsApp } = await import('@/lib/notifications/whatsapp')
    const result = await sendWhatsApp({ to: '099123456', templateName: 'test', languageCode: 'es_AR', parameters: [] })
    expect(result).toBeNull()
  })

  it('throws on API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { code: 100 } }),
    }))
    const { sendWhatsApp } = await import('@/lib/notifications/whatsapp')
    await expect(
      sendWhatsApp({ to: '5491112345678', templateName: 'test', languageCode: 'es_AR', parameters: [] })
    ).rejects.toThrow('WhatsApp API error 400')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/whatsapp.test.js`
Expected: FAIL — `sendWhatsApp` still expects `{ to, body }` signature.

- [ ] **Step 3: Rewrite `sendWhatsApp()` implementation**

Replace the entire contents of `lib/notifications/whatsapp.js`:

```js
// lib/notifications/whatsapp.js

/**
 * Normaliza un número de teléfono al formato internacional sin + ni espacios.
 * Ej: "+54 9 11 1234-5678" → "5491112345678"
 */
function normalizePhone(raw) {
  return raw.replace(/\D/g, "");
}

/**
 * Envía un mensaje de WhatsApp via Meta Cloud API usando Message Templates.
 * @param {object} opts
 * @param {string} opts.to - Número del destinatario (cualquier formato, se normaliza)
 * @param {string} opts.templateName - Nombre del template en Meta Business Manager
 * @param {string} opts.languageCode - Código de idioma (ej: "es_AR")
 * @param {string[]} opts.parameters - Parámetros posicionales del template body
 * @returns {Promise<string|null>} wa_message_id o null si no se envió
 */
export async function sendWhatsApp({ to, templateName, languageCode, parameters }) {
  if (!to) return null;

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.warn("[WhatsApp] WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados");
    return null;
  }

  const phone = normalizePhone(to);

  if (phone.length < 10) {
    console.warn("[WhatsApp] Número inválido (< 10 dígitos):", phone.length, "dígitos");
    return null;
  }

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [{
            type: "body",
            parameters: parameters.map((text) => ({ type: "text", text })),
          }],
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[WhatsApp] Error al enviar:", {
      status: res.status,
      errorCode: err?.error?.code,
    });
    throw new Error(`WhatsApp API error ${res.status}`);
  }

  const data = await res.json();
  return data.messages?.[0]?.id ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/whatsapp.test.js`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/whatsapp.js __tests__/whatsapp.test.js
git commit -m "feat: rewrite sendWhatsApp to use Meta Message Templates"
```

---

### Task 3: Update `sendViaWhatsApp()` in notification orchestrator

**Files:**
- Modify: `lib/notifications/index.js`
- Modify: `__tests__/notifications.test.js`

- [ ] **Step 1: Update the test mock and assertions**

Replace the full contents of `__tests__/notifications.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { interpolate } from '@/lib/notifications'

// Mocks
const mockSendEmail = vi.fn()
const mockSendWhatsApp = vi.fn()

vi.mock('@/lib/notifications/email', () => ({
  sendEmail: (...args) => mockSendEmail(...args),
}))
vi.mock('@/lib/notifications/whatsapp', () => ({
  sendWhatsApp: (...args) => mockSendWhatsApp(...args),
}))

// Mock Supabase admin
const mockEmailRow = { asunto: 'Asunto {{numeroOrden}}', cuerpo: 'Hola {{clienteNombre}}' }
const mockMetaRow = {
  template_name: 'presupuesto_listo',
  language_code: 'es_AR',
  param_keys: ['clienteNombre', 'numeroOrden', 'tipoArticulo', 'moneda', 'monto'],
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table) => ({
      select: (cols) => ({
        eq: () => ({
          single: () => {
            if (table === 'plantillas_email') return Promise.resolve({ data: mockEmailRow, error: null })
            if (table === 'plantillas_whatsapp_meta') return Promise.resolve({ data: mockMetaRow, error: null })
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
    mockSendWhatsApp.mockResolvedValue('wamid.abc123')
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

  it('envía por WhatsApp con template y parámetros posicionales', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '099123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(mockSendWhatsApp).toHaveBeenCalledWith({
      to: '099123456',
      templateName: 'presupuesto_listo',
      languageCode: 'es_AR',
      parameters: ['Ana', '123', 'Reloj', 'UYU', '3500'],
    })
  })

  it('envía por ambos canales si hay email y teléfono', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteEmail: 'a@b.com',
      clienteTelefono: '099',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
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
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(mockSendWhatsApp).toHaveBeenCalled()
    err.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/notifications.test.js`
Expected: FAIL — `sendViaWhatsApp` still reads from `plantillas_whatsapp` and calls `sendWhatsApp({ to, body })`.

- [ ] **Step 3: Update `sendViaWhatsApp()` in `lib/notifications/index.js`**

Replace the `sendViaWhatsApp` function (lines 55-71) with:

```js
async function sendViaWhatsApp(type, data) {
  if (!data.clienteTelefono) return

  const { data: row, error } = await getSupabaseAdmin()
    .from('plantillas_whatsapp_meta')
    .select('template_name, language_code, param_keys')
    .eq('tipo', type)
    .single()

  if (error || !row) {
    console.warn('[Notifications] No Meta template mapping found for type:', type)
    return
  }

  const parameters = row.param_keys.map((key) => String(data[key] ?? ''))

  return await sendWhatsApp({
    to: data.clienteTelefono,
    templateName: row.template_name,
    languageCode: row.language_code,
    parameters,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/notifications.test.js`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/index.js __tests__/notifications.test.js
git commit -m "feat: sendViaWhatsApp reads Meta template mapping and sends positional params"
```

---

### Task 4: Webhook endpoint for Meta verification and status updates

**Files:**
- Create: `app/api/webhook/whatsapp/route.js`
- Create: `__tests__/webhook-whatsapp.test.js`

- [ ] **Step 1: Write failing tests for the webhook**

Create `__tests__/webhook-whatsapp.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const originalEnv = { ...process.env }

const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (...args) => mockUpdate(...args),
    }),
  }),
}))

beforeEach(() => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'my-secret-token'
  mockUpdate.mockClear()
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('GET /api/webhook/whatsapp — verification', () => {
  it('returns challenge when verify token matches', async () => {
    const { GET } = await import('@/app/api/webhook/whatsapp/route')
    const url = new URL('http://localhost/api/webhook/whatsapp')
    url.searchParams.set('hub.mode', 'subscribe')
    url.searchParams.set('hub.verify_token', 'my-secret-token')
    url.searchParams.set('hub.challenge', 'challenge_abc')

    const res = await GET(new Request(url.toString()))
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toBe('challenge_abc')
  })

  it('returns 403 when verify token does not match', async () => {
    const { GET } = await import('@/app/api/webhook/whatsapp/route')
    const url = new URL('http://localhost/api/webhook/whatsapp')
    url.searchParams.set('hub.mode', 'subscribe')
    url.searchParams.set('hub.verify_token', 'wrong-token')
    url.searchParams.set('hub.challenge', 'challenge_abc')

    const res = await GET(new Request(url.toString()))
    expect(res.status).toBe(403)
  })

  it('returns 403 when hub.mode is not subscribe', async () => {
    const { GET } = await import('@/app/api/webhook/whatsapp/route')
    const url = new URL('http://localhost/api/webhook/whatsapp')
    url.searchParams.set('hub.mode', 'unsubscribe')
    url.searchParams.set('hub.verify_token', 'my-secret-token')
    url.searchParams.set('hub.challenge', 'challenge_abc')

    const res = await GET(new Request(url.toString()))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/webhook/whatsapp — status updates', () => {
  it('updates notificaciones_enviadas on delivered status', async () => {
    const { POST } = await import('@/app/api/webhook/whatsapp/route')

    const payload = {
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: 'wamid.abc123',
              status: 'delivered',
              timestamp: '1234567890',
            }],
          },
        }],
      }],
    }

    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      estado: 'delivered',
      enviado: true,
    })
  })

  it('marks as failed with error message', async () => {
    const { POST } = await import('@/app/api/webhook/whatsapp/route')

    const payload = {
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: 'wamid.abc123',
              status: 'failed',
              timestamp: '1234567890',
              errors: [{ title: 'Message undeliverable' }],
            }],
          },
        }],
      }],
    }

    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      estado: 'failed',
      enviado: false,
      error: 'Message undeliverable',
    })
  })

  it('always returns 200 even on malformed payload', async () => {
    const { POST } = await import('@/app/api/webhook/whatsapp/route')
    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/webhook-whatsapp.test.js`
Expected: FAIL — route file does not exist.

- [ ] **Step 3: Create the webhook route**

Create `app/api/webhook/whatsapp/route.js`:

```js
// app/api/webhook/whatsapp/route.js
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

/**
 * GET — Meta webhook verification.
 * Meta sends hub.mode, hub.verify_token, hub.challenge as query params.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

/**
 * POST — Meta status updates (sent, delivered, read, failed).
 * Always returns 200 — Meta retries on other status codes.
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const entries = body.entry ?? []

    for (const entry of entries) {
      const changes = entry.changes ?? []
      for (const change of changes) {
        const statuses = change.value?.statuses ?? []
        for (const status of statuses) {
          await processStatus(status)
        }
      }
    }
  } catch (e) {
    console.error("[Webhook WhatsApp] Error processing payload:", e)
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}

const STATUS_MAP = {
  sent: { estado: "sent", enviado: true },
  delivered: { estado: "delivered", enviado: true },
  read: { estado: "read", enviado: true },
  failed: { estado: "failed", enviado: false },
}

async function processStatus(status) {
  const mapping = STATUS_MAP[status.status]
  if (!mapping) return

  const updateData = { ...mapping }

  if (status.status === "failed") {
    updateData.error = status.errors?.[0]?.title ?? "Unknown error"
  }

  const { error } = await getSupabaseAdmin()
    .from("notificaciones_enviadas")
    .update(updateData)
    .eq("wa_message_id", status.id)

  if (error) {
    console.error("[Webhook WhatsApp] Error updating notification:", error)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/webhook-whatsapp.test.js`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/webhook/whatsapp/route.js __tests__/webhook-whatsapp.test.js
git commit -m "feat: add WhatsApp webhook for Meta verification and delivery status tracking"
```

---

### Task 5: Update `.env.example` and run full test suite

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add `WHATSAPP_VERIFY_TOKEN` to `.env.example`**

Add after the existing WhatsApp section in `.env.example`:

```
# WhatsApp Webhook (string arbitrario, debe coincidir con el configurado en Meta)
WHATSAPP_VERIFY_TOKEN=tu-verify-token-aqui
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (including existing tests in `__tests__/cron.test.js` and any others).

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add WHATSAPP_VERIFY_TOKEN to .env.example"
```

---

### Task 6: Manual integration verification

This task is NOT code — it's the steps to wire everything up in Meta and Vercel.

- [ ] **Step 1: Set env vars in Vercel**

In Vercel Dashboard → Project → Settings → Environment Variables, add:
```
WHATSAPP_VERIFY_TOKEN=<the string you chose>
```

- [ ] **Step 2: Deploy to Vercel**

Push to main or trigger a deploy. Wait for it to complete.

- [ ] **Step 3: Configure webhook in Meta**

In Meta for Developers → tu app → WhatsApp → Configuration:
1. Callback URL: `https://<tu-dominio>/api/webhook/whatsapp`
2. Verify token: the same string you set in `WHATSAPP_VERIFY_TOKEN`
3. Click "Verify and Save"
4. Subscribe to: `messages` (required by Meta, includes status updates)

Expected: Meta sends a GET to your endpoint, receives the challenge back, shows "Verified".

- [ ] **Step 4: Create Message Templates in Meta**

In Meta Business Manager → WhatsApp Manager → Message Templates:

Create 3 templates (Category: Utility, Language: Spanish (Argentina)):

**Template 1: `presupuesto_listo`**
```
Hola {{1}} — tenemos el presupuesto listo para tu artículo.
Orden: #{{2}} | Artículo: {{3}} | Presupuesto: {{4}} {{5}}
Avisanos si querés continuar con la reparación.
```
Sample values: `{{1}}=Juan, {{2}}=1234, {{3}}=Reloj, {{4}}=UYU, {{5}}=3500`

**Template 2: `listo_para_retiro`**
```
Hola {{1}} — tu artículo está listo para retirar.
Orden: #{{2}} | Artículo: {{3}}
Podés pasar a buscarlo cuando quieras. ¡Gracias por confiar en nosotros!
```
Sample values: `{{1}}=Juan, {{2}}=1234, {{3}}=Reloj`

**Template 3: `recordatorio_mantenimiento`**
```
Hola {{1}} — te recordamos que es momento de hacer el mantenimiento de tu artículo.
Servicio recomendado: {{2}} | Último servicio: {{3}}
Comunicate con nosotros para coordinar la revisión.
```
Sample values: `{{1}}=Juan, {{2}}=Cambio de pila, {{3}}=15 de enero de 2026`

Wait for approval (usually minutes for UTILITY category).

- [ ] **Step 5: Create permanent System User Token**

1. Go to Meta Business Manager → Business Settings → System Users
2. Click "Add" → name it "RepairTracker API" → role "Admin"
3. Click "Add Assets" → select your WhatsApp Business app → enable `whatsapp_business_messaging`
4. Click "Generate New Token" → select the app → check `whatsapp_business_messaging`
5. Copy the token
6. In Vercel, update `WHATSAPP_TOKEN` with this permanent token
7. Redeploy

- [ ] **Step 6: Send a test notification**

From the app, open an order → register a budget with "Notificar al cliente" checked. Verify:
1. The WhatsApp message arrives using the template format
2. In Supabase, check `notificaciones_enviadas` — the row should have a `wa_message_id`
3. After a few seconds, the `estado` column should update to `delivered` or `read`
