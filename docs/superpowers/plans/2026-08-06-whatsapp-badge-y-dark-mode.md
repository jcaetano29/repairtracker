# Badge de WhatsApp sin leer + Modo oscuro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add (1) a shared red "unread WhatsApp messages" badge on the dashboard's WhatsApp button, and (2) an app-wide light/dark theme toggle.

**Architecture:** Part 1 adds a singleton-row Supabase table (`whatsapp_inbox_estado`) plus two authenticated API routes, polled by the dashboard the same way the rest of the app polls (no Realtime). Part 2 adds a React context (`ThemeProvider`) that toggles Tailwind's `dark` class on `<html>` and persists to `localStorage`, plus a mechanical `dark:` class retrofit across every existing page/component using a fixed lookup table.

**Tech Stack:** Next.js 14 (App Router), React 18, Tailwind CSS 3.4, Supabase (`@supabase/supabase-js`), NextAuth 5 (`@/auth`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-whatsapp-badge-y-dark-mode-design.md`

## Global Constraints

- RLS on new tables: no policies for `anon`/`authenticated` — all access via `service_role` through `getSupabaseAdmin()` (`lib/supabase-admin.js`), same as `031_lockdown_pii.sql` / `034_whatsapp_inbox.sql`.
- New API routes require a session: `const session = await auth()` (imported from `@/auth`), return `NextResponse.json({ error: "No autorizado" }, { status: 401 })` when `!session?.user` — exact pattern in `app/api/whatsapp/conversaciones/route.js`.
- This project never uses Supabase Realtime — all live updates are `setInterval` polling.
- Badge is a boolean indicator ("hay mensajes nuevos"), not a real unread count.
- Theme always initializes to `'light'` — no OS preference detection.
- This project has zero React-component tests today (no `@testing-library/react`, Vitest `environment: 'node'` in `vitest.config.js`, no `.test.jsx` files anywhere). Do not add component-testing infrastructure as part of this plan — `ThemeProvider`/`ThemeToggle` are verified manually, consistent with how the rest of the app's UI is tested (only `lib/*` and `app/api/*` have automated tests).
- Dark-mode class mapping table (apply verbatim wherever these classes appear in a page/component being retrofitted, unless the exception column applies):

  | Existing class | Add | Exception |
  |---|---|---|
  | `bg-slate-100` / `bg-slate-50` (page background) | `dark:bg-slate-950` | — |
  | `bg-white` (cards, modals, inputs) | `dark:bg-slate-900` | — |
  | `text-slate-900` / `text-slate-800` (primary text) | `dark:text-slate-100` | — |
  | `text-slate-700` (body text, e.g. privacy policy prose) | `dark:text-slate-300` | — |
  | `text-slate-600` (secondary text, e.g. nav links) | `dark:text-slate-400` | — |
  | `text-slate-500` / `text-slate-400` (muted text) | *(leave as-is)* | Already readable on dark backgrounds; only override per-instance if a manual check finds bad contrast |
  | `border-slate-200` / `border-slate-300` | `dark:border-slate-700` | — |
  | `bg-gradient-to-r from-slate-900 to-slate-800` (headers) | *(no change)* | Already dark, reads fine in both themes |
  | Any inline `style={{ color, backgroundColor }}` driven by `ESTADOS`/status config (e.g. `components/Badge.js`, `TrasladosBadge.js`) | *(no change)* | Semantic status colors, not surface colors |
  | Brand colors (`#25D366` WhatsApp green, `bg-indigo-500`, `bg-red-*` error states) | *(no change)* | Semantic/brand colors, not surface colors |

  Applying the table means: find the class in the file's `className` string, add the corresponding `dark:` class right next to it in the same string. Do not restructure the JSX or introduce a CSS-variable/token system.

---

## Part 1: Badge de mensajes sin leer

### Task 1: Migración SQL + funciones de query (`lib/whatsapp.js`)

**Files:**
- Create: `supabase/035_whatsapp_inbox_estado.sql`
- Modify: `lib/whatsapp.js`
- Test: `lib/__tests__/whatsapp.test.js`

**Interfaces:**
- Produces: `hayMensajesSinLeer(): Promise<boolean>`, `marcarInboxLeido(): Promise<void>` — consumed by Tasks 2 and 3.

- [ ] **Step 1: Create the migration**

```sql
-- supabase/035_whatsapp_inbox_estado.sql
-- Shared "last read" marker for the WhatsApp inbox badge — one row, applies
-- to everyone (not per-user).

BEGIN;

CREATE TABLE whatsapp_inbox_estado (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO whatsapp_inbox_estado (id, last_read_at) VALUES (1, NOW());

-- PII-adjacent (implies message activity) — same lockdown criterion as
-- 031_lockdown_pii.sql / 034_whatsapp_inbox.sql: no anon/authenticated
-- policies. All access via getSupabaseAdmin() from authenticated API routes.
ALTER TABLE whatsapp_inbox_estado ENABLE ROW LEVEL SECURITY;

COMMIT;
```

- [ ] **Step 2: Write the failing tests**

Add to `lib/__tests__/whatsapp.test.js`, inside the existing `describe("whatsapp query layer", ...)` block, after the `getMensajes` describe block:

```js
  describe("hayMensajesSinLeer", () => {
    it("returns true when there's an incoming message after last_read_at", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { last_read_at: "2026-08-01T00:00:00.000Z" }, error: null }),
        gt: vi.fn().mockResolvedValue({ count: 2, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.hayMensajesSinLeer();

      expect(result).toBe(true);
      expect(mockClient.from).toHaveBeenCalledWith("whatsapp_inbox_estado");
      expect(mockClient.from).toHaveBeenCalledWith("whatsapp_mensajes");
      expect(mockClient.eq).toHaveBeenCalledWith("id", 1);
      expect(mockClient.eq).toHaveBeenCalledWith("direccion", "entrante");
      expect(mockClient.gt).toHaveBeenCalledWith("created_at", "2026-08-01T00:00:00.000Z");
    });

    it("returns false when there are no incoming messages after last_read_at", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { last_read_at: "2026-08-01T00:00:00.000Z" }, error: null }),
        gt: vi.fn().mockResolvedValue({ count: 0, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      expect(await whatsappModule.hayMensajesSinLeer()).toBe(false);
    });

    it("throws when Supabase returns an error reading the status row", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
        gt: vi.fn(),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      await expect(whatsappModule.hayMensajesSinLeer()).rejects.toEqual({ message: "boom" });
    });
  });

  describe("marcarInboxLeido", () => {
    it("updates last_read_at on the singleton row", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      await whatsappModule.marcarInboxLeido();

      expect(mockClient.from).toHaveBeenCalledWith("whatsapp_inbox_estado");
      expect(mockClient.update).toHaveBeenCalledWith(expect.objectContaining({ last_read_at: expect.any(String) }));
      expect(mockClient.eq).toHaveBeenCalledWith("id", 1);
    });

    it("throws when Supabase returns an error", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      await expect(whatsappModule.marcarInboxLeido()).rejects.toEqual({ message: "boom" });
    });
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- lib/__tests__/whatsapp.test.js`
Expected: FAIL — `hayMensajesSinLeer`/`marcarInboxLeido` are not exported functions.

- [ ] **Step 4: Implement**

Add to `lib/whatsapp.js` (after `getMensajes`):

```js
export async function hayMensajesSinLeer() {
  const supabase = getSupabaseAdmin();

  const { data: estado, error: estadoError } = await supabase
    .from("whatsapp_inbox_estado")
    .select("last_read_at")
    .eq("id", 1)
    .single();
  if (estadoError) throw estadoError;

  const { count, error } = await supabase
    .from("whatsapp_mensajes")
    .select("id", { count: "exact", head: true })
    .eq("direccion", "entrante")
    .gt("created_at", estado.last_read_at);
  if (error) throw error;

  return (count ?? 0) > 0;
}

export async function marcarInboxLeido() {
  const { error } = await getSupabaseAdmin()
    .from("whatsapp_inbox_estado")
    .update({ last_read_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- lib/__tests__/whatsapp.test.js`
Expected: PASS (all tests in the file, old and new)

- [ ] **Step 6: Commit**

```bash
git add supabase/035_whatsapp_inbox_estado.sql lib/whatsapp.js lib/__tests__/whatsapp.test.js
git commit -m "feat: add whatsapp_inbox_estado table and read-tracking queries"
```

---

### Task 2: `GET /api/whatsapp/estado`

**Files:**
- Create: `app/api/whatsapp/estado/route.js`
- Test: `app/api/whatsapp/estado/__tests__/route.test.js`

**Interfaces:**
- Consumes: `hayMensajesSinLeer(): Promise<boolean>` from `@/lib/whatsapp` (Task 1).
- Produces: `GET` handler returning `{ hayNuevos: boolean }` (200) or `{ error }` (401/500) — consumed by Task 4 (dashboard polling).

- [ ] **Step 1: Write the failing test**

```js
// app/api/whatsapp/estado/__tests__/route.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route.js";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ hayMensajesSinLeer: vi.fn() }));

describe("GET /api/whatsapp/estado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there's no session", async () => {
    const { auth } = await import("@/auth");
    auth.mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns hayNuevos: true when there are unread messages", async () => {
    const { auth } = await import("@/auth");
    const { hayMensajesSinLeer } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1", role: "employee" } });
    hayMensajesSinLeer.mockResolvedValue(true);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ hayNuevos: true });
  });

  it("returns 500 when the query layer throws", async () => {
    const { auth } = await import("@/auth");
    const { hayMensajesSinLeer } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1", role: "admin" } });
    hayMensajesSinLeer.mockRejectedValue(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();
    expect(response.status).toBe(500);
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/api/whatsapp/estado`
Expected: FAIL — `app/api/whatsapp/estado/route.js` does not exist.

- [ ] **Step 3: Implement**

```js
// app/api/whatsapp/estado/route.js
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { hayMensajesSinLeer } from "@/lib/whatsapp";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const hayNuevos = await hayMensajesSinLeer();
    return NextResponse.json({ hayNuevos });
  } catch (e) {
    console.error("[/api/whatsapp/estado] GET error:", e);
    return NextResponse.json({ error: "Error al obtener estado" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/api/whatsapp/estado`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/whatsapp/estado/route.js app/api/whatsapp/estado/__tests__/route.test.js
git commit -m "feat: add GET /api/whatsapp/estado"
```

---

### Task 3: `POST /api/whatsapp/estado/marcar-leido`

**Files:**
- Create: `app/api/whatsapp/estado/marcar-leido/route.js`
- Test: `app/api/whatsapp/estado/marcar-leido/__tests__/route.test.js`

**Interfaces:**
- Consumes: `marcarInboxLeido(): Promise<void>` from `@/lib/whatsapp` (Task 1).
- Produces: `POST` handler returning `{ ok: true }` (200) or `{ error }` (401/500) — consumed by Task 5 (`/whatsapp` page).

- [ ] **Step 1: Write the failing test**

```js
// app/api/whatsapp/estado/marcar-leido/__tests__/route.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route.js";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ marcarInboxLeido: vi.fn() }));

describe("POST /api/whatsapp/estado/marcar-leido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there's no session", async () => {
    const { auth } = await import("@/auth");
    auth.mockResolvedValue(null);

    const response = await POST();
    expect(response.status).toBe(401);
  });

  it("marks the inbox as read for an authenticated user", async () => {
    const { auth } = await import("@/auth");
    const { marcarInboxLeido } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1", role: "employee" } });
    marcarInboxLeido.mockResolvedValue(undefined);

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(marcarInboxLeido).toHaveBeenCalled();
  });

  it("returns 500 when the update throws", async () => {
    const { auth } = await import("@/auth");
    const { marcarInboxLeido } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1", role: "admin" } });
    marcarInboxLeido.mockRejectedValue(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST();
    expect(response.status).toBe(500);
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/api/whatsapp/estado/marcar-leido`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement**

```js
// app/api/whatsapp/estado/marcar-leido/route.js
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { marcarInboxLeido } from "@/lib/whatsapp";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    await marcarInboxLeido();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/whatsapp/estado/marcar-leido] POST error:", e);
    return NextResponse.json({ error: "Error al marcar como leído" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/api/whatsapp/estado/marcar-leido`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/whatsapp/estado/marcar-leido/route.js app/api/whatsapp/estado/marcar-leido/__tests__/route.test.js
git commit -m "feat: add POST /api/whatsapp/estado/marcar-leido"
```

---

### Task 4: Badge en el header del dashboard (`app/page.js`)

**Files:**
- Modify: `app/page.js:19-43` (state), `:93-101` (polling effects), `:160-166` (WhatsApp button)

**Interfaces:**
- Consumes: `GET /api/whatsapp/estado` (Task 2) — response shape `{ hayNuevos: boolean }`.

No automated test — this file has no existing test coverage (`app/page.js` is a full client-side dashboard page with no `__tests__` counterpart), and the change is a `fetch` + conditional render with no branching logic worth isolating. Verify manually in Step 3.

- [ ] **Step 1: Add polling state and effect**

In `app/page.js`, add a new state near the other `useState` calls (after line 43, `const [nombreNegocio, setNombreNegocio] = useState("")`):

```js
  const [hayMensajesNuevos, setHayMensajesNuevos] = useState(false)
```

Add a new effect after the existing "Auto-refresh cada 30 segundos" effect (after line 101):

```js
  // Badge de WhatsApp sin leer — mismo ritmo de poll que el resto del dashboard.
  useEffect(() => {
    async function checkEstado() {
      try {
        const res = await fetch("/api/whatsapp/estado")
        if (res.ok) {
          const data = await res.json()
          setHayMensajesNuevos(!!data.hayNuevos)
        }
      } catch {
        // Silencioso — no bloquea el resto del dashboard.
      }
    }
    checkEstado()
    const interval = setInterval(checkEstado, 30000)
    return () => clearInterval(interval)
  }, [])
```

- [ ] **Step 2: Render the badge on the WhatsApp button**

Replace the `Link` block at `app/page.js:160-166`:

```jsx
            <Link
              href="/whatsapp"
              className="px-4 py-2.5 bg-[#25D366] hover:bg-[#1DA851] text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5"
            >
              <WhatsAppIcon className="w-4 h-4" />
              WhatsApp
            </Link>
```

with:

```jsx
            <Link
              href="/whatsapp"
              className="relative px-4 py-2.5 bg-[#25D366] hover:bg-[#1DA851] text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5"
            >
              <WhatsAppIcon className="w-4 h-4" />
              WhatsApp
              {hayMensajesNuevos && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-slate-900">
                  1
                </span>
              )}
            </Link>
```

- [ ] **Step 3: Manually verify**

Run `npm run dev`, log in, insert a row directly in `whatsapp_mensajes` (`direccion: 'entrante'`) for an existing conversation via Supabase, wait up to 30s (or reload), confirm the red badge appears on the WhatsApp button. Confirm it's gone after opening `/whatsapp` (depends on Task 5) and returning to the dashboard.

- [ ] **Step 4: Commit**

```bash
git add app/page.js
git commit -m "feat: show unread badge on dashboard WhatsApp button"
```

---

### Task 5: Marcar como leído en `/whatsapp` (`app/whatsapp/page.js`)

**Files:**
- Modify: `app/whatsapp/page.js:24-45`

**Interfaces:**
- Consumes: `POST /api/whatsapp/estado/marcar-leido` (Task 3).

No automated test, same reasoning as Task 4 — `app/whatsapp/page.js` has no existing test file.

- [ ] **Step 1: Call marcar-leido inside the existing polling callback**

In `app/whatsapp/page.js`, modify `cargarConversaciones` (lines 24-34) to also mark the inbox as read every time it runs — this covers both the initial mount (line 36-38) and every 15s poll (line 42-45) with one change:

```js
  const cargarConversaciones = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/conversaciones");
      const data = res.ok ? await res.json() : { conversaciones: [] };
      setConversaciones(data.conversaciones ?? []);
      fetch("/api/whatsapp/estado/marcar-leido", { method: "POST" }).catch(() => {});
    } catch (e) {
      console.error("Error cargando conversaciones:", e);
    } finally {
      setLoading(false);
    }
  }, []);
```

The `marcar-leido` call is fire-and-forget (`.catch(() => {})`, not awaited) — a failure here must never block the conversation list from rendering.

- [ ] **Step 2: Manually verify**

With a red badge showing on the dashboard (per Task 4 Step 3), navigate to `/whatsapp`. Confirm a `POST /api/whatsapp/estado/marcar-leido` fires (Network tab). Go back to the dashboard and confirm the badge is gone (immediately, or after its next 30s poll).

- [ ] **Step 3: Commit**

```bash
git add app/whatsapp/page.js
git commit -m "feat: mark whatsapp inbox as read when viewing conversations"
```

---

## Part 2: Modo claro / oscuro

### Task 6: Tailwind config + `ThemeProvider`

**Files:**
- Modify: `tailwind.config.js`
- Create: `components/ThemeProvider.js`

**Interfaces:**
- Produces: `<ThemeProvider>` (wraps children), `useTheme(): { theme: 'light' | 'dark', toggleTheme: () => void }` — consumed by Task 7 (`ThemeToggle`) and Task 8 (`app/layout.js`).

No automated test (see Global Constraints — no component-testing infra in this project). Verified manually in Task 8 Step 3 once wired into the real app.

- [ ] **Step 1: Enable class-based dark mode**

```js
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- [ ] **Step 2: Create the provider**

```js
// components/ThemeProvider.js
"use client";

import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({ theme: "light", toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const stored = localStorage.getItem("rt-theme");
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("rt-theme", next);
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.js components/ThemeProvider.js
git commit -m "feat: add dark-mode Tailwind config and ThemeProvider"
```

---

### Task 7: `ThemeToggle` component

**Files:**
- Create: `components/ThemeToggle.js`

**Interfaces:**
- Consumes: `useTheme()` from `@/components/ThemeProvider` (Task 6).
- Produces: `<ThemeToggle />` — consumed by Task 8 (`app/layout.js`).

- [ ] **Step 1: Create the toggle**

Hand-built slide switch (checkbox + styled `label`), consistent with the rest of the app's hand-rolled Tailwind UI (no component library):

```js
// components/ThemeToggle.js
"use client";

import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <label className="fixed top-4 right-4 z-50 inline-flex items-center cursor-pointer select-none">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={isDark}
        onChange={toggleTheme}
        aria-label="Cambiar entre modo claro y oscuro"
      />
      <span className="w-11 h-6 flex items-center rounded-full bg-slate-300 dark:bg-slate-700 px-0.5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500">
        <span
          className={`w-5 h-5 flex items-center justify-center rounded-full bg-white text-[10px] shadow-sm transition-transform ${
            isDark ? "translate-x-5" : "translate-x-0"
          }`}
        >
          {isDark ? "🌙" : "☀️"}
        </span>
      </span>
    </label>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ThemeToggle.js
git commit -m "feat: add ThemeToggle slide switch component"
```

---

### Task 8: Wire theme into `app/layout.js`

**Files:**
- Modify: `app/layout.js`

**Interfaces:**
- Consumes: `<ThemeProvider>` (Task 6), `<ThemeToggle>` (Task 7).

- [ ] **Step 1: Add the anti-flash script, provider, and toggle**

```js
// app/layout.js
import "./globals.css"
import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "@/components/ThemeProvider"
import { ThemeToggle } from "@/components/ThemeToggle"

export const metadata = {
  title: "Gestión de Reparaciones",
  description: "Sistema de gestión para relojerías y joyerías",
  manifest: "/manifest.json",
  themeColor: "#0f172a",
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

const ANTI_FLASH_SCRIPT = `
  try {
    var stored = localStorage.getItem('rt-theme');
    if (stored === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
`;

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH_SCRIPT }} />
      </head>
      <body>
        <SessionProvider>
          <ThemeProvider>
            <ThemeToggle />
            {children}
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
```

The inline script runs before React hydrates, so a user who already picked dark mode doesn't see a flash of the light theme on load. `ThemeProvider`'s own effect (Task 6, Step 2) re-syncs from `localStorage` on mount and stays the source of truth after that.

- [ ] **Step 2: Manually verify**

Run `npm run dev`. Confirm the switch renders top-right on every route (`/`, `/whatsapp`, `/admin`, `/cadete`, `/login`). Click it: page should not have a dark-mode look yet (pages aren't retrofitted until later tasks) except for the switch's own track/thumb, but toggling should not error, and `localStorage.rt-theme` and the `dark` class on `<html>` should update. Reload the page after switching to dark — confirm no light-mode flash.

- [ ] **Step 3: Run full test suite to confirm nothing broke**

Run: `npm test`
Expected: PASS (168+ tests, no regressions)

- [ ] **Step 4: Commit**

```bash
git add app/layout.js
git commit -m "feat: wire ThemeProvider and ThemeToggle into root layout"
```

---

### Task 9: Retrofit — dashboard (`app/page.js`, `components/StatCard.js`, `components/TrasladosPanel.js`)

**Files:**
- Modify: `app/page.js`, `components/StatCard.js`, `components/TrasladosPanel.js`

Apply the Global Constraints mapping table to every matching class in these three files. No automated test (visual-only change) — verify manually in Step 2.

- [ ] **Step 1: Apply the mapping table**

Concrete example — `components/StatCard.js:5-6` today:

```js
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex-1 min-w-[140px]">
      <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-1">
```

becomes:

```js
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex-1 min-w-[140px]">
      <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-1">
```

(`text-slate-500` is left unchanged per the table's exception.) Apply the same lookup — `bg-white`→+`dark:bg-slate-900`, `bg-slate-100`/`bg-slate-50`→+`dark:bg-slate-950`, `text-slate-900`/`text-slate-800`→+`dark:text-slate-100`, `border-slate-200`/`border-slate-300`→+`dark:border-slate-700` — to every remaining occurrence in `app/page.js` (the `<div className="min-h-screen bg-slate-100">` wrapper at line 136, the `<main>` and card/table surfaces below it, filter dropdowns, pagination controls) and in `components/TrasladosPanel.js`. Leave the header gradient (`from-slate-900 to-slate-800`), brand buttons (indigo, `#25D366`, slate-600 "Cadete" button), and `Badge`/`TrasladosBadge` status colors untouched per the table.

- [ ] **Step 2: Manually verify**

`npm run dev`, load `/`, toggle dark mode via the switch. Confirm the page background, stat cards, order table/kanban cards, and traslados panel all switch to dark surfaces with readable text — no white flashes or invisible (dark-on-dark) text.

- [ ] **Step 3: Commit**

```bash
git add app/page.js components/StatCard.js components/TrasladosPanel.js
git commit -m "feat: dark mode retrofit for dashboard"
```

---

### Task 10: Retrofit — WhatsApp inbox (`app/whatsapp/page.js`, `components/WhatsAppHilo.js`)

**Files:**
- Modify: `app/whatsapp/page.js`, `components/WhatsAppHilo.js`

- [ ] **Step 1: Apply the mapping table**

`app/whatsapp/page.js:58-59` today:

```js
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 sm:px-6 py-4 shrink-0">
```

becomes:

```js
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col">
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 sm:px-6 py-4 shrink-0">
```

Apply the same lookup to the rest of `app/whatsapp/page.js` (conversation sidebar list items, search input, `bg-white` panels) and to `components/WhatsAppHilo.js` (message thread panel — bubble backgrounds for `saliente`/`entrante` messages are brand/semantic colors per the table and stay unchanged; only surface `bg-white`/`border-slate-200`/text colors change).

- [ ] **Step 2: Manually verify**

`npm run dev`, load `/whatsapp` with at least one conversation, toggle dark mode. Confirm sidebar, search box, and message thread panel are all readable in dark mode; message bubbles keep their WhatsApp-style colors unchanged.

- [ ] **Step 3: Commit**

```bash
git add app/whatsapp/page.js components/WhatsAppHilo.js
git commit -m "feat: dark mode retrofit for whatsapp inbox"
```

---

### Task 11: Retrofit — admin shell (`app/admin/layout.js`, `app/admin/page.js`, `app/admin/configuracion/page.jsx`, `app/admin/configuracion/configuracion-client.js`)

**Files:**
- Modify: `app/admin/layout.js`, `app/admin/page.js`, `app/admin/configuracion/page.jsx`, `app/admin/configuracion/configuracion-client.js`

- [ ] **Step 1: Apply the mapping table**

`app/admin/layout.js:5,23,38` today:

```js
    <div className="min-h-screen bg-slate-100">
      ...
      <div className="bg-white border-b border-slate-200">
      ...
              <Link
                ...
                className="px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-b-2 border-transparent hover:border-slate-300 transition-colors"
              >
```

becomes:

```js
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      ...
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
      ...
              <Link
                ...
                className="px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 border-b-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
              >
```

(`text-slate-600` gets `dark:text-slate-400` per the table; the `hover:` variants get analogous dark-mode hover states — `hover:text-slate-900`→+`dark:hover:text-slate-100`, `hover:bg-slate-50`→+`dark:hover:bg-slate-800`, `hover:border-slate-300`→+`dark:hover:border-slate-600` — following the same light↔dark direction as the base table, since this is the one file with interactive hover states not otherwise covered.) Apply the same lookup to `app/admin/page.js` and to `app/admin/configuracion/page.jsx` + `configuracion-client.js` (settings form: card backgrounds, input borders, labels).

- [ ] **Step 2: Manually verify**

`npm run dev`, log in as admin, visit `/admin` and `/admin/configuracion`, toggle dark mode. Confirm the nav tab bar, active/hover states, and the settings form are all readable.

- [ ] **Step 3: Commit**

```bash
git add app/admin/layout.js app/admin/page.js app/admin/configuracion/page.jsx app/admin/configuracion/configuracion-client.js
git commit -m "feat: dark mode retrofit for admin shell and settings"
```

---

### Task 12: Retrofit — remaining admin pages (`sucursales`, `usuarios`, `marcas`, `reportes`, `talleres`, `tipos-servicio`)

**Files:**
- Modify: `app/admin/sucursales/page.js`, `app/admin/usuarios/page.js`, `app/admin/marcas/page.js`, `app/admin/reportes/page.js`, `app/admin/talleres/page.js`, `app/admin/tipos-servicio/page.js`

These six pages share the same CRUD-table-plus-form shape as `sucursales` and already inherit their dark background from `app/admin/layout.js` (Task 11) — they only need their own local `bg-white` cards/tables, `text-slate-900`/`text-slate-800` headings, and `border-slate-200`/`border-slate-300` borders converted.

- [ ] **Step 1: Apply the mapping table to each of the 6 files**

For each file: open it, find every `className` containing `bg-white`, `text-slate-900`, `text-slate-800`, `border-slate-200`, or `border-slate-300`, and append the matching `dark:` class from the Global Constraints table right next to it in the same string. Leave brand/status colors (success/error banners, action buttons) untouched.

- [ ] **Step 2: Manually verify**

`npm run dev`, visit each of the 6 admin routes as admin, toggle dark mode on each, confirm tables/forms/buttons stay readable.

- [ ] **Step 3: Commit**

```bash
git add app/admin/sucursales/page.js app/admin/usuarios/page.js app/admin/marcas/page.js app/admin/reportes/page.js app/admin/talleres/page.js app/admin/tipos-servicio/page.js
git commit -m "feat: dark mode retrofit for remaining admin pages"
```

---

### Task 13: Retrofit — cadete (`app/cadete/page.js`, `components/ResumenCadetePanel.js`)

**Files:**
- Modify: `app/cadete/page.js`, `components/ResumenCadetePanel.js`

- [ ] **Step 1: Apply the mapping table**

Same procedure as Task 12: locate every `bg-slate-100`/`bg-slate-50`, `bg-white`, `text-slate-900`/`text-slate-800`, `border-slate-200`/`border-slate-300` in both files and append the corresponding `dark:` class.

- [ ] **Step 2: Manually verify**

`npm run dev`, log in as a `cadete` user, visit `/cadete`, toggle dark mode, confirm the checklist UI and `ResumenCadetePanel` stay readable (this page is likely used on a phone — check the switch doesn't overlap content at narrow widths too).

- [ ] **Step 3: Commit**

```bash
git add app/cadete/page.js components/ResumenCadetePanel.js
git commit -m "feat: dark mode retrofit for cadete page"
```

---

### Task 14: Retrofit — login, privacy, seguimiento público (`app/login/page.js`, `app/privacy/page.js`, `app/seguimiento/[token]/page.js`, `app/seguimiento/[token]/not-found.js`)

**Files:**
- Modify: `app/login/page.js`, `app/privacy/page.js`, `app/seguimiento/[token]/page.js`, `app/seguimiento/[token]/not-found.js`

- [ ] **Step 1: Apply the mapping table**

`app/login/page.js:58-63` today:

```js
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <span className="text-4xl">⌚</span>
          <h1 className="text-xl font-bold text-slate-900 mt-2">{nombreNegocio || "RepairTrack"}</h1>
          <p className="text-sm text-slate-500">Iniciá sesión para continuar</p>
```

becomes:

```js
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <span className="text-4xl">⌚</span>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-2">{nombreNegocio || "RepairTrack"}</h1>
          <p className="text-sm text-slate-500">Iniciá sesión para continuar</p>
```

The two `border-slate-200` input borders further down in the same file (`className="w-full px-3 py-2.5 border border-slate-200 rounded-lg ..."`, appears twice) get `dark:border-slate-700`; also add `dark:bg-slate-900 dark:text-slate-100` to those same input elements so typed text is visible against a dark input background (inputs aren't covered by the `bg-white`→`dark:bg-slate-900` rule above since they don't carry `bg-white`, but need an explicit dark background here to stay usable — same treatment applies to any bare `<input>`/`<textarea>` without an explicit `bg-*` class encountered in Tasks 12–15).

`app/privacy/page.js:13,25,27` — same `bg-slate-100`/`bg-white`/`border-slate-200`/`text-slate-900` pattern as above, plus `text-slate-700` (the policy body text) → add `dark:text-slate-300` per the table.

`app/seguimiento/[token]/page.js` is a public customer-facing tracking page (server component, no `"use client"`) — apply the same surface/text/border lookups to its JSX (read the file to find its `<div>`/`<main>`/timeline markup below line 40). `not-found.js` in the same folder gets the same treatment if it renders a full-page surface (`min-h-screen bg-slate-100`-style wrapper).

- [ ] **Step 2: Manually verify**

`npm run dev`. Visit `/login` (log out first if needed), `/privacy`, and a real `/seguimiento/<token>` link (grab a `tracking_token` from the `ordenes` table), toggle dark mode on each, confirm readable in both themes. Visit `/seguimiento/not-a-real-uuid` to trigger `not-found.js` and check it too.

- [ ] **Step 3: Commit**

```bash
git add app/login/page.js app/privacy/page.js "app/seguimiento/[token]/page.js" "app/seguimiento/[token]/not-found.js"
git commit -m "feat: dark mode retrofit for login, privacy, and tracking pages"
```

---

### Task 15: Retrofit — modals (`components/NuevoIngresoModal.js`, `components/DetalleOrdenModal.js`, `components/PhoneInput.js`)

**Files:**
- Modify: `components/NuevoIngresoModal.js`, `components/DetalleOrdenModal.js`, `components/PhoneInput.js`

These are the two modals opened from the dashboard (`app/page.js`, Task 9) plus the phone input they both embed.

- [ ] **Step 1: Apply the mapping table**

Same procedure as Task 12/13: locate `bg-white` (modal panel), `bg-slate-50`/`bg-slate-100` (nested sections), `text-slate-900`/`text-slate-800` (headings/labels), `border-slate-200`/`border-slate-300` (dividers, input borders) in all three files and append the matching `dark:` class. Modal backdrops (typically `bg-black/50` or similar) are unaffected — they already work in both themes. Bare `<input>`/`<select>` elements without a `bg-*` class get an explicit `dark:bg-slate-900 dark:text-slate-100` added, per the note in Task 14.

- [ ] **Step 2: Manually verify**

`npm run dev`, on `/` click "+ Nuevo Ingreso" and open an existing order's detail modal, toggle dark mode with each modal open, confirm both (including the embedded phone/country-code input) stay readable.

- [ ] **Step 3: Commit**

```bash
git add components/NuevoIngresoModal.js components/DetalleOrdenModal.js components/PhoneInput.js
git commit -m "feat: dark mode retrofit for order modals"
```

---

### Task 16: Final full-app QA pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: PASS, same test count as the Task 8 Step 3 baseline plus the new tests from Tasks 1-3 — no regressions from the dark-mode retrofit (it's all JSX/className changes, no logic changes).

- [ ] **Step 2: Manual sweep**

`npm run dev`. Starting from `/login`, log in as `admin`, and click through every route touched in Tasks 9–15 (`/`, `/whatsapp`, `/admin` and its 7 sub-pages, `/cadete` as a cadete user, `/privacy`, a `/seguimiento/<token>` link) toggling the switch on each. Confirm: no white flashes of unstyled content, no dark-on-dark or light-on-light invisible text, the switch itself stays visible and clickable (not obscured by page content) at both desktop and mobile widths, and the choice persists across a full page reload and across navigating between routes.

- [ ] **Step 3: Fix any contrast issues found**

If a specific element reads badly in either theme, fix it in place (it wasn't caught by the mechanical mapping table — likely a `text-slate-500`/`text-slate-400` instance the table intentionally left as a judgment call, or a component missed by Tasks 9-15). Commit each fix separately with a description of what was wrong.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: dark mode QA fixes" --allow-empty
```

(Use `--allow-empty` only if Step 3 found nothing to fix and this step is a no-op checkpoint; otherwise omit the flag — there will be real changes staged.)
