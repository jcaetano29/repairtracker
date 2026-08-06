# Remove Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove email as a notification channel (UI + code), leaving WhatsApp as the only channel. Phone becomes required, email becomes optional on the client form.

**Architecture:** Trim `lib/notifications/index.js` from a dual-channel `Promise.allSettled` dispatcher to a single-channel pass-through to `sendViaWhatsApp`. Delete `lib/notifications/email.js`, `email-template.js`, and the admin "plantillas de email" API + UI. Keep the DB schema (`plantillas_email` table, `cliente_email` column) untouched for rollback safety.

**Tech Stack:** Next.js 14 App Router, JavaScript, Vitest, Supabase, Resend (being removed).

**Reference spec:** `docs/superpowers/specs/2026-06-13-email-notifications-removal-design.md`

---

## File Structure

### Files to delete
- `lib/notifications/email.js` — Resend wrapper
- `lib/notifications/email-template.js` — HTML email template (only used by email.js)
- `lib/notifications/__tests__/email.test.js` — tests for the deleted file
- `app/api/admin/plantillas-email/route.js` — admin API for email templates

### Files to modify
- `lib/notifications/index.js` — drop `sendViaEmail`, drop `Promise.allSettled`, drop `interpolate()` export
- `__tests__/notifications.test.js` — remove email-related cases, add backward-compat case
- `app/api/cron/recordatorios/route.js` — phone-only guard, drop `email` from select and payload, change `canal: "multi"` → `"whatsapp"`
- `app/api/traslados/route.js` — switch guard from `cliente_email` to `cliente_telefono`, drop `clienteEmail` from payload, add `clienteTelefono`
- `components/DetalleOrdenModal.js` — drop fetch to plantillas-email, drop preview block, drop `clienteEmail` from `triggerNotify`, simplify guards, change checkbox label, fix outdated comment
- `components/NuevoIngresoModal.js` — email optional, phone required visually, update recordatorio text
- `app/admin/configuracion/page.jsx` — drop `plantillas_email` query and `plantillasEmail` prop
- `app/admin/configuracion/configuracion-client.js` — drop `PLANTILLA_LABELS`, `templates` state, `handleSavePlantilla`, the email templates JSX section, and the `plantillasEmail` prop
- `app/admin/configuracion/__tests__/page.test.js` — adapt if it asserts email templates rendering
- `.env.example` — drop `RESEND_API_KEY` line

### Files NOT touched
- `lib/notifications/whatsapp.js` (and its test)
- `app/api/webhook/whatsapp/route.js` (and its test)
- `lib/notifications/reminder-logic.js`
- `app/api/notify/route.js` — the route accepts `clienteEmail` silently; `sendNotification` now ignores it. Zero changes.
- DB schema (tables `plantillas_email`, column `cliente_email` stay)
- `package.json` — `resend` dependency stays for this PR (user removes manually post-merge per spec)

---

## Task 1: Update `__tests__/notifications.test.js` for single-channel contract (TDD)

**Files:**
- Modify: `__tests__/notifications.test.js`

Failing-test-first for the simplified `sendNotification` and removed `interpolate` export.

- [ ] **Step 1: Replace the test file contents**

Open `__tests__/notifications.test.js` and replace the ENTIRE contents with:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks
const mockSendWhatsApp = vi.fn()

vi.mock('@/lib/notifications/whatsapp', () => ({
  sendWhatsApp: (...args) => mockSendWhatsApp(...args),
}))

// Mock Supabase admin — only plantillas_whatsapp_meta is queried now
const mockMetaRow = {
  template_name: 'presupuesto_ready',
  language_code: 'en',
  param_keys: ['clienteNombre', 'numeroOrden', 'tipoArticulo', 'moneda', 'monto'],
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: () => {
            if (table === 'plantillas_whatsapp_meta') {
              return Promise.resolve({ data: mockMetaRow, error: null })
            }
            return Promise.resolve({ data: null, error: null })
          },
        }),
      }),
    }),
  }),
}))

describe('sendNotification', () => {
  beforeEach(() => {
    mockSendWhatsApp.mockReset()
    mockSendWhatsApp.mockResolvedValue('wamid.abc123')
  })

  it('envía por WhatsApp si hay clienteTelefono', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '59899123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(mockSendWhatsApp).toHaveBeenCalledWith({
      to: '59899123456',
      templateName: 'presupuesto_ready',
      languageCode: 'en',
      parameters: ['Ana', '123', 'Reloj', 'UYU', '3500'],
    })
  })

  it('no envía nada si no hay clienteTelefono', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', { clienteNombre: 'Ana' })
    expect(mockSendWhatsApp).not.toHaveBeenCalled()
  })

  it('ignora silenciosamente clienteEmail (backward compat con callers viejos)', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteEmail: 'a@b.com',
      clienteTelefono: '59899123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    // Solo WhatsApp se llama. El email se ignora.
    expect(mockSendWhatsApp).toHaveBeenCalledOnce()
  })

  it('loguea el error si WhatsApp falla pero no propaga', async () => {
    mockSendWhatsApp.mockRejectedValue(new Error('boom'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '59899123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- __tests__/notifications.test.js`
Expected: FAILS. Reasons can include: `interpolate` import no longer exists (if used elsewhere), or the current `sendNotification` still tries to mock email which is now gone. Specifically expect failures around the test that uses old `mockSendEmail` (now removed) — but since we replaced the whole file, the actual failure will be from the impl still importing `sendEmail` from a path the impl uses. That's expected — confirms tests are pinned to new contract.

- [ ] **Step 3: Commit the failing test**

```bash
git add __tests__/notifications.test.js
git commit -m "test: pin sendNotification to single-channel WhatsApp contract"
```

---

## Task 2: Simplify `lib/notifications/index.js` to single-channel

**Files:**
- Modify: `lib/notifications/index.js`

- [ ] **Step 1: Replace the file contents**

Open `lib/notifications/index.js` and replace the ENTIRE contents with:

```javascript
import { sendWhatsApp } from './whatsapp'
import { getSupabaseAdmin } from '../supabase-admin'

/**
 * Envía una notificación al cliente por WhatsApp.
 * Si el cliente no tiene `clienteTelefono`, no se envía nada (silencioso).
 * Si WhatsApp falla, se loguea el error pero no se propaga.
 *
 * @param {'PRESUPUESTO' | 'LISTO_PARA_RETIRO' | 'RECORDATORIO_MANTENIMIENTO'} type
 * @param {object} data — debe incluir `clienteTelefono` y las keys que el template necesita
 */
export async function sendNotification(type, data) {
  try {
    await sendViaWhatsApp(type, data)
  } catch (e) {
    console.error('[Notifications] canal whatsapp falló:', e)
  }
}

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

This drops: `sendEmail` import, `interpolate` export, `Promise.allSettled`, the email lookup, and the `sendViaEmail` helper.

- [ ] **Step 2: Run notifications tests to verify they pass**

Run: `npm run test -- __tests__/notifications.test.js`
Expected: PASS — all 4 tests green.

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/index.js
git commit -m "refactor(notifications): drop email channel, single-channel WhatsApp dispatcher"
```

---

## Task 3: Delete email files

**Files:**
- Delete: `lib/notifications/email.js`
- Delete: `lib/notifications/email-template.js`
- Delete: `lib/notifications/__tests__/email.test.js`

- [ ] **Step 1: Delete the three files**

```bash
rm lib/notifications/email.js
rm lib/notifications/email-template.js
rm lib/notifications/__tests__/email.test.js
```

- [ ] **Step 2: Verify no imports reference them**

Search for any remaining references:

```bash
grep -rn "notifications/email" --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v "/email-template"
```

Expected: no matches except possibly inside `docs/`. If anything else shows up under `app/`, `components/`, `lib/`, or `__tests__/`, stop and fix.

- [ ] **Step 3: Run all tests**

Run: `npm run test`
Expected: all green (notifications, whatsapp, webhook-whatsapp suites pass; the email test suite no longer exists).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete email notification module and tests"
```

---

## Task 4: Update `app/api/cron/recordatorios/route.js` to phone-only

**Files:**
- Modify: `app/api/cron/recordatorios/route.js`

Changes: drop `email` from the select, change the guard to require phone only, change `canal: "multi"` to `"whatsapp"`, drop `clienteEmail` from the `sendNotification` payload.

- [ ] **Step 1: Update the select to drop email**

Replace this block (around line 31-42):

```javascript
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

With:

```javascript
  const { data: ordenes, error } = await getSupabaseAdmin()
    .from("ordenes")
    .select(`
      id,
      tipo_articulo,
      fecha_entrega,
      clientes(id, nombre, telefono),
      tipos_servicio(nombre, ciclo_meses)
    `)
    .eq("estado", "ENTREGADO")
    .not("fecha_entrega", "is", null)
    .not("tipo_servicio_id", "is", null);
```

- [ ] **Step 2: Update the guard to phone-only**

Find this line (around line 63):

```javascript
    if (!orden.clientes?.telefono && !orden.clientes?.email) continue;
```

Replace with:

```javascript
    if (!orden.clientes?.telefono) continue;
```

- [ ] **Step 3: Change `canal: "multi"` → `canal: "whatsapp"`**

Find this block (around line 71-79):

```javascript
      const { error: insertError } = await getSupabaseAdmin().from("notificaciones_enviadas").insert({
        orden_id: orden.id,
        cliente_id: orden.clientes.id,
        tipo_notificacion: "RECORDATORIO_MANTENIMIENTO",
        tipo: "RECORDATORIO_MANTENIMIENTO",
        canal: "multi",
        enviado: false,
        fecha_envio: new Date().toISOString(),
      });
```

Replace the `canal: "multi"` line with:

```javascript
        canal: "whatsapp",
```

- [ ] **Step 4: Drop `clienteEmail` from the `sendNotification` payload**

Find this block (around line 86-96):

```javascript
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

Replace with (remove the `clienteEmail` line):

```javascript
      await sendNotification("RECORDATORIO_MANTENIMIENTO", {
        clienteTelefono: orden.clientes.telefono,
        clienteNombre: orden.clientes.nombre,
        tipoServicio: orden.tipos_servicio.nombre,
        ultimaFecha: new Date(orden.fecha_entrega).toLocaleDateString("es-UY", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
      });
```

- [ ] **Step 5: Build to verify no syntax errors**

Run: `npm run build`
Expected: build completes successfully.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/recordatorios/route.js
git commit -m "refactor(cron): recordatorios solo por WhatsApp"
```

---

## Task 5: Update `app/api/traslados/route.js`

**Files:**
- Modify: `app/api/traslados/route.js`

The retorno notification today guards on `cliente_email`. After the change it should guard on `cliente_telefono` and send phone instead of email.

- [ ] **Step 1: Update the notification block**

Find this block (around line 77-96):

```javascript
      if (traslado.tipo === "retorno") {
        try {
          const { getOrden } = await import("@/lib/data");
          const { formatNumeroOrden } = await import("@/lib/constants");
          const { sendNotification } = await import("@/lib/notifications");
          const orden = await getOrden(traslado.orden_id);
          if (orden?.cliente_email) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
            await sendNotification("LISTO_PARA_RETIRO", {
              clienteEmail: orden.cliente_email,
              clienteNombre: orden.cliente_nombre,
              numeroOrden: formatNumeroOrden(orden.numero_orden),
              tipoArticulo: orden.tipo_articulo,
              trackingUrl: orden.tracking_token ? `${appUrl}/seguimiento/${orden.tracking_token}` : "",
            });
          }
        } catch (e) {
          console.error("[Traslado] Error sending notification after retorno received:", e);
        }
      }
```

Replace with:

```javascript
      if (traslado.tipo === "retorno") {
        try {
          const { getOrden } = await import("@/lib/data");
          const { formatNumeroOrden } = await import("@/lib/constants");
          const { sendNotification } = await import("@/lib/notifications");
          const orden = await getOrden(traslado.orden_id);
          if (orden?.cliente_telefono) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
            await sendNotification("LISTO_PARA_RETIRO", {
              clienteTelefono: orden.cliente_telefono,
              clienteNombre: orden.cliente_nombre,
              numeroOrden: formatNumeroOrden(orden.numero_orden),
              tipoArticulo: orden.tipo_articulo,
              trackingUrl: orden.tracking_token ? `${appUrl}/seguimiento/${orden.tracking_token}` : "",
            });
          }
        } catch (e) {
          console.error("[Traslado] Error sending notification after retorno received:", e);
        }
      }
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/api/traslados/route.js
git commit -m "refactor(traslados): notificar retorno por WhatsApp en lugar de email"
```

---

## Task 6: Delete `app/api/admin/plantillas-email/route.js`

**Files:**
- Delete: `app/api/admin/plantillas-email/route.js`

- [ ] **Step 1: Delete the file and its parent folder if empty**

```bash
rm app/api/admin/plantillas-email/route.js
rmdir app/api/admin/plantillas-email
```

- [ ] **Step 2: Verify no callers remain**

```bash
grep -rn "plantillas-email" --include="*.js" --include="*.jsx" . | grep -v node_modules | grep -v "/docs/"
```

Expected: only matches inside `docs/` (legacy plan docs). Any matches in `app/`, `components/`, `lib/`, or `__tests__/` must be fixed in later tasks of this plan (they will be — see Tasks 7 and 9).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete /api/admin/plantillas-email endpoint"
```

---

## Task 7: Update `components/DetalleOrdenModal.js`

**Files:**
- Modify: `components/DetalleOrdenModal.js`

Five edits:
1. Drop the fetch to `/api/admin/plantillas-email`.
2. Drop the `plantillas` state and its setter.
3. Drop `clienteEmail` from the `triggerNotify` payload.
4. Simplify the two `(cliente_email || cliente_telefono)` conditions to `cliente_telefono`.
5. Change the two checkbox labels to always say `"Notificar al cliente por WhatsApp"`.
6. Fix the outdated comment about email.

- [ ] **Step 1: Drop the `plantillas` state line**

Find (around line 27):

```javascript
  const [plantillas, setPlantillas] = useState({});
```

Delete that line.

- [ ] **Step 2: Drop the plantillas fetch and setter inside `loadData`**

Find the `loadData` function (around line 61-80):

```javascript
  async function loadData() {
    try {
      const [h, t, pRes, trasladosData, sucursalesRes] = await Promise.all([
        getHistorial(orden.id),
        getTalleres(),
        fetch("/api/admin/plantillas-email").then(r => r.ok ? r.json() : Promise.resolve({ plantillas: [] })),
        getTrasladosByOrden(orden.id),
        getSucursales(),
      ]);
      setHistorial(h);
      setTalleresState(t);
      const map = {};
      (pRes.plantillas || []).forEach(p => { map[p.tipo] = p.cuerpo; });
      setPlantillas(map);
      setTrasladosHistorial(trasladosData);
      setSucursalesState(sucursalesRes || []);
    } catch (e) {
      console.error(e);
    }
  }
```

Replace with:

```javascript
  async function loadData() {
    try {
      const [h, t, trasladosData, sucursalesRes] = await Promise.all([
        getHistorial(orden.id),
        getTalleres(),
        getTrasladosByOrden(orden.id),
        getSucursales(),
      ]);
      setHistorial(h);
      setTalleresState(t);
      setTrasladosHistorial(trasladosData);
      setSucursalesState(sucursalesRes || []);
    } catch (e) {
      console.error(e);
    }
  }
```

- [ ] **Step 3: Drop `clienteEmail` from `triggerNotify` payload**

Find this block (around line 95-112):

```javascript
  async function triggerNotify(type, extras = {}) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        data: {
          clienteTelefono: orden.cliente_telefono,
          clienteEmail: orden.cliente_email,
          clienteNombre: orden.cliente_nombre,
          numeroOrden: formatNumeroOrden(orden.numero_orden),
          tipoArticulo: orden.tipo_articulo,
          trackingUrl: orden.tracking_token ? `${appUrl}/seguimiento/${orden.tracking_token}` : "",
          ...extras,
        },
      }),
    });
    if (!res.ok) {
      throw new Error("Error al enviar notificación");
    }
  }
```

Replace with (remove the `clienteEmail` line):

```javascript
  async function triggerNotify(type, extras = {}) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        data: {
          clienteTelefono: orden.cliente_telefono,
          clienteNombre: orden.cliente_nombre,
          numeroOrden: formatNumeroOrden(orden.numero_orden),
          tipoArticulo: orden.tipo_articulo,
          trackingUrl: orden.tracking_token ? `${appUrl}/seguimiento/${orden.tracking_token}` : "",
          ...extras,
        },
      }),
    });
    if (!res.ok) {
      throw new Error("Error al enviar notificación");
    }
  }
```

- [ ] **Step 4: Fix the outdated comment in `handleCambiarEstado`**

Find this line (around line 125):

```javascript
    // (siempre mostrar para permitir notificar por email, incluso si ya hay monto)
```

Replace with:

```javascript
    // (siempre mostrar para permitir notificar por WhatsApp, incluso si ya hay monto)
```

- [ ] **Step 5: Simplify the presupuesto guard**

Find (around line 175):

```javascript
      if (notificarPresupuesto && (orden.cliente_email || orden.cliente_telefono)) {
```

Replace with:

```javascript
      if (notificarPresupuesto && orden.cliente_telefono) {
```

- [ ] **Step 6: Simplify the retiro guard**

Find (around line 242):

```javascript
      if (!needsRetorno && notificarRetiro && (orden.cliente_email || orden.cliente_telefono)) {
```

Replace with:

```javascript
      if (!needsRetorno && notificarRetiro && orden.cliente_telefono) {
```

- [ ] **Step 7: Simplify the presupuesto checkbox visibility**

Find (around line 526):

```javascript
              {(orden.cliente_email || orden.cliente_telefono) && (
```

Replace with:

```javascript
              {orden.cliente_telefono && (
```

- [ ] **Step 8: Update the presupuesto checkbox label**

Find (around line 535):

```javascript
                    <span className="font-semibold">Notificar al cliente por WhatsApp{orden.cliente_email ? " y email" : ""}</span>
```

Replace with:

```javascript
                    <span className="font-semibold">Notificar al cliente por WhatsApp</span>
```

- [ ] **Step 9: Simplify the retiro checkbox visibility**

Find (around line 591):

```javascript
              {(orden.cliente_email || orden.cliente_telefono) && (
```

Replace with:

```javascript
              {orden.cliente_telefono && (
```

- [ ] **Step 10: Update the retiro checkbox label**

Find (around line 600):

```javascript
                    <span className="font-semibold">Notificar al cliente por WhatsApp{orden.cliente_email ? " y email" : ""}</span>
```

Replace with:

```javascript
                    <span className="font-semibold">Notificar al cliente por WhatsApp</span>
```

- [ ] **Step 11: Build to verify**

Run: `npm run build`
Expected: success, no warnings about unused imports or unreferenced state.

- [ ] **Step 12: Commit**

```bash
git add components/DetalleOrdenModal.js
git commit -m "refactor(DetalleOrdenModal): single-channel WhatsApp UI, drop email plantillas fetch"
```

---

## Task 8: Update `components/NuevoIngresoModal.js`

**Files:**
- Modify: `components/NuevoIngresoModal.js`

Three edits:
1. Make email optional in `handleCrearCliente` validation.
2. Make email optional in the button `disabled` check.
3. Remove the email field's `*` from its label, keep telefono's `*`.
4. Update the email recordatorio text.

- [ ] **Step 1: Drop the email check from `handleCrearCliente`**

Find (around line 98):

```javascript
    if (!nuevoCliente.nombre.trim() || !nuevoCliente.telefono.trim() || !nuevoCliente.email.trim() || !nuevoCliente.documento.trim()) return;
```

Replace with:

```javascript
    if (!nuevoCliente.nombre.trim() || !nuevoCliente.telefono.trim() || !nuevoCliente.documento.trim()) return;
```

- [ ] **Step 2: Drop the email check from the button `disabled`**

Find (around line 353):

```javascript
                disabled={!nuevoCliente.nombre || !nuevoCliente.telefono || !nuevoCliente.email || !nuevoCliente.documento || loading}
```

Replace with:

```javascript
                disabled={!nuevoCliente.nombre || !nuevoCliente.telefono || !nuevoCliente.documento || loading}
```

- [ ] **Step 3: Drop the `*` from the email label**

Find (around line 319):

```javascript
                  Email *
```

Replace with:

```javascript
                  Email
```

(The `Teléfono *` label already has the `*` — leave it.)

- [ ] **Step 4: Update the recordatorio text**

Find (around line 673):

```javascript
                    Si seleccionás un servicio, el cliente recibirá un recordatorio por email cuando sea hora de renovarlo.
```

Replace with:

```javascript
                    Si seleccionás un servicio, el cliente recibirá un recordatorio por WhatsApp cuando sea hora de renovarlo.
```

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add components/NuevoIngresoModal.js
git commit -m "refactor(NuevoIngresoModal): email opcional, recordatorio por WhatsApp"
```

---

## Task 9: Update `app/admin/configuracion/page.jsx`

**Files:**
- Modify: `app/admin/configuracion/page.jsx`

Drop the `plantillas_email` query and the `plantillasEmail` prop passed to the client.

- [ ] **Step 1: Replace the file contents**

Open `app/admin/configuracion/page.jsx` and replace the ENTIRE contents with:

```javascript
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getConfiguracion } from "@/lib/data/configuracion"
import ConfiguracionClient from "./configuracion-client"

export default async function ConfiguracionPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  if (session.user.role !== "admin") {
    redirect("/dashboard")
  }

  let configuracion = {}
  try {
    configuracion = await getConfiguracion()
  } catch (error) {
    console.error("[ConfiguracionPage] Error loading configuration:", error)
  }

  return (
    <div>
      <ConfiguracionClient configuracion={configuracion} />
    </div>
  )
}
```

This drops: the `getSupabaseAdmin` import, the `plantillasEmail` query, and the prop.

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/admin/configuracion/page.jsx
git commit -m "refactor(configuracion): drop plantillas_email query from server page"
```

---

## Task 10: Update `app/admin/configuracion/configuracion-client.js`

**Files:**
- Modify: `app/admin/configuracion/configuracion-client.js`

Remove the entire "Plantillas de Email" section: the `PLANTILLA_LABELS` constant, the `templates` state, the `handleSavePlantilla` function, the JSX block that renders the section, and the `plantillasEmail` prop from the component signature.

- [ ] **Step 1: Drop the `PLANTILLA_LABELS` constant**

Find this block at the top of the file (around line 21-37):

```javascript
const PLANTILLA_LABELS = {
  PRESUPUESTO: {
    label: "Presupuesto",
    desc: "Se envía cuando el operador registra un presupuesto y elige notificar.",
    vars: "{{clienteNombre}}, {{numeroOrden}}, {{tipoArticulo}}, {{monto}}",
  },
  LISTO_PARA_RETIRO: {
    label: "Listo para retiro",
    desc: "Se envía cuando el artículo está listo y el operador elige notificar.",
    vars: "{{clienteNombre}}, {{numeroOrden}}, {{tipoArticulo}}, {{trackingUrl}}",
  },
  RECORDATORIO_MANTENIMIENTO: {
    label: "Recordatorio de mantenimiento",
    desc: "Se envía automáticamente por el cron de recordatorios.",
    vars: "{{clienteNombre}}, {{tipoServicio}}, {{ultimaFecha}}",
  },
}
```

Delete the entire block.

- [ ] **Step 2: Drop the `plantillasEmail` prop**

Find (around line 48):

```javascript
export default function ConfiguracionClient({ configuracion, plantillasEmail = [] }) {
```

Replace with:

```javascript
export default function ConfiguracionClient({ configuracion }) {
```

- [ ] **Step 3: Drop the `templates` state**

Find this block (around line 86-92):

```javascript
  const [templates, setTemplates] = useState(() => {
    const initial = {}
    plantillasEmail.forEach((p) => {
      initial[p.tipo] = { asunto: p.asunto, cuerpo: p.cuerpo, loading: false }
    })
    return initial
  })
```

Delete the entire block.

- [ ] **Step 4: Drop the `handleSavePlantilla` function**

Find this function (around line 179-214):

```javascript
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

Delete the entire function.

- [ ] **Step 5: Drop the "Plantillas de Email" JSX section**

Find the JSX block (around line 359-435):

```javascript
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

Delete the entire block.

- [ ] **Step 6: Verify the file structure**

After deletions, the file should still:
- Import `useState` and `toast`.
- Define `ESTADO_ORDER`.
- Export `ConfiguracionClient({ configuracion })` that renders nombre del negocio + tabla de umbrales + bloque azul "Cómo funciona".

- [ ] **Step 7: Build to verify**

Run: `npm run build`
Expected: success, no warnings.

- [ ] **Step 8: Commit**

```bash
git add app/admin/configuracion/configuracion-client.js
git commit -m "refactor(configuracion): drop plantillas de email UI section"
```

---

## Task 11: Update or skip `app/admin/configuracion/__tests__/page.test.js`

**Files:**
- Read first, then possibly modify: `app/admin/configuracion/__tests__/page.test.js`

- [ ] **Step 1: Read the test file**

Open `app/admin/configuracion/__tests__/page.test.js`. Scan for any reference to `plantillas_email`, `plantillasEmail`, `PLANTILLA_LABELS`, `handleSavePlantilla`, or rendering of the "Plantillas de Email" section.

- [ ] **Step 2: Decision**

- **If the test does NOT reference email plantillas in any way** → skip this task (no changes needed). Jump to Task 12.
- **If the test DOES reference email plantillas** → remove those assertions/mocks. The test should keep coverage for nombre del negocio + umbrales. Remove only the email-related parts.

- [ ] **Step 3: Run all tests**

Run: `npm run test`
Expected: all green.

- [ ] **Step 4: Commit (only if file was modified)**

```bash
git add app/admin/configuracion/__tests__/page.test.js
git commit -m "test(configuracion): drop email plantillas assertions"
```

---

## Task 12: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Drop the Resend block**

Open `.env.example`. Find these lines (around line 28-30):

```
# Resend (notificaciones por email)
# Obtener en: https://resend.com → API Keys
RESEND_API_KEY=tu-resend-api-key-aqui
```

Delete those 3 lines.

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore(env): drop RESEND_API_KEY from .env.example"
```

---

## Task 13: Final verification + smoke test

**Files:** None — verification only.

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: all suites green, no skipped or failing tests related to this work.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: build completes without errors. No new warnings about unused imports or unreachable code.

- [ ] **Step 3: Manual smoke test (deploy to preview or run locally)**

Run `npm run dev` (or push to a Vercel preview), then verify each item:

- [ ] Open `/admin/configuracion` → no "Plantillas de Email" section is visible.
- [ ] Open the "Nuevo ingreso" modal:
  - [ ] Try to create a new client with name + documento + phone, leaving email empty → "Crear cliente y continuar" button is **enabled** and the client is created successfully.
  - [ ] Try to create a new client with name + documento + email but no phone → button is **disabled**.
- [ ] Open an existing order detail with a client that has phone:
  - [ ] Change state to "Esperando aprobación" → checkbox appears with label "Notificar al cliente por WhatsApp" (no mention of email). Loading the modal shouldn't make any request to `/api/admin/plantillas-email` (check Network tab — there should be no 404).
  - [ ] Tilde the checkbox, enter monto, save → WhatsApp message arrives.
  - [ ] Change state to "Listo para retiro" → checkbox appears with label "Notificar al cliente por WhatsApp". Tildar + guardar → WhatsApp message arrives.
- [ ] Open an order whose client has email but NO phone → "Notificar al cliente" checkbox does NOT appear (because the condition is `cliente_telefono` only now).

- [ ] **Step 4: Final commit if anything came up**

If steps 1-3 surfaced any issue not covered by the previous tasks, fix it inline and commit with a clear message. Otherwise, no commit needed for this task.

---

## Out of scope (post-merge cleanup, NOT in this PR)

These tasks are documented but **not part of this PR**:

- [ ] Delete `RESEND_API_KEY` from Vercel (Settings → Environment Variables → Production).
- [ ] Cancel Resend account if not used elsewhere.
- [ ] Optional: `npm uninstall resend` to drop the SDK from `package.json` and `package-lock.json`. Skipped from this PR because the user explicitly said removing the SDK is post-merge per spec.
- [ ] Optional, future: migration to drop the `plantillas_email` table and `cliente_email` column.

---

## PR description suggestion

When opening the PR, use this body as a starting point:

```markdown
## Summary
- Removes email as a notification channel. WhatsApp is the only channel.
- Phone becomes required when creating a client; email becomes optional.
- Deletes `/api/admin/plantillas-email` API + admin UI section.
- Keeps the DB schema untouched (`plantillas_email` table and `cliente_email` column stay for rollback).

## Test plan
- [ ] `npm run test` green
- [ ] `npm run build` green
- [ ] Smoke test the order notification flow on Vercel preview
- [ ] Verify `/admin/configuracion` no longer shows the email templates section

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
