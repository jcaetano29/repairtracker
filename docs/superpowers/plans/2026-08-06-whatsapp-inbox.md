# WhatsApp Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing WhatsApp webhook to capture and persist incoming client messages, and build a `/whatsapp` tab styled like WhatsApp Web that shows the full thread (client replies + our automated outbound sends) per client. Read-only v1.

**Architecture:** `app/api/webhook/whatsapp/route.js` already exists and handles Meta status-update callbacks for our own sends — it is extended (not replaced) to also persist incoming client messages into two new Supabase tables, matching clients by a normalized E.164 phone number, and to verify the webhook signature. The existing outbound send path (`lib/notifications/index.js`, which now sends Meta Message Templates, not free text) is extended to log its sends into the same tables. Because this project locked down anonymous Supabase access to PII tables (`clientes`/`ordenes`, see `supabase/031_lockdown_pii.sql`), the frontend reads through new authenticated API routes backed by the service-role admin client — the same pattern as `/api/ordenes`, `/api/clientes` — with polling for live updates (this project has no Supabase Realtime usage anywhere; polling is the established pattern, e.g. `app/page.js` every 30s, `components/TrasladosPanel.js` every 5s).

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres, service-role admin client only), NextAuth v5, Tailwind, Vitest.

## Global Constraints

- v1 is **read-only**: no replying from the UI. See spec's "Fuera de alcance" for why (IDOR/abuse/24h-window risks of bidirectional).
- Only **text** messages are rendered; any other message type is stored as `tipo: 'other'` with no body and shown as a generic placeholder — no media download.
- Messages from phone numbers that don't match an existing `cliente` are **not persisted**.
- Phone normalization must handle **all 7 countries** clients can now be registered under (`lib/countries.js`: UY 598, AR 54, BR 55, CL 56, PY 595, ES 34, US 1), plus the legacy pre-selector Uruguay-local format (e.g. `"099123456"`, no dial code, leading trunk `0`).
- **No new anon/authenticated RLS policies** on the new tables — they hold PII (client identity, phone, message content). All access goes through `getSupabaseAdmin()` from authenticated API routes, mirroring `supabase/031_lockdown_pii.sql`.
- **No Supabase Realtime** — this project doesn't use it anywhere; live updates are polling via authenticated fetch, matching `app/page.js` (30s) / `components/TrasladosPanel.js` (5s).
- The webhook route already exists at `app/api/webhook/whatsapp/route.js` (singular "webhook") — **extend it**, do not create a competing route. It currently handles `GET` verification and `POST` status-update callbacks (`value.statuses[]` → updates `notificaciones_enviadas`); preserve that behavior and its existing tests in `__tests__/webhook-whatsapp.test.js` exactly.
- `sendWhatsApp()` (`lib/notifications/whatsapp.js`) sends Meta Message Templates: `sendWhatsApp({ to, templateName, languageCode, parameters }) => Promise<string|null>` (returns the Meta `wa_message_id`, or `null` if not sent). There is no free-text `body` param and no email channel anymore.
- `/whatsapp` is a **top-level route** (not under `/admin`), visible to `admin` and `employee` roles, not `cadete`. No middleware changes needed — cadetes are already redirected away from any path that isn't `/cadete` or `/api/cadete/*`; `/whatsapp` is not under `/admin` so `employee` isn't blocked either. API routes are excluded from `middleware.js`'s matcher entirely — every API route in this codebase self-protects with a `session?.user?.id` check (see `app/api/clientes/route.js`, `app/api/admin/plantillas/route.js`), not a role check. Follow that exact convention for the new `/api/whatsapp/*` routes.
- Next.js 14 dynamic route params are awaited: `const { id } = await params` (see `app/api/ordenes/[id]/route.js`).
- Reference spec: `docs/superpowers/specs/2026-08-06-whatsapp-inbox-design.md`.

---

### Task 1: Phone normalization utility

**Files:**
- Create: `lib/phone.js`
- Test: `lib/__tests__/phone.test.js`

**Interfaces:**
- Consumes: `COUNTRIES`, `DEFAULT_COUNTRY` from `lib/countries.js` (existing — do not duplicate this list).
- Produces: `normalizePhoneToE164(raw: string) => string | null` — used by Task 4 (webhook), Task 5 (notifications), and mirrored in SQL by Task 2's backfill.

`lib/countries.js` already exports `COUNTRIES` (array of `{code, name, dial, Flag}` for UY/AR/BR/CL/PY/ES/US) and `DEFAULT_COUNTRY` (UY). Its `parsePhone()` always falls back to UY on no match (correct for a live editable input, since it always needs to show *something*). Your `normalizePhoneToE164` is stricter — it must return `null` when there's no confident match, since it feeds a database matching join, not a UI default.

- [ ] **Step 1: Write the failing tests**

```js
// lib/__tests__/phone.test.js
import { describe, it, expect } from "vitest";
import { normalizePhoneToE164 } from "../phone";

describe("normalizePhoneToE164", () => {
  it("passes through a UY number already in dial+number form (no +)", () => {
    expect(normalizePhoneToE164("59899111222")).toBe("+59899111222");
  });

  it("passes through an Argentina number already in dial+number form", () => {
    expect(normalizePhoneToE164("5491112345678")).toBe("+5491112345678");
  });

  it("normalizes a number already prefixed with +", () => {
    expect(normalizePhoneToE164("+598 99 111 222")).toBe("+59899111222");
  });

  it("normalizes legacy Uruguay-local format with leading trunk 0", () => {
    expect(normalizePhoneToE164("099 111 222")).toBe("+59899111222");
  });

  it("normalizes legacy Uruguay-local format with dashes", () => {
    expect(normalizePhoneToE164("099-111-222")).toBe("+59899111222");
  });

  it("normalizes a bare 8-digit number with no dial and no leading 0 as Uruguay", () => {
    expect(normalizePhoneToE164("99111222")).toBe("+59899111222");
  });

  it("does not misdetect a Uruguay number as US (dial '1')", () => {
    expect(normalizePhoneToE164("59899111222")).toBe("+59899111222");
  });

  it("returns null for a bare dial code with no number attached", () => {
    expect(normalizePhoneToE164("598")).toBeNull();
  });

  it("returns null for a number that doesn't match any known format", () => {
    expect(normalizePhoneToE164("12345")).toBeNull();
  });

  it("returns null for empty or missing input", () => {
    expect(normalizePhoneToE164("")).toBeNull();
    expect(normalizePhoneToE164(null)).toBeNull();
    expect(normalizePhoneToE164(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/phone.test.js`
Expected: FAIL — `lib/phone.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```js
// lib/phone.js
import { COUNTRIES, DEFAULT_COUNTRY } from "./countries";

// Longest dial first, so "598" (UY) matches before "1" (US) etc. — same
// ordering rule as lib/countries.js#parsePhone, kept in sync deliberately.
const SORTED_COUNTRIES = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

/**
 * Normaliza un teléfono a E.164 para matchear contra el wa_id que manda Meta.
 * A diferencia de lib/countries.js#parsePhone (que siempre devuelve algo,
 * pensado para un input editable), esta función devuelve null cuando no hay
 * un match confiable — se usa para join contra la base, no para mostrar UI.
 */
export function normalizePhoneToE164(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  const match = SORTED_COUNTRIES.find((c) => digits.startsWith(c.dial) && digits.length > c.dial.length);
  if (match) {
    return `+${digits}`;
  }

  // Formato legado uruguayo, guardado antes de que existiera el selector de
  // país (ver docs/superpowers/specs/2026-06-13-selector-prefijo-telefono-design.md):
  // local con 0 de tronco, ej "099123456".
  if (digits.startsWith("0") && digits.length === 9) {
    return `+${DEFAULT_COUNTRY.dial}${digits.slice(1)}`;
  }
  if (digits.length === 8) {
    return `+${DEFAULT_COUNTRY.dial}${digits}`;
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/phone.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/phone.js lib/__tests__/phone.test.js
git commit -m "feat: add multi-country phone normalization for WhatsApp matching"
```

---

### Task 2: Database migration

**Files:**
- Create: `supabase/034_whatsapp_inbox.sql`
- Modify: `.env.example`

**Interfaces:**
- Produces: `clientes.telefono_e164`, `whatsapp_conversaciones(id, cliente_id, telefono_e164, last_message_at, last_message_preview, created_at)`, `whatsapp_mensajes(id, conversacion_id, direccion, wa_message_id, tipo, body, estado, created_at)` — consumed by Tasks 4, 5, 6.

This project has no automated migration runner — migrations are pasted into the Supabase SQL Editor (see `docs/DEPLOY.md`). No Vitest step; verification is manual against the Supabase project. The latest existing migration is `033_update_whatsapp_template_names_v2.sql` — this is `034`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/034_whatsapp_inbox.sql
-- WhatsApp inbox: incoming message storage + full conversation thread

BEGIN;

-- ============================================================
-- clientes.telefono_e164 — normalized phone for matching wa_id
-- ============================================================
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefono_e164 TEXT;

-- Backfill existing rows. Mirrors lib/phone.js normalizePhoneToE164() —
-- keep both in sync if the normalization rules ever change. Dial codes from
-- lib/countries.js, checked longest-first: 598 (UY), 595 (PY), then the
-- 2-digit dials (54 AR, 55 BR, 56 CL, 34 ES), then 1 (US).
UPDATE clientes
SET telefono_e164 = CASE
  WHEN regexp_replace(telefono, '\D', '', 'g') ~ '^598\d+$'
       AND length(regexp_replace(telefono, '\D', '', 'g')) > 3
    THEN '+' || regexp_replace(telefono, '\D', '', 'g')
  WHEN regexp_replace(telefono, '\D', '', 'g') ~ '^595\d+$'
       AND length(regexp_replace(telefono, '\D', '', 'g')) > 3
    THEN '+' || regexp_replace(telefono, '\D', '', 'g')
  WHEN regexp_replace(telefono, '\D', '', 'g') ~ '^(54|55|56|34)\d+$'
       AND length(regexp_replace(telefono, '\D', '', 'g')) > 2
    THEN '+' || regexp_replace(telefono, '\D', '', 'g')
  WHEN regexp_replace(telefono, '\D', '', 'g') ~ '^1\d+$'
       AND length(regexp_replace(telefono, '\D', '', 'g')) > 1
    THEN '+' || regexp_replace(telefono, '\D', '', 'g')
  -- Legado uruguayo sin dial, con 0 de tronco, ej "099123456"
  WHEN regexp_replace(telefono, '\D', '', 'g') ~ '^0\d{8}$'
    THEN '+598' || substring(regexp_replace(telefono, '\D', '', 'g') from 2)
  -- Legado uruguayo sin dial y sin 0, 8 dígitos
  WHEN regexp_replace(telefono, '\D', '', 'g') ~ '^\d{8}$'
    THEN '+598' || regexp_replace(telefono, '\D', '', 'g')
  ELSE NULL
END
WHERE telefono IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_telefono_e164 ON clientes(telefono_e164);

-- ============================================================
-- whatsapp_conversaciones — one thread per cliente
-- ============================================================
CREATE TABLE whatsapp_conversaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES clientes(id) NOT NULL UNIQUE,
  telefono_e164 TEXT NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_conversaciones_last_message
  ON whatsapp_conversaciones(last_message_at DESC);

-- ============================================================
-- whatsapp_mensajes — both directions, one row per message
-- ============================================================
CREATE TABLE whatsapp_mensajes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversacion_id UUID REFERENCES whatsapp_conversaciones(id) ON DELETE CASCADE NOT NULL,
  direccion TEXT NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  wa_message_id TEXT UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('text', 'other')),
  body TEXT,
  estado TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_mensajes_conversacion
  ON whatsapp_mensajes(conversacion_id, created_at);

-- ============================================================
-- RLS — PII (client identity, phone, message content). Same lockdown
-- criterion as supabase/031_lockdown_pii.sql: no anon/authenticated
-- policies at all. All access goes through getSupabaseAdmin() from
-- authenticated API routes. service_role bypasses RLS automatically.
-- ============================================================
ALTER TABLE whatsapp_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_mensajes ENABLE ROW LEVEL SECURITY;

COMMIT;
```

- [ ] **Step 2: Add the new env var to `.env.example`**

`WHATSAPP_VERIFY_TOKEN` already exists in `.env.example`. Add immediately after it:

```
# WHATSAPP_APP_SECRET: Meta for Developers → tu app → Configuración básica →
# Secreto de la app. Habilita la verificación de firma en el webhook. Si se
# deja sin configurar, el webhook sigue funcionando (con una advertencia en
# los logs) para no romper el tracking de status ya en producción.
WHATSAPP_APP_SECRET=app-secret-de-meta-for-developers
```

- [ ] **Step 3: Run the migration against the Supabase project**

Paste the full contents of `supabase/034_whatsapp_inbox.sql` into Supabase → SQL Editor → Run.
Expected: "Success. No rows returned."

- [ ] **Step 4: Manually verify the backfill**

In SQL Editor, run:

```sql
SELECT telefono, telefono_e164 FROM clientes LIMIT 20;
```

Expected: `telefono_e164` is populated (`+<dial><number>`) for rows with a recognizable phone format, `NULL` for anything that didn't match.

- [ ] **Step 5: Commit**

```bash
git add supabase/034_whatsapp_inbox.sql .env.example
git commit -m "feat: add whatsapp inbox tables (locked-down RLS) and telefono_e164 backfill"
```

---

### Task 3: Webhook signature verification and incoming message parsing

**Files:**
- Create: `lib/whatsapp-webhook.js`
- Test: `lib/__tests__/whatsapp-webhook.test.js`

**Interfaces:**
- Consumes: nothing (pure functions, `node:crypto` only)
- Produces: `verifyWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string) => boolean`, `extractIncomingMessages(payload: object) => Array<{ waId: string, waMessageId: string, type: 'text' | 'other', body: string | null }>` — both consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

```js
// lib/__tests__/whatsapp-webhook.test.js
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyWebhookSignature, extractIncomingMessages } from "../whatsapp-webhook";

const APP_SECRET = "test-secret";

function sign(body) {
  return "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex");
}

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed body", () => {
    const body = '{"hello":"world"}';
    expect(verifyWebhookSignature(body, sign(body), APP_SECRET)).toBe(true);
  });

  it("rejects a body signed with the wrong secret", () => {
    const body = '{"hello":"world"}';
    const wrongSig = "sha256=" + crypto.createHmac("sha256", "other-secret").update(body, "utf8").digest("hex");
    expect(verifyWebhookSignature(body, wrongSig, APP_SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const body = '{"hello":"world"}';
    const signature = sign(body);
    expect(verifyWebhookSignature('{"hello":"tampered"}', signature, APP_SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature('{"a":1}', null, APP_SECRET)).toBe(false);
  });

  it("rejects a malformed signature header", () => {
    expect(verifyWebhookSignature('{"a":1}', "not-a-real-signature", APP_SECRET)).toBe(false);
  });
});

describe("extractIncomingMessages", () => {
  it("extracts a text message", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "wamid.1", from: "59899111222", type: "text", text: { body: "Hola" } },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(extractIncomingMessages(payload)).toEqual([
      { waId: "59899111222", waMessageId: "wamid.1", type: "text", body: "Hola" },
    ]);
  });

  it("marks non-text messages as 'other' with no body", () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [{ id: "wamid.2", from: "59899111222", type: "image" }] } }] }],
    };
    expect(extractIncomingMessages(payload)).toEqual([
      { waId: "59899111222", waMessageId: "wamid.2", type: "other", body: null },
    ]);
  });

  it("returns an empty array for a status-only webhook call (no messages)", () => {
    const payload = {
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "delivered" }] } }] }],
    };
    expect(extractIncomingMessages(payload)).toEqual([]);
  });

  it("handles multiple messages across entries", () => {
    const payload = {
      entry: [
        { changes: [{ value: { messages: [{ id: "a", from: "1", type: "text", text: { body: "x" } }] } }] },
        { changes: [{ value: { messages: [{ id: "b", from: "2", type: "text", text: { body: "y" } }] } }] },
      ],
    };
    expect(extractIncomingMessages(payload)).toHaveLength(2);
  });

  it("returns an empty array for a malformed/empty payload", () => {
    expect(extractIncomingMessages({})).toEqual([]);
    expect(extractIncomingMessages({ entry: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/whatsapp-webhook.test.js`
Expected: FAIL — `lib/whatsapp-webhook.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```js
// lib/whatsapp-webhook.js
import crypto from "node:crypto";

/**
 * Valida la firma HMAC-SHA256 que Meta manda en X-Hub-Signature-256
 * para cada POST del webhook.
 */
export function verifyWebhookSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Aplana el payload del webhook de Meta a los mensajes entrantes que trae,
 * ignorando entries que solo traen "statuses" (confirmaciones de entrega/lectura).
 */
export function extractIncomingMessages(payload) {
  const results = [];
  const entries = payload?.entry ?? [];

  for (const entry of entries) {
    const changes = entry?.changes ?? [];
    for (const change of changes) {
      const messages = change?.value?.messages ?? [];
      for (const msg of messages) {
        if (!msg?.id || !msg?.from) continue;
        const isText = msg.type === "text";
        results.push({
          waId: msg.from,
          waMessageId: msg.id,
          type: isText ? "text" : "other",
          body: isText ? (msg.text?.body ?? null) : null,
        });
      }
    }
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/whatsapp-webhook.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/whatsapp-webhook.js lib/__tests__/whatsapp-webhook.test.js
git commit -m "feat: add whatsapp webhook signature verification and message parsing"
```

---

### Task 4: Extend the existing webhook route

**Files:**
- Modify: `app/api/webhook/whatsapp/route.js`
- Modify: `__tests__/webhook-whatsapp.test.js`

**Interfaces:**
- Consumes: `normalizePhoneToE164` (Task 1), `verifyWebhookSignature` + `extractIncomingMessages` (Task 3), `getSupabaseAdmin` (`lib/supabase-admin.js`), tables from Task 2.
- Produces: no new exports — `GET`/`POST` on the existing route gain signature verification and incoming-message persistence, alongside the existing status-update handling.

This is the **current, real content** of `app/api/webhook/whatsapp/route.js` — read it before editing, since your diff must preserve every line of existing behavior (`GET` verification, `STATUS_MAP`, `processStatus`) exactly:

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
    console.log("[Webhook WhatsApp] Payload recibido:", JSON.stringify(body))
    const entries = body.entry ?? []

    for (const entry of entries) {
      const changes = entry.changes ?? []
      for (const change of changes) {
        const statuses = change.value?.statuses ?? []
        for (const status of statuses) {
          console.log("[Webhook WhatsApp] Status:", JSON.stringify(status))
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
    const err = status.errors?.[0]
    updateData.error = err?.title ?? "Unknown error"
    console.error(`[WHATSAPP_DELIVERY_FAILED] code=${err?.code} title="${err?.title}" message="${err?.message}" details="${err?.error_data?.details}"`)
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

And this is the **current, real content** of `__tests__/webhook-whatsapp.test.js` — every existing `it(...)` in it must keep passing unmodified after your change:

```js
// __tests__/webhook-whatsapp.test.js
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

Note: none of the existing POST tests send an `x-hub-signature-256` header or set `WHATSAPP_APP_SECRET`. Your signature check must be a no-op (with a warning log) when `WHATSAPP_APP_SECRET` is unset, or these tests break.

- [ ] **Step 1: Write the failing tests**

Add these to `__tests__/webhook-whatsapp.test.js` — append below the existing `describe('POST /api/webhook/whatsapp — status updates', ...)` block, and extend the top-level `getSupabaseAdmin` mock so it can also answer `clientes`/`whatsapp_conversaciones`/`whatsapp_mensajes` queries. Replace the whole file with this (it contains every existing test verbatim plus the new ones):

```js
// __tests__/webhook-whatsapp.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'

const originalEnv = { ...process.env }

const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
})

// clientes/whatsapp_conversaciones/whatsapp_mensajes mocks — overridable per test.
let mockClienteResult = { data: { id: 'cliente-1' }, error: null }
let mockConversacionResult = { data: { id: 'conv-1' }, error: null }
const mockMensajeInsert = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table) => {
      if (table === 'notificaciones_enviadas') {
        return { update: (...args) => mockUpdate(...args) }
      }
      if (table === 'clientes') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve(mockClienteResult) }),
          }),
        }
      }
      if (table === 'whatsapp_conversaciones') {
        return {
          upsert: () => ({
            select: () => ({ single: () => Promise.resolve(mockConversacionResult) }),
          }),
        }
      }
      if (table === 'whatsapp_mensajes') {
        return { insert: (...args) => mockMensajeInsert(...args) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

function sign(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

beforeEach(() => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'my-secret-token'
  mockUpdate.mockClear()
  mockMensajeInsert.mockClear()
  mockClienteResult = { data: { id: 'cliente-1' }, error: null }
  mockConversacionResult = { data: { id: 'conv-1' }, error: null }
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

describe('POST /api/webhook/whatsapp — signature verification', () => {
  it('does not require a signature when WHATSAPP_APP_SECRET is unset (existing behavior)', async () => {
    delete process.env.WHATSAPP_APP_SECRET
    const { POST } = await import('@/app/api/webhook/whatsapp/route')
    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      body: JSON.stringify({ entry: [] }),
    }))
    expect(res.status).toBe(200)
  })

  it('rejects an invalid signature when WHATSAPP_APP_SECRET is set', async () => {
    process.env.WHATSAPP_APP_SECRET = 'app-secret'
    const { POST } = await import('@/app/api/webhook/whatsapp/route')
    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
      body: JSON.stringify({ entry: [] }),
    }))
    expect(res.status).toBe(401)
  })

  it('accepts a valid signature when WHATSAPP_APP_SECRET is set', async () => {
    process.env.WHATSAPP_APP_SECRET = 'app-secret'
    const { POST } = await import('@/app/api/webhook/whatsapp/route')
    const rawBody = JSON.stringify({ entry: [] })
    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'x-hub-signature-256': sign(rawBody, 'app-secret') },
      body: rawBody,
    }))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/webhook/whatsapp — incoming messages', () => {
  it('persists a text message from a known client and updates the conversation', async () => {
    const { POST } = await import('@/app/api/webhook/whatsapp/route')

    const rawBody = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ id: 'wamid.in1', from: '59899111222', type: 'text', text: { body: 'Hola' } }] } }] }],
    })

    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      body: rawBody,
    }))

    expect(res.status).toBe(200)
    expect(mockMensajeInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversacion_id: 'conv-1',
        direccion: 'entrante',
        wa_message_id: 'wamid.in1',
        tipo: 'text',
        body: 'Hola',
      })
    )
  })

  it('skips a message from an unknown phone number', async () => {
    mockClienteResult = { data: null, error: null }
    const { POST } = await import('@/app/api/webhook/whatsapp/route')

    const rawBody = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ id: 'wamid.in2', from: '59891234567', type: 'text', text: { body: 'Hola' } }] } }] }],
    })

    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      body: rawBody,
    }))

    expect(res.status).toBe(200)
    expect(mockMensajeInsert).not.toHaveBeenCalled()
  })

  it('does not fail the whole request if persisting one message errors', async () => {
    mockClienteResult = { data: undefined, error: new Error('boom') } // will throw when destructured downstream is avoided; force error path
    const { POST } = await import('@/app/api/webhook/whatsapp/route')

    const rawBody = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ id: 'wamid.in3', from: '59899111222', type: 'text', text: { body: 'x' } }] } }] }],
    })

    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      body: rawBody,
    }))

    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail and the old ones still pass**

Run: `npx vitest run __tests__/webhook-whatsapp.test.js`
Expected: the 3 existing status-update tests and 3 existing GET tests PASS; the new signature and incoming-message tests FAIL.

- [ ] **Step 3: Write the implementation**

Replace `app/api/webhook/whatsapp/route.js` with:

```js
// app/api/webhook/whatsapp/route.js
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"
import { normalizePhoneToE164 } from "@/lib/phone"
import { verifyWebhookSignature, extractIncomingMessages } from "@/lib/whatsapp-webhook"

export const runtime = "nodejs"

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
 * POST — Meta status updates (sent, delivered, read, failed) and incoming
 * client messages. Always returns 200 — Meta retries on other status codes.
 */
export async function POST(request) {
  const rawBody = await request.text()
  const appSecret = process.env.WHATSAPP_APP_SECRET

  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256")
    if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  } else {
    console.warn("[Webhook WhatsApp] WHATSAPP_APP_SECRET no configurado — firma no verificada")
  }

  try {
    const body = JSON.parse(rawBody)
    console.log("[Webhook WhatsApp] Payload recibido:", JSON.stringify(body))
    const entries = body.entry ?? []

    for (const entry of entries) {
      const changes = entry.changes ?? []
      for (const change of changes) {
        const statuses = change.value?.statuses ?? []
        for (const status of statuses) {
          console.log("[Webhook WhatsApp] Status:", JSON.stringify(status))
          await processStatus(status)
        }
      }
    }

    const messages = extractIncomingMessages(body)
    for (const msg of messages) {
      try {
        await persistIncomingMessage(msg)
      } catch (e) {
        console.error("[Webhook WhatsApp] Error procesando mensaje entrante:", e?.message)
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
    const err = status.errors?.[0]
    updateData.error = err?.title ?? "Unknown error"
    console.error(`[WHATSAPP_DELIVERY_FAILED] code=${err?.code} title="${err?.title}" message="${err?.message}" details="${err?.error_data?.details}"`)
  }

  const { error } = await getSupabaseAdmin()
    .from("notificaciones_enviadas")
    .update(updateData)
    .eq("wa_message_id", status.id)

  if (error) {
    console.error("[Webhook WhatsApp] Error updating notification:", error)
  }
}

async function persistIncomingMessage(msg) {
  const telefonoE164 = normalizePhoneToE164(msg.waId)
  if (!telefonoE164) return

  const supabase = getSupabaseAdmin()
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id")
    .eq("telefono_e164", telefonoE164)
    .maybeSingle()

  if (!cliente) return // Número desconocido — se descarta.

  const { data: conversacion, error: convError } = await supabase
    .from("whatsapp_conversaciones")
    .upsert(
      {
        cliente_id: cliente.id,
        telefono_e164: telefonoE164,
        last_message_at: new Date().toISOString(),
        last_message_preview: msg.type === "text" ? (msg.body?.slice(0, 120) ?? "") : "📎 Mensaje multimedia",
      },
      { onConflict: "cliente_id" }
    )
    .select("id")
    .single()

  if (convError || !conversacion) return

  const { error: insertError } = await supabase.from("whatsapp_mensajes").insert({
    conversacion_id: conversacion.id,
    direccion: "entrante",
    wa_message_id: msg.waMessageId,
    tipo: msg.type,
    body: msg.body,
  })

  // 23505 = unique_violation en wa_message_id — Meta reintentó un webhook ya procesado.
  if (insertError && insertError.code !== "23505") {
    console.error("[Webhook WhatsApp] Error insertando mensaje:", insertError.message)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/webhook-whatsapp.test.js`
Expected: PASS (12 tests — 6 existing + 6 new)

- [ ] **Step 5: Commit**

```bash
git add app/api/webhook/whatsapp/route.js __tests__/webhook-whatsapp.test.js
git commit -m "feat: verify webhook signature and persist incoming whatsapp messages"
```

---

### Task 5: Log outbound sends into the thread

**Files:**
- Modify: `lib/notifications/index.js`
- Modify: `__tests__/notifications.test.js`

**Interfaces:**
- Consumes: `normalizePhoneToE164` (Task 1), `getSupabaseAdmin`, tables from Task 2, `sendWhatsApp` (existing, returns `wa_message_id` or `null`).
- Produces: no new exports — `sendViaWhatsApp` now also writes to `whatsapp_conversaciones`/`whatsapp_mensajes` after a successful send.

This is the **current, real content** of `lib/notifications/index.js`:

```js
// lib/notifications/index.js
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

  await sendWhatsApp({
    to: data.clienteTelefono,
    templateName: row.template_name,
    languageCode: row.language_code,
    parameters,
  })
}
```

The preview text for the thread reuses the existing `plantillas_whatsapp` table (still present, still editable from `/admin` — see `app/api/admin/plantillas/route.js`, columns `tipo, mensaje, updated_at`). `mensaje` uses `{{var}}` placeholders, e.g. `"Hola {{clienteNombre}}, tu presupuesto..."`.

- [ ] **Step 1: Write the failing tests**

Replace `__tests__/notifications.test.js` with (existing tests preserved verbatim, new ones added):

```js
// __tests__/notifications.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks
const mockSendWhatsApp = vi.fn()

vi.mock('@/lib/notifications/whatsapp', () => ({
  sendWhatsApp: (...args) => mockSendWhatsApp(...args),
}))

// Mock Supabase admin — plantillas_whatsapp_meta (send), plantillas_whatsapp
// (preview text for the thread), clientes/whatsapp_conversaciones/whatsapp_mensajes (new).
const mockMetaRow = {
  template_name: 'presupuesto_ready_v2',
  language_code: 'en',
  param_keys: ['clienteNombre', 'numeroOrden', 'tipoArticulo', 'moneda', 'monto'],
}
const mockPreviewRow = { mensaje: 'Hola {{clienteNombre}}, tu presupuesto de {{tipoArticulo}} está listo.' }
const mockMensajeInsert = vi.fn().mockResolvedValue({ error: null })
let mockClienteResult = { data: { id: 'cliente-1' }, error: null }

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table) => {
      if (table === 'plantillas_whatsapp_meta') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockMetaRow, error: null }) }) }) }
      }
      if (table === 'plantillas_whatsapp') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockPreviewRow, error: null }) }) }) }
      }
      if (table === 'clientes') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(mockClienteResult) }) }) }
      }
      if (table === 'whatsapp_conversaciones') {
        return { upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'conv-1' }, error: null }) }) }) }
      }
      if (table === 'whatsapp_mensajes') {
        return { insert: (...args) => mockMensajeInsert(...args) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

describe('sendNotification', () => {
  beforeEach(() => {
    mockSendWhatsApp.mockReset()
    mockSendWhatsApp.mockResolvedValue('wamid.abc123')
    mockMensajeInsert.mockClear()
    mockClienteResult = { data: { id: 'cliente-1' }, error: null }
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
      templateName: 'presupuesto_ready_v2',
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
    expect(mockSendWhatsApp).toHaveBeenCalledOnce()
    expect(mockSendWhatsApp).toHaveBeenCalledWith({
      to: '59899123456',
      templateName: 'presupuesto_ready_v2',
      languageCode: 'en',
      parameters: ['Ana', '123', 'Reloj', 'UYU', '3500'],
    })
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

  it('registra el mensaje saliente en whatsapp_mensajes con el wa_message_id devuelto', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '59899123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(mockMensajeInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversacion_id: 'conv-1',
        direccion: 'saliente',
        wa_message_id: 'wamid.abc123',
        tipo: 'text',
        body: 'Hola Ana, tu presupuesto de Reloj está listo.',
        estado: 'enviado',
      })
    )
  })

  it('no registra el mensaje saliente si el envío de WhatsApp falla', async () => {
    mockSendWhatsApp.mockRejectedValue(new Error('meta down'))
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
    expect(mockMensajeInsert).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('no registra el mensaje saliente si el teléfono no matchea ningún cliente', async () => {
    mockClienteResult = { data: null, error: null }
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '59899123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(mockMensajeInsert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run __tests__/notifications.test.js`
Expected: the 4 existing tests PASS; the 3 new tests FAIL (`mockMensajeInsert` never called).

- [ ] **Step 3: Write the implementation**

```js
// lib/notifications/index.js
import { sendWhatsApp } from './whatsapp'
import { getSupabaseAdmin } from '../supabase-admin'
import { normalizePhoneToE164 } from '../phone'

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

  const waMessageId = await sendWhatsApp({
    to: data.clienteTelefono,
    templateName: row.template_name,
    languageCode: row.language_code,
    parameters,
  })

  await logOutboundWhatsAppMessage(type, data, waMessageId)
}

function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

/**
 * Registra el mensaje saliente en el hilo de whatsapp_mensajes para que la
 * bandeja de /whatsapp muestre ambos lados de la conversación. Nunca debe
 * bloquear ni fallar el envío real — es contabilidad secundaria.
 */
async function logOutboundWhatsAppMessage(type, data, waMessageId) {
  try {
    const telefonoE164 = normalizePhoneToE164(data.clienteTelefono)
    if (!telefonoE164) return

    const supabase = getSupabaseAdmin()
    const { data: cliente } = await supabase
      .from('clientes')
      .select('id')
      .eq('telefono_e164', telefonoE164)
      .maybeSingle()

    if (!cliente) return

    const { data: previewRow } = await supabase
      .from('plantillas_whatsapp')
      .select('mensaje')
      .eq('tipo', type)
      .single()
    const body = previewRow ? interpolate(previewRow.mensaje, data) : `[${type}]`

    const { data: conversacion, error: convError } = await supabase
      .from('whatsapp_conversaciones')
      .upsert(
        {
          cliente_id: cliente.id,
          telefono_e164: telefonoE164,
          last_message_at: new Date().toISOString(),
          last_message_preview: body.slice(0, 120),
        },
        { onConflict: 'cliente_id' }
      )
      .select('id')
      .single()

    if (convError || !conversacion) return

    await supabase.from('whatsapp_mensajes').insert({
      conversacion_id: conversacion.id,
      direccion: 'saliente',
      wa_message_id: waMessageId,
      tipo: 'text',
      body,
      estado: 'enviado',
    })
  } catch (e) {
    console.error('[Notifications] Error logging outbound whatsapp message:', e?.message)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/notifications.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/index.js __tests__/notifications.test.js
git commit -m "feat: log outbound whatsapp sends into the conversation thread"
```

---

### Task 6: Server-side query layer

**Files:**
- Create: `lib/whatsapp.js`
- Test: `lib/__tests__/whatsapp.test.js`

**Interfaces:**
- Consumes: `getSupabaseAdmin` (`lib/supabase-admin.js`) — **not** the anon client (`lib/supabase-client.js`). `whatsapp_conversaciones`/`whatsapp_mensajes` have no anon-readable RLS policy (Task 2), so this must run server-side only, same as `lib/data.js`'s admin-client functions.
- Produces: `getConversaciones() => Promise<Array<{id, cliente_id, telefono_e164, last_message_at, last_message_preview, clientes: {nombre}}>>`, `getMensajes(conversacionId: string) => Promise<Array<{id, direccion, tipo, body, created_at}>>` — consumed by Tasks 7 and 8.

- [ ] **Step 1: Write the failing tests**

```js
// lib/__tests__/whatsapp.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabase-admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import * as whatsappModule from "../whatsapp";
import { getSupabaseAdmin } from "../supabase-admin";

describe("whatsapp query layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getConversaciones", () => {
    it("returns conversations ordered by last_message_at desc", async () => {
      const mockData = [{ id: "conv-1", cliente_id: "cliente-1", clientes: { nombre: "Ana" } }];
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.getConversaciones();

      expect(result).toEqual(mockData);
      expect(mockClient.from).toHaveBeenCalledWith("whatsapp_conversaciones");
      expect(mockClient.order).toHaveBeenCalledWith("last_message_at", { ascending: false });
    });

    it("returns an empty array when there's no data", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      expect(await whatsappModule.getConversaciones()).toEqual([]);
    });

    it("throws when Supabase returns an error", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      await expect(whatsappModule.getConversaciones()).rejects.toEqual({ message: "boom" });
    });
  });

  describe("getMensajes", () => {
    it("returns messages for a conversation ordered chronologically", async () => {
      const mockData = [{ id: "msg-1", direccion: "entrante", tipo: "text", body: "Hola" }];
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.getMensajes("conv-1");

      expect(result).toEqual(mockData);
      expect(mockClient.eq).toHaveBeenCalledWith("conversacion_id", "conv-1");
      expect(mockClient.order).toHaveBeenCalledWith("created_at", { ascending: true });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/whatsapp.test.js`
Expected: FAIL — `lib/whatsapp.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```js
// lib/whatsapp.js
import { getSupabaseAdmin } from "./supabase-admin";

export async function getConversaciones() {
  const { data, error } = await getSupabaseAdmin()
    .from("whatsapp_conversaciones")
    .select("id, cliente_id, telefono_e164, last_message_at, last_message_preview, clientes(nombre)")
    .order("last_message_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getMensajes(conversacionId) {
  const { data, error } = await getSupabaseAdmin()
    .from("whatsapp_mensajes")
    .select("id, direccion, tipo, body, created_at")
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/whatsapp.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/whatsapp.js lib/__tests__/whatsapp.test.js
git commit -m "feat: add server-side query layer for whatsapp conversations"
```

---

### Task 7: API route — conversations list

**Files:**
- Create: `app/api/whatsapp/conversaciones/route.js`
- Test: `app/api/whatsapp/conversaciones/__tests__/route.test.js`

**Interfaces:**
- Consumes: `getConversaciones` (Task 6), `auth` (`@/auth`)
- Produces: `GET` handler returning `{ conversaciones: [...] }` — consumed by Task 12.

Auth pattern: mirror `app/api/clientes/route.js` exactly — `session?.user` check only, no role restriction (this codebase never role-gates read routes beyond admin-only mutation endpoints).

- [ ] **Step 1: Write the failing tests**

```js
// app/api/whatsapp/conversaciones/__tests__/route.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route.js";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ getConversaciones: vi.fn() }));

describe("GET /api/whatsapp/conversaciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there's no session", async () => {
    const { auth } = await import("@/auth");
    auth.mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the conversation list for an authenticated user", async () => {
    const { auth } = await import("@/auth");
    const { getConversaciones } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1", role: "employee" } });
    getConversaciones.mockResolvedValue([{ id: "conv-1" }]);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ conversaciones: [{ id: "conv-1" }] });
  });

  it("returns 500 when the query layer throws", async () => {
    const { auth } = await import("@/auth");
    const { getConversaciones } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1", role: "admin" } });
    getConversaciones.mockRejectedValue(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();
    expect(response.status).toBe(500);
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/whatsapp/conversaciones/__tests__/route.test.js`
Expected: FAIL — route doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```js
// app/api/whatsapp/conversaciones/route.js
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getConversaciones } from "@/lib/whatsapp"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const conversaciones = await getConversaciones()
    return NextResponse.json({ conversaciones })
  } catch (e) {
    console.error("[/api/whatsapp/conversaciones] GET error:", e)
    return NextResponse.json({ error: "Error al obtener conversaciones" }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/whatsapp/conversaciones/__tests__/route.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/whatsapp/conversaciones/route.js app/api/whatsapp/conversaciones/__tests__/route.test.js
git commit -m "feat: add GET /api/whatsapp/conversaciones"
```

---

### Task 8: API route — conversation thread

**Files:**
- Create: `app/api/whatsapp/conversaciones/[id]/mensajes/route.js`
- Test: `app/api/whatsapp/conversaciones/[id]/mensajes/__tests__/route.test.js`

**Interfaces:**
- Consumes: `getMensajes` (Task 6), `auth` (`@/auth`)
- Produces: `GET` handler returning `{ mensajes: [...] }` — consumed by Task 11.

Mirror `app/api/ordenes/[id]/route.js` for the dynamic-param and UUID-validation convention: `const { id } = await params` (params is a Promise in this codebase's Next 14 setup — always await it), reject non-UUID ids with 400 before querying.

- [ ] **Step 1: Write the failing tests**

```js
// app/api/whatsapp/conversaciones/[id]/mensajes/__tests__/route.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route.js";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ getMensajes: vi.fn() }));

const VALID_ID = "11111111-1111-1111-1111-111111111111";

describe("GET /api/whatsapp/conversaciones/[id]/mensajes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there's no session", async () => {
    const { auth } = await import("@/auth");
    auth.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: VALID_ID }) });
    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-UUID id", async () => {
    const { auth } = await import("@/auth");
    auth.mockResolvedValue({ user: { id: "user-1" } });

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(response.status).toBe(400);
  });

  it("returns the thread for an authenticated user", async () => {
    const { auth } = await import("@/auth");
    const { getMensajes } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getMensajes.mockResolvedValue([{ id: "msg-1", direccion: "entrante" }]);

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: VALID_ID }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ mensajes: [{ id: "msg-1", direccion: "entrante" }] });
    expect(getMensajes).toHaveBeenCalledWith(VALID_ID);
  });

  it("returns 500 when the query layer throws", async () => {
    const { auth } = await import("@/auth");
    const { getMensajes } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getMensajes.mockRejectedValue(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: VALID_ID }) });
    expect(response.status).toBe(500);
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/whatsapp/conversaciones/\[id\]/mensajes/__tests__/route.test.js`
Expected: FAIL — route doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```js
// app/api/whatsapp/conversaciones/[id]/mensajes/route.js
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getMensajes } from "@/lib/whatsapp"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request, { params }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 })

  try {
    const mensajes = await getMensajes(id)
    return NextResponse.json({ mensajes })
  } catch (e) {
    console.error("[/api/whatsapp/conversaciones/[id]/mensajes] GET error:", e)
    return NextResponse.json({ error: "Error al obtener mensajes" }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/whatsapp/conversaciones/\[id\]/mensajes/__tests__/route.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/api/whatsapp/conversaciones/[id]/mensajes/route.js" "app/api/whatsapp/conversaciones/[id]/mensajes/__tests__/route.test.js"
git commit -m "feat: add GET /api/whatsapp/conversaciones/[id]/mensajes"
```

---

### Task 9: WhatsApp icon component

**Files:**
- Create: `components/WhatsAppIcon.js`

**Interfaces:**
- Produces: `WhatsAppIcon({ className?: string })` — consumed by Tasks 10 and 12.

No test — static SVG wrapper, no logic branches, consistent with `components/Badge.js`/`components/StatCard.js` (also untested; `vitest.config.js` runs `environment: 'node'`, no DOM, no component render tests anywhere in this repo).

- [ ] **Step 1: Write the component**

```js
// components/WhatsAppIcon.js
export function WhatsAppIcon({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.79.47 3.47 1.29 4.93L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.13c-.24.68-1.4 1.3-1.93 1.37-.5.07-1.11.1-1.79-.11a15.9 15.9 0 0 1-1.72-.63c-3.03-1.31-5-4.36-5.15-4.56-.15-.2-1.23-1.64-1.23-3.13s.79-2.22 1.07-2.53c.28-.3.6-.38.8-.38h.58c.19 0 .43-.03.67.51.25.55.85 1.9.92 2.04.07.14.12.31.02.5-.1.2-.15.31-.3.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.3.75 1.24 1.62 2 1.11.99 2.05 1.3 2.35 1.45.3.15.47.13.65-.07.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.28.1 1.75.83 2.05.98.3.15.5.22.58.35.07.13.07.75-.17 1.43Z" />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/WhatsAppIcon.js
git commit -m "feat: add whatsapp icon component"
```

---

### Task 10: Header button on the main dashboard

**Files:**
- Modify: `app/page.js`

**Interfaces:**
- Consumes: `WhatsAppIcon` (Task 9)

The current header button block (`app/page.js` lines 153-158) reads:

```jsx
            <button
              onClick={() => setShowResumenCadete(true)}
              className="px-4 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5"
            >
              🚚 Cadete
            </button>
```

- [ ] **Step 1: Add the import**

Next to the other component imports (around line 13, after `ResumenCadetePanel`):

```js
import { WhatsAppIcon } from "@/components/WhatsAppIcon"
```

- [ ] **Step 2: Add the button immediately after the "🚚 Cadete" button**

```jsx
            <Link
              href="/whatsapp"
              className="px-4 py-2.5 bg-[#25D366] hover:bg-[#1DA851] text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5"
            >
              <WhatsAppIcon className="w-4 h-4" />
              WhatsApp
            </Link>
```

`Link` is already imported at the top of `app/page.js` (line 6) — no change needed there.

- [ ] **Step 3: Manually verify**

Run `npm run dev`, log in as `employee` and separately as `admin`, confirm the green "WhatsApp" button appears in the header for both (it 404s until Task 12 — expected at this point).

- [ ] **Step 4: Commit**

```bash
git add app/page.js
git commit -m "feat: add WhatsApp button to dashboard header"
```

---

### Task 11: Message thread panel

**Files:**
- Create: `components/WhatsAppHilo.js`

**Interfaces:**
- Consumes: `fetch('/api/whatsapp/conversaciones/{id}/mensajes')` (Task 8)
- Produces: `WhatsAppHilo({ conversacionId: string | null, clienteNombre: string })` — consumed by Task 12.

No dedicated test (same reason as Task 9 — no DOM test environment in this repo).

- [ ] **Step 1: Write the component**

```js
// components/WhatsAppHilo.js
"use client";

import { useEffect, useState, useCallback } from "react";

function formatHora(iso) {
  return new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
}

export function WhatsAppHilo({ conversacionId, clienteNombre }) {
  const [mensajes, setMensajes] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargarMensajes = useCallback(async () => {
    if (!conversacionId) return;
    try {
      const res = await fetch(`/api/whatsapp/conversaciones/${conversacionId}/mensajes`);
      const data = res.ok ? await res.json() : { mensajes: [] };
      setMensajes(data.mensajes ?? []);
    } catch (e) {
      console.error("Error cargando mensajes:", e);
    } finally {
      setLoading(false);
    }
  }, [conversacionId]);

  useEffect(() => {
    setLoading(true);
    cargarMensajes();
  }, [cargarMensajes]);

  // Polling — mismo patrón que components/TrasladosPanel.js (este proyecto
  // no usa Supabase Realtime en ningún lado).
  useEffect(() => {
    if (!conversacionId) return;
    const interval = setInterval(cargarMensajes, 5000);
    return () => clearInterval(interval);
  }, [conversacionId, cargarMensajes]);

  if (!conversacionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Seleccioná una conversación
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#e5ddd5] min-h-0">
      <div className="px-4 py-3 bg-slate-800 text-white font-semibold text-sm shrink-0">
        {clienteNombre}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {loading && <p className="text-center text-xs text-slate-500">Cargando...</p>}
        {!loading && mensajes.length === 0 && (
          <p className="text-center text-xs text-slate-500">Todavía no hay mensajes</p>
        )}
        {mensajes.map((m) => (
          <div
            key={m.id}
            className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${
              m.direccion === "saliente"
                ? "self-end bg-[#dcf8c6] text-slate-800"
                : "self-start bg-white text-slate-800"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">
              {m.tipo === "text" ? m.body : "📎 Mensaje multimedia"}
            </p>
            <p className="text-[10px] text-slate-400 mt-1 text-right">{formatHora(m.created_at)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/WhatsAppHilo.js
git commit -m "feat: add whatsapp thread panel component"
```

---

### Task 12: Main /whatsapp page

**Files:**
- Create: `app/whatsapp/page.js`

**Interfaces:**
- Consumes: `fetch('/api/whatsapp/conversaciones')` (Task 7), `WhatsAppHilo` (Task 11), `WhatsAppIcon` (Task 9)

- [ ] **Step 1: Write the page**

```js
// app/whatsapp/page.js
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { WhatsAppHilo } from "@/components/WhatsAppHilo";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";

function formatFecha(iso) {
  const fecha = new Date(iso);
  const hoy = new Date();
  const esHoy = fecha.toDateString() === hoy.toDateString();
  return esHoy
    ? fecha.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })
    : fecha.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" });
}

export default function WhatsAppPage() {
  const [conversaciones, setConversaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState(null);

  const cargarConversaciones = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/conversaciones");
      const data = res.ok ? await res.json() : { conversaciones: [] };
      setConversaciones(data.conversaciones ?? []);
    } catch (e) {
      console.error("Error cargando conversaciones:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarConversaciones();
  }, [cargarConversaciones]);

  // Polling — mismo patrón que app/page.js (30s) / TrasladosPanel.js (5s).
  // Este proyecto no usa Supabase Realtime en ningún lado.
  useEffect(() => {
    const interval = setInterval(cargarConversaciones, 15000);
    return () => clearInterval(interval);
  }, [cargarConversaciones]);

  async function handleLogout() {
    await signOut({ callbackUrl: "/login" });
  }

  const conversacionesFiltradas = conversaciones.filter((c) =>
    (c.clientes?.nombre ?? c.telefono_e164 ?? "").toLowerCase().includes(busqueda.toLowerCase())
  );

  const conversacionActual = conversaciones.find((c) => c.id === seleccionada);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 sm:px-6 py-4 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3 cursor-pointer">
            <span className="text-2xl">⌚</span>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">RepairTrack</h1>
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <WhatsAppIcon className="w-3 h-3" /> WhatsApp
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xs text-slate-400 hover:text-white transition-colors px-3 py-2">
              ← Volver al dashboard
            </Link>
            <button onClick={handleLogout} className="px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors">
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row bg-white md:my-6 md:rounded-xl md:shadow overflow-hidden md:h-[75vh] min-h-0">
        <div className={`w-full md:w-80 border-r border-slate-200 flex-col ${seleccionada ? "hidden md:flex" : "flex"}`}>
          <div className="p-3 border-b border-slate-200 shrink-0">
            <input
              type="text"
              placeholder="🔍 Buscar cliente..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/30"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && <p className="text-center text-xs text-slate-400 py-6">Cargando...</p>}
            {!loading && conversacionesFiltradas.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-6">Todavía no hay conversaciones</p>
            )}
            {conversacionesFiltradas.map((c) => (
              <button
                key={c.id}
                onClick={() => setSeleccionada(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                  seleccionada === c.id ? "bg-slate-100" : ""
                }`}
              >
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-medium text-sm text-slate-800 truncate">
                    {c.clientes?.nombre ?? c.telefono_e164}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0">{formatFecha(c.last_message_at)}</span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{c.last_message_preview}</p>
              </button>
            ))}
          </div>
        </div>

        <div className={`flex-1 flex-col min-h-0 ${seleccionada ? "flex" : "hidden md:flex"}`}>
          {seleccionada && (
            <button
              onClick={() => setSeleccionada(null)}
              className="md:hidden px-4 py-2 text-xs text-slate-500 border-b border-slate-200 text-left shrink-0"
            >
              ← Volver a conversaciones
            </button>
          )}
          <WhatsAppHilo
            conversacionId={seleccionada}
            clienteNombre={conversacionActual?.clientes?.nombre ?? conversacionActual?.telefono_e164}
          />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify end-to-end**

1. Run `npm run dev`, log in as `employee` and as `admin` — both should reach `/whatsapp` (via the header button from Task 10) without being redirected.
2. Log in as `cadete` and try navigating directly to `/whatsapp` — middleware should redirect to `/cadete`.
3. In Supabase Table Editor, manually insert a row into `whatsapp_conversaciones` (with a real `cliente_id`) and a couple of rows into `whatsapp_mensajes` (one `entrante`, one `saliente`) — confirm they render in the sidebar and thread with correct alignment/colors.
4. While the thread is open, insert another `whatsapp_mensajes` row directly in Supabase — confirm it appears within ~5s (polling), no manual refresh needed.
5. Resize the browser to a phone width — confirm the sidebar/thread toggle behaves like WhatsApp Web mobile (list first, tap in, "← Volver" to go back).

- [ ] **Step 3: Commit**

```bash
git add app/whatsapp/page.js
git commit -m "feat: add /whatsapp inbox page"
```

---

### Task 13: Configure Meta for incoming messages (manual, production)

Not a code task. The webhook URL and verify token are **already configured** in Meta for Developers (the route has been live for status updates) — this task only adds message delivery and the new signature secret.

- [ ] **Step 1:** Set `WHATSAPP_APP_SECRET` in Vercel → Settings → Environment Variables (get it from Meta for Developers → your app → Configuración básica → Secreto de la app), then redeploy.
- [ ] **Step 2:** In Meta for Developers → your app → WhatsApp → Configuration → Webhook fields, subscribe to `messages` (in addition to whatever's already subscribed for status updates).
- [ ] **Step 3:** Send a test WhatsApp message from a phone number that matches an existing `cliente.telefono`, and confirm it shows up in `/whatsapp` within ~15s (conversation list polling interval).

---

## Self-Review Notes

- **Spec coverage:** all sections of `docs/superpowers/specs/2026-08-06-whatsapp-inbox-design.md` are covered — DB/matching (Tasks 1-2), webhook extension + signature (Tasks 3-4), outbound thread integration (Task 5), server query layer + API routes (Tasks 6-8), UI + polling (Tasks 9-12), env var (Task 2), Meta-side wiring (Task 13).
- **Reality check performed:** this plan was rewritten after discovering the original draft was built against a stale local branch. Every task above was cross-checked against the actual current file contents in the worktree (`app/api/webhook/whatsapp/route.js`, `lib/notifications/index.js`, `lib/notifications/whatsapp.js`, `lib/countries.js`, RLS migrations 030-033, `app/page.js`, `app/api/clientes/route.js`, `app/api/ordenes/[id]/route.js`) rather than assumed from an earlier exploration.
- **Type consistency checked:** `normalizePhoneToE164` (Task 1) signature matches its usage in Tasks 4 and 5. `getConversaciones`/`getMensajes` (Task 6) return shapes match what Tasks 7-8's routes pass through and what `WhatsAppHilo`/`app/whatsapp/page.js` (Tasks 11-12) destructure (`clientes.nombre`, `direccion`, `tipo`, `body`, `created_at`, `last_message_at`, `last_message_preview`). `sendWhatsApp`'s return value (`wa_message_id` string or `null`) flows from Task 5 into `whatsapp_mensajes.wa_message_id`.
- **No placeholders:** every step has runnable code; no "add error handling"-style steps.
