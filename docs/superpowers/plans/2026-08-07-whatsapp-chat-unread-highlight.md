# Resaltado de chats con mensajes nuevos — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the WhatsApp inbox (`app/whatsapp/page.js`), the specific conversation(s) that have an unread incoming message show a bold name + green dot in the chat list, clearing when that chat is opened.

**Architecture:** Two new columns on `whatsapp_conversaciones` (`last_incoming_message_at`, `last_read_at`) let `getConversaciones()` compute a per-row `unread` boolean. A new `POST` route marks a single conversation read; the frontend calls it on click (optimistic) and again on each poll while that chat stays open, so a message arriving on an already-open chat never gets stuck "unread".

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + `@supabase/supabase-js`), Vitest, Tailwind CSS.

## Global Constraints

- Auth pattern for all API routes: `const session = await auth(); if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })` (from `@/auth`).
- Conversation id validation: `const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;` — 400 with `{ error: "id inválido" }` on mismatch.
- All Supabase access from server code goes through `getSupabaseAdmin()` (`@/lib/supabase-admin`) — never the anon client.
- Migration files are numbered SQL files in `supabase/`, wrapped in `BEGIN; ... COMMIT;`. Next free number is `037`.
- Read state is shared across all admin users/computers (one row per conversation, not per session) — same model as the existing global inbox badge.
- Test runner: `npm test` (Vitest, `vitest run`). Mocks use `vi.mock` with manual mock objects — see existing files for the exact chained-method mock shape (`from().select().order()` etc. via `mockReturnThis()`).

---

### Task 1: Migration — add unread-tracking columns

**Files:**
- Create: `supabase/037_whatsapp_conversaciones_unread.sql`

**Interfaces:**
- Produces: columns `whatsapp_conversaciones.last_incoming_message_at TIMESTAMPTZ` (nullable) and `whatsapp_conversaciones.last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, consumed by Task 2 and Task 4.

This is a pure SQL migration — no automated test in this repo covers migration files directly (consistent with `036_whatsapp_inbox_estado.sql`, which also has none). Verify by running it against the dev database.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/037_whatsapp_conversaciones_unread.sql
-- Per-conversation unread tracking for the WhatsApp inbox chat list, to
-- complement the existing global inbox badge (036_whatsapp_inbox_estado.sql).

BEGIN;

ALTER TABLE whatsapp_conversaciones
  ADD COLUMN last_incoming_message_at TIMESTAMPTZ,
  ADD COLUMN last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMIT;
```

- [ ] **Step 2: Apply it to the dev database and confirm the columns exist**

Run the migration the same way the project applies the others (Supabase SQL editor or the project's existing migration-runner convention — check `supabase/036_whatsapp_inbox_estado.sql`'s neighboring tooling if any; if none, apply manually via the Supabase dashboard SQL editor against the dev project).

Verify:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'whatsapp_conversaciones'
  AND column_name IN ('last_incoming_message_at', 'last_read_at');
```
Expected: two rows, `last_read_at` has `is_nullable = 'NO'` and a `now()` default; `last_incoming_message_at` is nullable with no default.

- [ ] **Step 3: Commit**

```bash
git add supabase/037_whatsapp_conversaciones_unread.sql
git commit -m "feat: add per-conversation unread tracking columns"
```

---

### Task 2: Webhook — stamp `last_incoming_message_at` on incoming messages

**Files:**
- Modify: `app/api/webhook/whatsapp/route.js:125-137` (the `whatsapp_conversaciones` upsert inside `persistIncomingMessage`)
- Test: `__tests__/webhook-whatsapp.test.js`

**Interfaces:**
- Consumes: nothing new — same `getSupabaseAdmin()` client already used in this file.
- Produces: the `whatsapp_conversaciones` upsert now includes `last_incoming_message_at`, which Task 3's `getConversaciones()` reads.

- [ ] **Step 1: Update the test mock to capture the upsert payload**

The current mock for `whatsapp_conversaciones` in `__tests__/webhook-whatsapp.test.js` doesn't record what `upsert` was called with. Change it to a spy, mirroring how `mockMensajeInsert` already works for `whatsapp_mensajes`:

```js
// Replace this existing block (around line 34-40):
      if (table === 'whatsapp_conversaciones') {
        return {
          upsert: () => ({
            select: () => ({ single: () => Promise.resolve(mockConversacionResult) }),
          }),
        }
      }
```

with:

```js
      if (table === 'whatsapp_conversaciones') {
        return {
          upsert: (...args) => {
            mockConversacionUpsert(...args)
            return { select: () => ({ single: () => Promise.resolve(mockConversacionResult) }) }
          },
        }
      }
```

Add the spy declaration near `mockMensajeInsert` (around line 17):

```js
const mockMensajeInsert = vi.fn().mockResolvedValue({ error: null })
const mockConversacionUpsert = vi.fn()
```

Add it to the `beforeEach` clear block (around line 55-56):

```js
  mockUpdate.mockClear()
  mockMensajeInsert.mockClear()
  mockConversacionUpsert.mockClear()
```

- [ ] **Step 2: Write the failing test**

Add to the `'POST /api/webhook/whatsapp — incoming messages'` describe block, after the existing `'persists a text message from a known client and updates the conversation'` test:

```js
  it('stamps last_incoming_message_at on the conversation upsert', async () => {
    const { POST } = await import('@/app/api/webhook/whatsapp/route')

    const rawBody = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ id: 'wamid.in4', from: '59899111222', type: 'text', text: { body: 'Hola' } }] } }] }],
    })

    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      body: rawBody,
    }))

    expect(res.status).toBe(200)
    expect(mockConversacionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        last_message_at: expect.any(String),
        last_incoming_message_at: expect.any(String),
      }),
      { onConflict: 'cliente_id' }
    )
  })
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- webhook-whatsapp`
Expected: FAIL — `mockConversacionUpsert` was not called with `last_incoming_message_at` (property missing), since the route doesn't set it yet.

- [ ] **Step 4: Implement**

In `app/api/webhook/whatsapp/route.js`, update the upsert payload inside `persistIncomingMessage` (currently lines ~128-133):

```js
    .upsert(
      {
        cliente_id: cliente.id,
        telefono_e164: telefonoE164,
        last_message_at: new Date().toISOString(),
        last_incoming_message_at: new Date().toISOString(),
        last_message_preview: msg.type === "text" ? (msg.body?.slice(0, 120) ?? "") : "📎 Mensaje multimedia",
      },
      { onConflict: "cliente_id" }
    )
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- webhook-whatsapp`
Expected: PASS, all tests in the file green.

- [ ] **Step 6: Commit**

```bash
git add app/api/webhook/whatsapp/route.js __tests__/webhook-whatsapp.test.js
git commit -m "feat: stamp last_incoming_message_at on incoming WhatsApp messages"
```

---

### Task 3: `lib/whatsapp.js` — compute `unread` and add `marcarConversacionLeida`

**Files:**
- Modify: `lib/whatsapp.js` (`getConversaciones`, new `marcarConversacionLeida`)
- Test: `lib/__tests__/whatsapp.test.js`

**Interfaces:**
- Consumes: `getSupabaseAdmin()` from `@/lib/whatsapp`'s existing import.
- Produces:
  - `getConversaciones(): Promise<Array<{ id, cliente_id, telefono_e164, last_message_at, last_message_preview, last_incoming_message_at, last_read_at, clientes, unread: boolean }>>` — consumed by `app/api/whatsapp/conversaciones/route.js` (unchanged, just passes through) and Task 5's frontend.
  - `marcarConversacionLeida(conversacionId: string): Promise<void>` — consumed by Task 4's new route.

- [ ] **Step 1: Write the failing tests**

Replace the two `getConversaciones` assertions on the select string (they'll need the new columns) and add `unread` coverage. In `lib/__tests__/whatsapp.test.js`, update the `describe("getConversaciones", ...)` block:

```js
  describe("getConversaciones", () => {
    it("returns conversations ordered by last_message_at desc, with unread computed", async () => {
      const mockData = [
        {
          id: "conv-1",
          cliente_id: "cliente-1",
          clientes: { nombre: "Ana" },
          last_incoming_message_at: "2026-08-07T10:00:00.000Z",
          last_read_at: "2026-08-06T00:00:00.000Z",
        },
      ];
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.getConversaciones();

      expect(result).toEqual([{ ...mockData[0], unread: true }]);
      expect(mockClient.from).toHaveBeenCalledWith("whatsapp_conversaciones");
      expect(mockClient.select).toHaveBeenCalledWith(
        "id, cliente_id, telefono_e164, last_message_at, last_message_preview, last_incoming_message_at, last_read_at, clientes(nombre)"
      );
      expect(mockClient.order).toHaveBeenCalledWith("last_message_at", { ascending: false });
    });

    it("marks unread false when last_incoming_message_at is before last_read_at", async () => {
      const mockData = [
        {
          id: "conv-2",
          last_incoming_message_at: "2026-08-01T00:00:00.000Z",
          last_read_at: "2026-08-06T00:00:00.000Z",
        },
      ];
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.getConversaciones();

      expect(result[0].unread).toBe(false);
    });

    it("marks unread false when last_incoming_message_at is null", async () => {
      const mockData = [{ id: "conv-3", last_incoming_message_at: null, last_read_at: "2026-08-06T00:00:00.000Z" }];
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.getConversaciones();

      expect(result[0].unread).toBe(false);
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
```

Also add a new `describe("marcarConversacionLeida", ...)` block after the existing `describe("marcarInboxLeido", ...)` block:

```js
  describe("marcarConversacionLeida", () => {
    it("updates last_read_at for the given conversation id", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      await whatsappModule.marcarConversacionLeida("conv-1");

      expect(mockClient.from).toHaveBeenCalledWith("whatsapp_conversaciones");
      expect(mockClient.update).toHaveBeenCalledWith(expect.objectContaining({ last_read_at: expect.any(String) }));
      expect(mockClient.eq).toHaveBeenCalledWith("id", "conv-1");
    });

    it("throws when Supabase returns an error", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      await expect(whatsappModule.marcarConversacionLeida("conv-1")).rejects.toEqual({ message: "boom" });
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/__tests__/whatsapp.test.js`
Expected: FAIL — `getConversaciones` select string mismatch, `unread` undefined, `marcarConversacionLeida is not a function`.

- [ ] **Step 3: Implement**

In `lib/whatsapp.js`, replace `getConversaciones` and add `marcarConversacionLeida` (after the existing `marcarInboxLeido`):

```js
export async function getConversaciones() {
  const { data, error } = await getSupabaseAdmin()
    .from("whatsapp_conversaciones")
    .select(
      "id, cliente_id, telefono_e164, last_message_at, last_message_preview, last_incoming_message_at, last_read_at, clientes(nombre)"
    )
    .order("last_message_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((c) => ({
    ...c,
    unread: !!c.last_incoming_message_at && c.last_incoming_message_at > c.last_read_at,
  }));
}
```

```js
export async function marcarConversacionLeida(conversacionId) {
  const { error } = await getSupabaseAdmin()
    .from("whatsapp_conversaciones")
    .update({ last_read_at: new Date().toISOString() })
    .eq("id", conversacionId);
  if (error) throw error;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/__tests__/whatsapp.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/whatsapp.js lib/__tests__/whatsapp.test.js
git commit -m "feat: compute per-conversation unread flag and add marcarConversacionLeida"
```

---

### Task 4: API route — `POST /api/whatsapp/conversaciones/[id]/marcar-leido`

**Files:**
- Create: `app/api/whatsapp/conversaciones/[id]/marcar-leido/route.js`
- Test: `app/api/whatsapp/conversaciones/[id]/marcar-leido/__tests__/route.test.js`

**Interfaces:**
- Consumes: `marcarConversacionLeida(conversacionId: string): Promise<void>` from Task 3.
- Produces: `POST` handler returning `{ ok: true }` (200), `{ error: "No autorizado" }` (401), `{ error: "id inválido" }` (400), `{ error: "Error al marcar como leído" }` (500) — consumed by Task 5's frontend `fetch` call.

- [ ] **Step 1: Write the failing tests**

```js
// app/api/whatsapp/conversaciones/[id]/marcar-leido/__tests__/route.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route.js";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ marcarConversacionLeida: vi.fn() }));

import { auth } from "@/auth";
import { marcarConversacionLeida } from "@/lib/whatsapp";

describe("POST /api/whatsapp/conversaciones/[id]/marcar-leido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    auth.mockResolvedValue(null);

    const params = Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" });
    const response = await POST(new Request("http://localhost/x"), { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("No autorizado");
    expect(marcarConversacionLeida).not.toHaveBeenCalled();
  });

  it("returns 400 when id is not a valid UUID", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });

    const params = Promise.resolve({ id: "not-a-uuid" });
    const response = await POST(new Request("http://localhost/x"), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("id inválido");
  });

  it("marks the conversation as read for a valid id", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    marcarConversacionLeida.mockResolvedValue(undefined);

    const conversacionId = "550e8400-e29b-41d4-a716-446655440000";
    const params = Promise.resolve({ id: conversacionId });
    const response = await POST(new Request("http://localhost/x"), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(marcarConversacionLeida).toHaveBeenCalledWith(conversacionId);
  });

  it("returns 500 when marcarConversacionLeida throws", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    marcarConversacionLeida.mockRejectedValue(new Error("boom"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const conversacionId = "550e8400-e29b-41d4-a716-446655440000";
    const params = Promise.resolve({ id: conversacionId });
    const response = await POST(new Request("http://localhost/x"), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Error al marcar como leído");

    consoleErrorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- marcar-leido`
Expected: FAIL — module `../route.js` doesn't exist yet.

- [ ] **Step 3: Implement**

```js
// app/api/whatsapp/conversaciones/[id]/marcar-leido/route.js
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { marcarConversacionLeida } from "@/lib/whatsapp";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- marcar-leido`
Expected: PASS, all 4 tests green (this also re-runs the existing `estado/marcar-leido` test file since it matches the same substring — confirm both files show green).

- [ ] **Step 5: Commit**

```bash
git add app/api/whatsapp/conversaciones/[id]/marcar-leido/route.js app/api/whatsapp/conversaciones/[id]/marcar-leido/__tests__/route.test.js
git commit -m "feat: add route to mark a single WhatsApp conversation as read"
```

---

### Task 5: Frontend — bold + green dot, mark-as-read on click and while open

**Files:**
- Modify: `app/whatsapp/page.js`

**Interfaces:**
- Consumes: `POST /api/whatsapp/conversaciones/${id}/marcar-leido` (Task 4), `conversaciones[].unread: boolean` (Task 3, arrives via `GET /api/whatsapp/conversaciones` unchanged passthrough).
- Produces: nothing consumed elsewhere — this is the leaf UI.

No automated test — this file has none today and the project's own spec/plan for the sibling badge feature also treats WhatsApp inbox UI as manually verified (`lib/__tests__/*` covers logic, not UI). Verify manually per Step 3.

- [ ] **Step 1: Implement mark-as-read on click + while-open re-marking**

In `app/whatsapp/page.js`, add a helper and wire it into the click handler and the polling effect.

Replace the `cargarConversaciones` callback (lines 24-35) to also re-mark the currently open conversation as read when it comes back with `unread: true` (covers "message arrives while chat is open"):

```js
  const cargarConversaciones = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/conversaciones");
      const data = res.ok ? await res.json() : { conversaciones: [] };
      const nuevas = data.conversaciones ?? [];
      setConversaciones(nuevas);
      fetch("/api/whatsapp/estado/marcar-leido", { method: "POST" }).catch(() => {});

      setSeleccionada((actual) => {
        const abierta = nuevas.find((c) => c.id === actual);
        if (abierta?.unread) marcarConversacionLeida(actual);
        return actual;
      });
    } catch (e) {
      console.error("Error cargando conversaciones:", e);
    } finally {
      setLoading(false);
    }
  }, []);
```

Add the `marcarConversacionLeida` helper above the component (after `formatFecha`, around line 17):

```js
function marcarConversacionLeida(conversacionId) {
  fetch(`/api/whatsapp/conversaciones/${conversacionId}/marcar-leido`, { method: "POST" }).catch(() => {});
}
```

Update the chat-selection click handler (lines 98-114) to mark read + optimistically clear `unread` locally:

```jsx
            {conversacionesFiltradas.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSeleccionada(c.id);
                  if (c.unread) {
                    marcarConversacionLeida(c.id);
                    setConversaciones((prev) =>
                      prev.map((conv) => (conv.id === c.id ? { ...conv, unread: false } : conv))
                    );
                  }
                }}
                className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                  seleccionada === c.id ? "bg-slate-100 dark:bg-slate-950" : ""
                }`}
              >
                <div className="flex justify-between items-baseline gap-2">
                  <span
                    className={`text-sm truncate flex items-center gap-1.5 ${
                      c.unread
                        ? "font-bold text-slate-900 dark:text-white"
                        : "font-medium text-slate-800 dark:text-slate-100"
                    }`}
                  >
                    {c.unread && (
                      <span className="w-2 h-2 rounded-full bg-[#25D366] shrink-0" aria-label="Mensaje nuevo" />
                    )}
                    {c.clientes?.nombre ?? c.telefono_e164}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0">{formatFecha(c.last_message_at)}</span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{c.last_message_preview}</p>
              </button>
            ))}
```

- [ ] **Step 2: Start the dev server and sanity-check it compiles**

Run: `npm run dev` (in background, or a separate terminal), then load `/whatsapp` and confirm no console errors and the existing list/selection behavior still works.

- [ ] **Step 3: Manual verification against the dev database**

1. Send a test WhatsApp message from a known client's number (or manually run the equivalent upsert/insert against `whatsapp_conversaciones`/`whatsapp_mensajes` with `direccion = 'entrante'` in the dev DB, setting `last_incoming_message_at` newer than that row's `last_read_at`).
2. Reload `/whatsapp` — confirm that conversation's name renders bold with a green dot, and other conversations don't.
3. Click that conversation — confirm the bold/dot disappears immediately (optimistic update), and re-fetching `/api/whatsapp/conversaciones` afterward still shows `unread: false` for it (confirms the `marcar-leido` POST persisted).
4. With that conversation still open, insert another incoming message for the same conversation directly in the dev DB (simulating a message arriving while the chat is open) and wait for the next 15s poll — confirm it does NOT show as bold/highlighted (the while-open re-marking should keep it clear).
5. Toggle dark mode and confirm the bold text and green dot remain legible.

- [ ] **Step 4: Commit**

```bash
git add app/whatsapp/page.js
git commit -m "feat: highlight WhatsApp chats with unread messages in the inbox list"
```

---

## Self-Review Notes

- **Spec coverage:** migration (Task 1), webhook stamp (Task 2), `getConversaciones`/`marcarConversacionLeida` (Task 3), new route (Task 4), frontend click + while-open re-marking + bold/dot render (Task 5) — all spec sections have a task.
- **Type consistency:** `marcarConversacionLeida(conversacionId: string)` name and signature match across Task 3 (definition), Task 4 (route import/call), and the plan's Global Constraints/Interfaces blocks. `unread: boolean` field name is consistent from Task 3's `getConversaciones()` through to Task 5's JSX.
- **No placeholders:** every step has literal code, not descriptions of code.
