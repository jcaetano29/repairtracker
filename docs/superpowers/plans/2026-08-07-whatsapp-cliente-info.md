# Teléfono en la lista + detalles del cliente en el chat — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the WhatsApp inbox, each chat-list row shows the client's phone number next to their name, and the open thread's header gets a three-dot menu with a "Ver detalles del usuario" option that opens a read-only modal showing the client's name, phone, and email.

**Architecture:** `getConversaciones()` already returns everything the chat list needs except the client's email — one column added to an existing `select()`. The client's `{ nombre, telefono, email }` is threaded down as a single prop from `app/whatsapp/page.js` into `WhatsAppHilo`, which owns the new three-dot menu and renders a new standalone read-only `DetalleClienteModal`. No new API routes, no new DB columns.

**Tech Stack:** Next.js 14 App Router (client components), Supabase (Postgres + `@supabase/supabase-js`), Vitest, Tailwind CSS.

## Global Constraints

- `getConversaciones()`'s exact `select()` string is asserted verbatim in an existing test (`lib/__tests__/whatsapp.test.js:37-39`) — any column change must update that assertion in the same task.
- Phone numbers are displayed exactly as stored in `telefono_e164` (E.164, e.g. `+59899111222`) — no formatting/spacing logic is added.
- Modal chrome (overlay, close behavior, dark-mode classes) follows the existing pattern in `components/DetalleOrdenModal.js`: `fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4` backdrop with `onClick={onClose}`, inner panel with `onClick={(e) => e.stopPropagation()}`, `bg-white dark:bg-slate-900 rounded-2xl shadow-2xl`, and a `×` close button.
- The three-dot menu's click-outside/Escape-to-close behavior follows the existing pattern in `components/PhoneInput.js:33-35,47-66` (a `wrapperRef` plus `document`-level `mousedown`/`keydown` listeners registered only while open).
- This project has no automated UI tests for the WhatsApp inbox (`app/whatsapp/page.js`, `components/WhatsAppHilo.js` have none today) — verify those changes manually, consistent with existing convention.
- Test runner: `npm test` (Vitest, `vitest run`).

---

### Task 1: `getConversaciones()` — bring back the client's email

**Files:**
- Modify: `lib/whatsapp.js:3-18` (`getConversaciones`)
- Test: `lib/__tests__/whatsapp.test.js:15-128` (`describe("getConversaciones", ...)`)

**Interfaces:**
- Produces: `getConversaciones()` rows now include `clientes: { nombre, email }` (previously just `{ nombre }`) — consumed by Task 3's `app/whatsapp/page.js`, which reads `conversacionActual.clientes.email`.

- [ ] **Step 1: Write the failing test**

In `lib/__tests__/whatsapp.test.js`, update the first `it` block in `describe("getConversaciones", ...)` (currently lines 16-41) so its mock data includes `email` and the `select` assertion expects the new column list:

```js
    it("returns conversations ordered by last_message_at desc, with unread computed", async () => {
      const mockData = [
        {
          id: "conv-1",
          cliente_id: "cliente-1",
          clientes: { nombre: "Ana", email: "ana@example.com" },
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
        "id, cliente_id, telefono_e164, last_message_at, last_message_preview, last_incoming_message_at, last_read_at, clientes(nombre, email)"
      );
      expect(mockClient.order).toHaveBeenCalledWith("last_message_at", { ascending: false });
    });
```

Leave every other `it` block in that `describe` (the `unread` true/false/null/equal-timestamp cases, the empty-array case, the error case) exactly as-is — they don't reference `clientes` and don't need changes.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/__tests__/whatsapp.test.js`
Expected: FAIL — the `select` assertion mismatches the current `clientes(nombre)` string.

- [ ] **Step 3: Implement**

In `lib/whatsapp.js`, change the `select(...)` call inside `getConversaciones` (currently lines 6-8):

```js
    .select(
      "id, cliente_id, telefono_e164, last_message_at, last_message_preview, last_incoming_message_at, last_read_at, clientes(nombre, email)"
    )
```

Nothing else in the function changes — the `unread` computation and `.map()` shape stay the same, `clientes` just carries one more field through the `...c` spread.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/__tests__/whatsapp.test.js`
Expected: PASS, all 7 tests in the file green (the other 6 `getConversaciones` cases plus the untouched `getMensajes`/`hayMensajesSinLeer`/`marcarInboxLeido`/`marcarConversacionLeida` blocks lower in the file are unaffected).

- [ ] **Step 5: Commit**

```bash
git add lib/whatsapp.js lib/__tests__/whatsapp.test.js
git commit -m "feat: include client email in getConversaciones"
```

---

### Task 2: `DetalleClienteModal` — new read-only client-details modal

**Files:**
- Create: `components/DetalleClienteModal.js`

**Interfaces:**
- Produces: `DetalleClienteModal({ cliente, onClose })` where `cliente` is `{ nombre?: string, telefono?: string, email?: string|null }` — consumed by Task 3's `components/WhatsAppHilo.js`.
- Consumes: nothing from earlier tasks — this is a standalone presentational component, buildable independently of Task 1.

No automated test — this project has no UI tests for modals of this kind (`DetalleOrdenModal.js`, its closest sibling, also has none). Verify by reading the finished component against the spec in Step 3 below; full manual verification happens in Task 3 once it's wired into the page.

- [ ] **Step 1: Write the component**

```jsx
// components/DetalleClienteModal.js
"use client";

function Fila({ etiqueta, valor }) {
  return (
    <div>
      <div className="text-xs text-slate-400 font-semibold tracking-wider">{etiqueta}</div>
      <div className="text-sm text-slate-800 dark:text-slate-100 mt-0.5">{valor}</div>
    </div>
  );
}

export function DetalleClienteModal({ cliente, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Detalles del usuario</h2>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            ×
          </button>
        </div>
        <div className="p-6 space-y-4">
          <Fila etiqueta="NOMBRE" valor={cliente?.nombre || "No especificado"} />
          <Fila etiqueta="TELÉFONO" valor={cliente?.telefono || "No especificado"} />
          <Fila etiqueta="EMAIL" valor={cliente?.email || "No especificado"} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Sanity-check the file**

Re-read the file you just wrote and confirm: it's a valid standalone client component (`"use client"` at the top, one named export `DetalleClienteModal`), it doesn't import anything project-specific that could fail to resolve (no imports at all, in fact — it's pure JSX + one small local helper), and the three `Fila` rows use `||` (not `??`) so an empty-string `email` also falls back to "No especificado", matching the spec's "si `email` es `null`/vacío, muestra 'No especificado'".

- [ ] **Step 3: Commit**

```bash
git add components/DetalleClienteModal.js
git commit -m "feat: add read-only client-details modal for WhatsApp inbox"
```

---

### Task 3: Wire it up — phone in the chat list, three-dot menu in the thread header

**Files:**
- Modify: `app/whatsapp/page.js:142` (chat-list row name), `app/whatsapp/page.js:161-164` (prop passed to `WhatsAppHilo`)
- Modify: `components/WhatsAppHilo.js` (header layout, new menu + modal state)

**Interfaces:**
- Consumes: `DetalleClienteModal` from Task 2 (`components/DetalleClienteModal.js`), `clientes.email` now present on conversation rows from Task 1.
- Produces: nothing consumed elsewhere — this is the last task.

No automated test for either file (existing project convention for this inbox). Verify manually per Step 4 below.

- [ ] **Step 1: Phone number in the chat-list row**

In `app/whatsapp/page.js`, replace the name line inside the chat-list `.map()` (currently line 142):

```jsx
                    {c.clientes?.nombre ?? c.telefono_e164}
```

with:

```jsx
                    {c.clientes?.nombre ? `${c.clientes.nombre} (${c.telefono_e164})` : c.telefono_e164}
```

- [ ] **Step 2: Pass the full client object to `WhatsAppHilo` instead of just the name**

In the same file, replace the `WhatsAppHilo` usage (currently lines 161-164):

```jsx
          <WhatsAppHilo
            conversacionId={seleccionada}
            clienteNombre={conversacionActual?.clientes?.nombre ?? conversacionActual?.telefono_e164}
          />
```

with:

```jsx
          <WhatsAppHilo
            conversacionId={seleccionada}
            cliente={{
              nombre: conversacionActual?.clientes?.nombre,
              telefono: conversacionActual?.telefono_e164,
              email: conversacionActual?.clientes?.email,
            }}
          />
```

- [ ] **Step 3: `WhatsAppHilo` — three-dot menu + modal**

In `components/WhatsAppHilo.js`:

1. Update the imports (currently line 1-3):

```js
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { DetalleClienteModal } from "./DetalleClienteModal";
```

2. Change the function signature (currently line 9) from `({ conversacionId, clienteNombre })` to `({ conversacionId, cliente })`.

3. Inside the component, right after the existing `useState` declarations (currently `mensajes`/`loading`, lines 10-11), add:

```js
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [mostrarDetalle, setMostrarDetalle] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuAbierto) return;

    function handleMouseDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAbierto(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setMenuAbierto(false);
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuAbierto]);
```

This mirrors `components/PhoneInput.js:47-66`'s click-outside/Escape pattern exactly (same event names, same guard-while-open shape), just renamed to this component's state.

4. Replace the header bar (currently lines 49-51):

```jsx
      <div className="px-4 py-3 bg-slate-800 text-white font-semibold text-sm shrink-0">
        {clienteNombre}
      </div>
```

with:

```jsx
      <div className="px-4 py-3 bg-slate-800 text-white font-semibold text-sm shrink-0 flex items-center justify-between">
        <span>{cliente?.nombre ?? cliente?.telefono}</span>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuAbierto}
            aria-label="Más opciones"
            className="px-2 py-1 text-slate-300 hover:text-white rounded"
          >
            ⋮
          </button>
          {menuAbierto && (
            <div
              role="menu"
              className="absolute right-0 mt-1 w-56 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-10"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuAbierto(false);
                  setMostrarDetalle(true);
                }}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Ver detalles del usuario
              </button>
            </div>
          )}
        </div>
      </div>
      {mostrarDetalle && (
        <DetalleClienteModal cliente={cliente} onClose={() => setMostrarDetalle(false)} />
      )}
```

Note this places the modal's conditional render as a sibling right after the header `div`, still inside the component's outer `<div className="flex-1 flex flex-col bg-[#e5ddd5] min-h-0">` — `DetalleClienteModal` is `fixed inset-0`, so its position in the tree doesn't affect layout, only where it needs to live within the JSX for React to mount it.

- [ ] **Step 4: Start the dev server and confirm it compiles**

Run: `npm run dev` (in background), load `/whatsapp`, confirm no console errors, and that the existing chat list / selection / message thread still work as before.

- [ ] **Step 5: Manual verification**

1. In the chat list, confirm each row shows `Nombre (+598...)` when the conversation has a linked client with a name, and just the phone number when it doesn't.
2. Open a chat. Confirm the header now shows the client's name on the left and a `⋮` button on the right.
3. Click `⋮` — confirm the "Ver detalles del usuario" menu appears; click elsewhere on the page — confirm it closes; open it again and press Escape — confirm it closes.
4. Click "Ver detalles del usuario" — confirm the modal opens showing Nombre/Teléfono/Email with the correct values for that conversation's client (and "No especificado" for a client with no email on file, if you have one to test with).
5. Click the modal's `×` or click outside it — confirm it closes.
6. Toggle dark mode and repeat steps 2-5 — confirm the header, menu, and modal are all legible.

- [ ] **Step 6: Commit**

```bash
git add app/whatsapp/page.js components/WhatsAppHilo.js
git commit -m "feat: show client phone in chat list and add client-details menu to thread header"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 (phone in list + email in the select) is Task 1 + Task 3 Step 1; Part 2 (three-dot menu + read-only modal) is Task 2 + Task 3 Steps 2-3. Both spec sections have tasks.
- **Type consistency:** `cliente` prop shape `{ nombre, telefono, email }` is identical across Task 3's `page.js` (producer) and `WhatsAppHilo.js`/`DetalleClienteModal` (consumers) — no field-name drift (in particular, `telefono` here, not `telefono_e164`, matching the spec's explicit prop-shape choice).
- **No placeholders:** every step has literal, complete code.
