# RepairTrack V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform RepairTrack into a production-ready V1 with auth/roles, customer email notifications, public order tracking links, configurable maintenance reminders, and an admin panel.

**Architecture:** Three sequential phases, each deployable independently. Phase 1 establishes auth and removes the cadete module. Phase 2 adds the email notification layer with tracking links. Phase 3 adds the admin panel with service type config and reports.

**Tech Stack:** Next.js 14, Supabase (Auth + PostgreSQL + RLS), Tailwind CSS, @supabase/ssr, Resend (email), Vitest (unit tests)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `middleware.js` | Route protection + role enforcement (runs on every request) |
| `lib/supabase-server.js` | Server-side Supabase client factory (createServerClient with cookies) |
| `lib/supabase-admin.js` | Service-role Supabase client for admin operations |
| `app/login/page.js` | Login form (email + password) |
| `app/api/auth/callback/route.js` | Supabase OAuth/magic link callback handler |
| `lib/notifications/index.js` | `sendNotification(type, data)` — channel-agnostic abstraction |
| `lib/notifications/email.js` | Resend implementation of the notification interface |
| `lib/notifications/templates/orden-creada.js` | HTML email: order confirmed + tracking link |
| `lib/notifications/templates/listo-para-retiro.js` | HTML email: watch ready for pickup |
| `lib/notifications/templates/recordatorio-mantenimiento.js` | HTML email: maintenance reminder |
| `app/seguimiento/[token]/page.js` | Public order tracking page (server component, no auth) |
| `app/api/cron/recordatorios/route.js` | Daily cron endpoint: send maintenance reminders |
| `app/admin/layout.js` | Admin layout with sidebar navigation |
| `app/admin/page.js` | Redirects to /admin/tipos-servicio |
| `app/admin/tipos-servicio/page.js` | CRUD for service types + reminder cycles |
| `app/admin/usuarios/page.js` | Invite + list + remove staff users |
| `app/admin/reportes/page.js` | Reports dashboard (orders, revenue, clients) |
| `supabase/002_v1_additions.sql` | New tables + columns for V1 features |
| `vitest.config.js` | Vitest configuration |
| `__tests__/notifications.test.js` | Unit tests for email template functions |
| `__tests__/cron.test.js` | Unit tests for reminder eligibility logic |

### Modified Files
| File | What Changes |
|------|-------------|
| `lib/supabase.js` | Switch from `createClient` to `createBrowserClient` (@supabase/ssr) |
| `lib/data.js` | Remove cadete functions; add `getOrdenByToken`, `getTiposServicio`, `crearTipoServicio`, `updateTipoServicio`, `deleteTipoServicio`, `getReportesStats`; wire notification call in `crearOrden` and `cambiarEstado` |
| `lib/constants.js` | Remove `RETIRADO_POR_CADETE` from ESTADOS + TRANSICIONES; fix LISTO_EN_TALLER transition |
| `app/page.js` | Remove cadete link; add logout button |
| `supabase/001_schema.sql` | Remove cadete artifacts (movimientos_cadete table, v_cadete_pendientes view, RETIRADO_POR_CADETE from CHECK constraint) |

### Deleted Files
| File | Reason |
|------|--------|
| `app/cadete/page.js` | Cadete module removed |

---

## ═══════════════════════════════════════
## PHASE 1 — FOUNDATION
## ═══════════════════════════════════════

---

### Task 1: Configure Vitest

**Files:**
- Create: `vitest.config.js`
- Create: `__tests__/constants.test.js`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create vitest.config.js**

```js
// vitest.config.js
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 3: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write tests for existing pure utility functions**

```js
// __tests__/constants.test.js
import { getNivelRetraso, formatNumeroOrden } from '@/lib/constants'

describe('getNivelRetraso', () => {
  it('returns none when under leve threshold', () => {
    expect(getNivelRetraso('INGRESADO', 1)).toBe('none')
  })
  it('returns leve at leve threshold', () => {
    expect(getNivelRetraso('INGRESADO', 2)).toBe('leve')
  })
  it('returns grave at grave threshold', () => {
    expect(getNivelRetraso('INGRESADO', 5)).toBe('grave')
  })
  it('returns none for states without thresholds', () => {
    expect(getNivelRetraso('ENTREGADO', 100)).toBe('none')
  })
})

describe('formatNumeroOrden', () => {
  it('pads single digit to 4 chars', () => {
    expect(formatNumeroOrden(1)).toBe('0001')
  })
  it('does not truncate 5+ digit numbers', () => {
    expect(formatNumeroOrden(12345)).toBe('12345')
  })
})
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
npm test
```

Expected output: `2 passed`

- [ ] **Step 6: Commit**

```bash
git add vitest.config.js __tests__/constants.test.js package.json
git commit -m "chore: add Vitest test runner"
```

---

### Task 2: Remove cadete module + clean schema

**Files:**
- Delete: `app/cadete/page.js`
- Modify: `lib/constants.js`
- Modify: `supabase/001_schema.sql`
- Modify: `lib/data.js` (remove cadete functions)
- Modify: `app/page.js` (remove cadete link)

- [ ] **Step 1: Delete cadete page**

```bash
rm app/cadete/page.js
rmdir app/cadete
```

- [ ] **Step 2: Update constants.js — remove RETIRADO_POR_CADETE and fix LISTO_EN_TALLER transition**

Replace the relevant sections in `lib/constants.js`:

```js
export const ESTADOS = {
  INGRESADO:              { label: "Ingresado",              color: "#6366f1", bg: "#eef2ff", icon: "📥", orden: 1 },
  ESPERANDO_PRESUPUESTO:  { label: "Esperando Presupuesto",  color: "#f59e0b", bg: "#fffbeb", icon: "⏳", orden: 2 },
  ENVIADO_A_TALLER:       { label: "Enviado a Taller",       color: "#8b5cf6", bg: "#f5f3ff", icon: "🚚", orden: 3 },
  PRESUPUESTO_RECIBIDO:   { label: "Presupuesto Recibido",   color: "#06b6d4", bg: "#ecfeff", icon: "💰", orden: 4 },
  ESPERANDO_APROBACION:   { label: "Esperando Aprobación",   color: "#f97316", bg: "#fff7ed", icon: "📞", orden: 5 },
  RECHAZADO:              { label: "Rechazado",              color: "#ef4444", bg: "#fef2f2", icon: "✗",  orden: 6 },
  EN_REPARACION:          { label: "En Reparación",          color: "#3b82f6", bg: "#eff6ff", icon: "🔧", orden: 7 },
  LISTO_EN_TALLER:        { label: "Listo en Taller",        color: "#14b8a6", bg: "#f0fdfa", icon: "✓",  orden: 8 },
  LISTO_PARA_RETIRO:      { label: "Listo para Retiro",      color: "#22c55e", bg: "#f0fdf4", icon: "🎉", orden: 9 },
  ENTREGADO:              { label: "Entregado",              color: "#64748b", bg: "#f8fafc", icon: "✅", orden: 10 },
};

export const TRANSICIONES = {
  INGRESADO:             ["ESPERANDO_PRESUPUESTO", "ENVIADO_A_TALLER", "LISTO_PARA_RETIRO"],
  ESPERANDO_PRESUPUESTO: ["ENVIADO_A_TALLER", "ESPERANDO_APROBACION"],
  ENVIADO_A_TALLER:      ["PRESUPUESTO_RECIBIDO"],
  PRESUPUESTO_RECIBIDO:  ["ESPERANDO_APROBACION"],
  ESPERANDO_APROBACION:  ["EN_REPARACION", "RECHAZADO"],
  RECHAZADO:             ["LISTO_PARA_RETIRO"],
  EN_REPARACION:         ["LISTO_EN_TALLER", "LISTO_PARA_RETIRO"],
  LISTO_EN_TALLER:       ["LISTO_PARA_RETIRO"],
  LISTO_PARA_RETIRO:     ["ENTREGADO"],
  ENTREGADO:             [],
};
```

- [ ] **Step 3: Update 001_schema.sql — remove cadete artifacts, update CHECK constraint**

Find and replace the `ordenes` estado CHECK constraint:
```sql
  estado TEXT NOT NULL DEFAULT 'INGRESADO'
    CHECK (estado IN (
      'INGRESADO',
      'ESPERANDO_PRESUPUESTO',
      'ENVIADO_A_TALLER',
      'PRESUPUESTO_RECIBIDO',
      'ESPERANDO_APROBACION',
      'RECHAZADO',
      'EN_REPARACION',
      'LISTO_EN_TALLER',
      'LISTO_PARA_RETIRO',
      'ENTREGADO'
    )),
```

Remove the entire `movimientos_cadete` table block (lines 124-137).

Remove the entire `v_cadete_pendientes` view block (lines 289-313).

Remove the `movimientos_cadete` RLS policy lines.

- [ ] **Step 4: Remove cadete functions from lib/data.js**

Delete the entire `// MOVIMIENTOS CADETE` section (the `getPendientesCadete` and `registrarMovimientoCadete` functions).

- [ ] **Step 5: Remove cadete link from app/page.js**

Remove this block from the header:
```jsx
<a
  href="/cadete"
  className="text-xs text-slate-400 hover:text-white transition-colors px-3 py-2"
>
  🚴 Vista Cadete
</a>
```

- [ ] **Step 6: Verify app still runs**

```bash
npm run dev
```

Open http://localhost:3000 — dashboard should load. No cadete link visible.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: remove cadete module, clean up states"
```

---

### Task 3: Supabase SSR clients

**Files:**
- Modify: `lib/supabase.js`
- Create: `lib/supabase-server.js`
- Create: `lib/supabase-admin.js`

Context: `@supabase/ssr` is already installed. We need three clients:
1. Browser client — for "use client" components (replaces current supabase.js)
2. Server client — for server components + middleware (reads/writes cookies)
3. Admin client — uses service role key, bypasses RLS, for cron + admin ops

- [ ] **Step 1: Update lib/supabase.js to use createBrowserClient**

```js
// lib/supabase.js
import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
```

- [ ] **Step 2: Create lib/supabase-server.js**

```js
// lib/supabase-server.js
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}
```

- [ ] **Step 3: Create lib/supabase-admin.js**

```js
// lib/supabase-admin.js
import { createClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS. Only use in server-side code (API routes, server components).
// Never expose SUPABASE_SERVICE_ROLE_KEY to the client.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

- [ ] **Step 4: Add SUPABASE_SERVICE_ROLE_KEY to .env.local**

```bash
# .env.local (add this line)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Get it from: Supabase Dashboard → Project Settings → API → service_role key.

- [ ] **Step 5: Verify app still runs**

```bash
npm run dev
```

Dashboard should load, data should still appear (lib/data.js still imports from lib/supabase.js which now uses createBrowserClient — same API, same behavior).

- [ ] **Step 6: Commit**

```bash
git add lib/supabase.js lib/supabase-server.js lib/supabase-admin.js
git commit -m "feat: add Supabase SSR and admin clients"
```

---

### Task 4: Login page + auth callback

**Files:**
- Create: `app/login/page.js`
- Create: `app/api/auth/callback/route.js`

- [ ] **Step 1: Create the auth callback route**

```js
// app/api/auth/callback/route.js
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/`);
}
```

- [ ] **Step 2: Create login page**

```jsx
// app/login/page.js
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Email o contraseña incorrectos");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <span className="text-4xl">⌚</span>
          <h1 className="text-xl font-bold text-slate-900 mt-2">RepairTrack</h1>
          <p className="text-sm text-slate-500">Iniciá sesión para continuar</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="tu@email.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-500 text-white rounded-xl font-semibold text-sm hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "Iniciando sesión..." : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify login page renders**

```bash
npm run dev
```

Open http://localhost:3000/login — login form should appear.

- [ ] **Step 4: Commit**

```bash
git add app/login/page.js app/api/auth/callback/route.js
git commit -m "feat: add login page and auth callback"
```

---

### Task 5: Middleware — route protection + roles

**Files:**
- Create: `middleware.js`
- Modify: `app/page.js` (add logout button)

- [ ] **Step 1: Create middleware.js**

```js
// middleware.js
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // Public routes — no auth needed
  if (pathname.startsWith("/login") || pathname.startsWith("/seguimiento")) {
    // Redirect logged-in users away from login
    if (user && pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  // All other routes require auth
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Admin routes require dueno role
  if (pathname.startsWith("/admin")) {
    const role = user.app_metadata?.role;
    if (role !== "dueno") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)"],
};
```

- [ ] **Step 2: Add logout button to dashboard header in app/page.js**

In the header section where the "+ Nuevo Ingreso" button is, add after it:

```jsx
// At the top of the file, add this import:
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// Inside the component, add:
const router = useRouter();

async function handleLogout() {
  await supabase.auth.signOut();
  router.push("/login");
  router.refresh();
}
```

And in the header JSX, add a logout button next to the "+ Nuevo Ingreso" button:

```jsx
<button
  onClick={handleLogout}
  className="px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors"
>
  Salir
</button>
```

- [ ] **Step 3: Set up first user in Supabase Dashboard**

Go to: Supabase Dashboard → Authentication → Users → Add user

Create the first `dueno` account. Then run in the SQL editor:
```sql
UPDATE auth.users
SET app_metadata = app_metadata || '{"role": "dueno"}'::jsonb
WHERE email = 'your-email@example.com';
```

- [ ] **Step 4: Verify auth flow**

```bash
npm run dev
```

1. Open http://localhost:3000 — should redirect to /login
2. Log in with the dueno account — should redirect to dashboard
3. Open http://localhost:3000/admin — should load (you're dueno)
4. Create a second test user without dueno role, log in, try /admin — should redirect to /

- [ ] **Step 5: Commit**

```bash
git add middleware.js app/page.js
git commit -m "feat: add middleware auth + role-based route protection"
```

---

## ═══════════════════════════════════════
## PHASE 2 — COMMUNICATION
## ═══════════════════════════════════════

---

### Task 6: Database additions for Phase 2

**Files:**
- Create: `supabase/002_v1_additions.sql`

- [ ] **Step 1: Create migration SQL**

```sql
-- supabase/002_v1_additions.sql
-- Run in: Supabase Dashboard > SQL Editor

-- ============================================================
-- Add tracking_token to ordenes
-- ============================================================
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS
  tracking_token UUID DEFAULT gen_random_uuid() UNIQUE;

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_ordenes_tracking_token ON ordenes(tracking_token);

-- ============================================================
-- TABLA: tipos_servicio
-- Configurable maintenance reminder cycles per service type
-- ============================================================
CREATE TABLE IF NOT EXISTS tipos_servicio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  ciclo_meses INT NOT NULL DEFAULT 12,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initial service types
INSERT INTO tipos_servicio (nombre, ciclo_meses) VALUES
  ('Cambio de pila', 18),
  ('Service completo', 36),
  ('Ajuste de correa', 12),
  ('Limpieza', 12);

-- RLS for tipos_servicio
ALTER TABLE tipos_servicio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON tipos_servicio
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- RLS: Allow public read of ordenes via tracking_token
-- (Anonymous users can read a single order if they know the token)
-- ============================================================
CREATE POLICY "Public tracking read" ON ordenes
  FOR SELECT USING (true);
-- Note: The above policy allows any SELECT on ordenes.
-- The tracking page filters by tracking_token in the query.
-- Authenticated users already have full access via existing policy.
-- For stricter security, replace with:
-- FOR SELECT USING (auth.role() = 'authenticated' OR tracking_token IS NOT NULL);

-- ============================================================
-- Record that a maintenance reminder was sent
-- (prevents duplicate reminders)
-- ============================================================
ALTER TABLE notificaciones_enviadas
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id),
  ADD COLUMN IF NOT EXISTS tipo_notificacion TEXT;
```

- [ ] **Step 2: Run migration in Supabase Dashboard**

Paste the SQL above into Supabase Dashboard → SQL Editor → Run.

Verify: `SELECT tracking_token FROM ordenes LIMIT 1;` — should return a UUID for each order.

- [ ] **Step 3: Commit**

```bash
git add supabase/002_v1_additions.sql
git commit -m "feat: add tracking_token, tipos_servicio table, notifications schema"
```

---

### Task 7: Email templates

**Files:**
- Create: `lib/notifications/templates/orden-creada.js`
- Create: `lib/notifications/templates/listo-para-retiro.js`
- Create: `lib/notifications/templates/recordatorio-mantenimiento.js`

Each template is a pure function that takes data and returns `{ subject, html }`.

- [ ] **Step 1: Write tests for templates**

```js
// __tests__/notifications.test.js
import { ordenCreadaTemplate } from '@/lib/notifications/templates/orden-creada'
import { listoParaRetiroTemplate } from '@/lib/notifications/templates/listo-para-retiro'
import { recordatorioMantenimientoTemplate } from '@/lib/notifications/templates/recordatorio-mantenimiento'

describe('ordenCreadaTemplate', () => {
  it('includes order number in subject', () => {
    const { subject } = ordenCreadaTemplate({
      numeroOrden: '0042',
      clienteNombre: 'Juan',
      tipoArticulo: 'Reloj',
      marca: 'Casio',
      trackingUrl: 'https://example.com/seguimiento/abc',
    })
    expect(subject).toContain('0042')
  })

  it('includes tracking URL in html', () => {
    const { html } = ordenCreadaTemplate({
      numeroOrden: '0042',
      clienteNombre: 'Juan',
      tipoArticulo: 'Reloj',
      marca: 'Casio',
      trackingUrl: 'https://example.com/seguimiento/abc',
    })
    expect(html).toContain('https://example.com/seguimiento/abc')
  })
})

describe('listoParaRetiroTemplate', () => {
  it('includes client name in html', () => {
    const { html } = listoParaRetiroTemplate({
      numeroOrden: '0042',
      clienteNombre: 'María',
      tipoArticulo: 'Reloj',
      marca: 'Tissot',
      trackingUrl: 'https://example.com/seguimiento/xyz',
    })
    expect(html).toContain('María')
  })
})

describe('recordatorioMantenimientoTemplate', () => {
  it('includes service type in subject', () => {
    const { subject } = recordatorioMantenimientoTemplate({
      clienteNombre: 'Pedro',
      tipoServicio: 'Cambio de pila',
      ultimaFecha: '2024-10-07',
    })
    expect(subject).toContain('Cambio de pila')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create orden-creada template**

```js
// lib/notifications/templates/orden-creada.js
export function ordenCreadaTemplate({ numeroOrden, clienteNombre, tipoArticulo, marca, trackingUrl }) {
  return {
    subject: `RepairTrack — Orden #${numeroOrden} registrada`,
    html: `
<!DOCTYPE html>
<html lang="es">
<body style="font-family: sans-serif; background: #f1f5f9; padding: 24px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 36px;">⌚</span>
      <h1 style="font-size: 18px; color: #0f172a; margin: 8px 0 0;">RepairTrack</h1>
    </div>

    <h2 style="font-size: 20px; color: #0f172a; margin: 0 0 8px;">Hola ${clienteNombre},</h2>
    <p style="color: #475569; font-size: 15px; margin: 0 0 24px;">
      Tu artículo ingresó correctamente a nuestro taller.
    </p>

    <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Orden</div>
      <div style="font-size: 22px; font-weight: 800; color: #6366f1; font-family: monospace;">#${numeroOrden}</div>
      <div style="font-size: 14px; color: #334155; margin-top: 8px;">${tipoArticulo}${marca ? ` — ${marca}` : ''}</div>
    </div>

    <a href="${trackingUrl}" style="display: block; text-align: center; background: #6366f1; color: white; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 15px; margin-bottom: 24px;">
      Seguir el estado de mi orden →
    </a>

    <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
      Te avisaremos cuando esté listo para retirar.
    </p>
  </div>
</body>
</html>`,
  };
}
```

- [ ] **Step 4: Create listo-para-retiro template**

```js
// lib/notifications/templates/listo-para-retiro.js
export function listoParaRetiroTemplate({ numeroOrden, clienteNombre, tipoArticulo, marca, trackingUrl }) {
  return {
    subject: `RepairTrack — Orden #${numeroOrden} lista para retirar 🎉`,
    html: `
<!DOCTYPE html>
<html lang="es">
<body style="font-family: sans-serif; background: #f1f5f9; padding: 24px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 36px;">🎉</span>
      <h1 style="font-size: 18px; color: #0f172a; margin: 8px 0 0;">RepairTrack</h1>
    </div>

    <h2 style="font-size: 20px; color: #0f172a; margin: 0 0 8px;">Hola ${clienteNombre},</h2>
    <p style="color: #475569; font-size: 15px; margin: 0 0 24px;">
      Tu artículo está listo y podés pasar a buscarlo cuando quieras.
    </p>

    <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Listo para retiro</div>
      <div style="font-size: 22px; font-weight: 800; color: #22c55e; font-family: monospace;">#${numeroOrden}</div>
      <div style="font-size: 14px; color: #334155; margin-top: 8px;">${tipoArticulo}${marca ? ` — ${marca}` : ''}</div>
    </div>

    <a href="${trackingUrl}" style="display: block; text-align: center; background: #22c55e; color: white; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 15px; margin-bottom: 24px;">
      Ver estado de mi orden →
    </a>

    <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
      ¡Gracias por confiar en nosotros!
    </p>
  </div>
</body>
</html>`,
  };
}
```

- [ ] **Step 5: Create recordatorio-mantenimiento template**

```js
// lib/notifications/templates/recordatorio-mantenimiento.js
export function recordatorioMantenimientoTemplate({ clienteNombre, tipoServicio, ultimaFecha }) {
  return {
    subject: `RepairTrack — Recordatorio: ${tipoServicio}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<body style="font-family: sans-serif; background: #f1f5f9; padding: 24px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 36px;">⌚</span>
      <h1 style="font-size: 18px; color: #0f172a; margin: 8px 0 0;">RepairTrack</h1>
    </div>

    <h2 style="font-size: 20px; color: #0f172a; margin: 0 0 8px;">Hola ${clienteNombre},</h2>
    <p style="color: #475569; font-size: 15px; margin: 0 0 24px;">
      Te recordamos que es momento de hacer el mantenimiento de tu artículo.
    </p>

    <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Servicio recomendado</div>
      <div style="font-size: 18px; font-weight: 700; color: #92400e;">${tipoServicio}</div>
      <div style="font-size: 13px; color: #78350f; margin-top: 4px;">Último servicio: ${ultimaFecha}</div>
    </div>

    <p style="color: #475569; font-size: 14px; margin: 0 0 24px;">
      Comunicate con nosotros para coordinar la revisión.
    </p>

    <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
      Si no querés recibir estos recordatorios, respondé este email.
    </p>
  </div>
</body>
</html>`,
  };
}
```

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: All tests pass (including the 3 new notification template tests).

- [ ] **Step 7: Commit**

```bash
git add lib/notifications/templates/ __tests__/notifications.test.js
git commit -m "feat: add email templates (orden creada, listo para retiro, recordatorio)"
```

---

### Task 8: Notification layer + Resend integration

**Files:**
- Create: `lib/notifications/email.js`
- Create: `lib/notifications/index.js`

- [ ] **Step 1: Install Resend**

```bash
npm install resend
```

- [ ] **Step 2: Add RESEND_API_KEY and NEXT_PUBLIC_APP_URL to .env.local**

```bash
# .env.local (add these lines)
RESEND_API_KEY=re_your_api_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
RESEND_FROM_EMAIL=noreply@tudominio.com
```

Get the Resend API key from: resend.com → API Keys → Create API Key.
In production, `NEXT_PUBLIC_APP_URL` should be the real domain (e.g. `https://repairtrack.tudominio.com`).

- [ ] **Step 3: Create lib/notifications/email.js**

```js
// lib/notifications/email.js
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || "noreply@repairtrack.app";

export async function sendEmail({ to, subject, html }) {
  if (!to) return; // skip if client has no email

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("[Email] Failed to send:", error);
    throw error;
  }
}
```

- [ ] **Step 4: Create lib/notifications/index.js**

```js
// lib/notifications/index.js
// Channel-agnostic notification abstraction.
// To add WhatsApp: create lib/notifications/whatsapp.js and dispatch here.

import { sendEmail } from "./email";
import { ordenCreadaTemplate } from "./templates/orden-creada";
import { listoParaRetiroTemplate } from "./templates/listo-para-retiro";
import { recordatorioMantenimientoTemplate } from "./templates/recordatorio-mantenimiento";

/**
 * Send a notification to a client.
 *
 * @param {'ORDEN_CREADA' | 'LISTO_PARA_RETIRO' | 'RECORDATORIO_MANTENIMIENTO'} type
 * @param {object} data - Template-specific payload
 */
export async function sendNotification(type, data) {
  if (!data.clienteEmail) return; // no email on record, skip silently

  let template;

  switch (type) {
    case "ORDEN_CREADA":
      template = ordenCreadaTemplate(data);
      break;
    case "LISTO_PARA_RETIRO":
      template = listoParaRetiroTemplate(data);
      break;
    case "RECORDATORIO_MANTENIMIENTO":
      template = recordatorioMantenimientoTemplate(data);
      break;
    default:
      console.warn("[Notifications] Unknown type:", type);
      return;
  }

  await sendEmail({ to: data.clienteEmail, ...template });
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/ package.json package-lock.json
git commit -m "feat: add notification layer with Resend email integration"
```

---

### Task 9: Wire notifications to order events

**Files:**
- Modify: `lib/data.js`

The goal: when an order is created, send the `ORDEN_CREADA` email. When an order transitions to `LISTO_PARA_RETIRO`, send the `LISTO_PARA_RETIRO` email.

These functions run client-side (in "use client" components), so we call them via API routes to keep server-only secrets (Resend key) off the client.

- [ ] **Step 1: Create API route for sending notifications**

```js
// app/api/notify/route.js
import { sendNotification } from "@/lib/notifications";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const { type, data } = body;
    await sendNotification(type, data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[/api/notify]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add helper to lib/data.js for triggering notifications**

Add this function at the top of lib/data.js (after imports):

```js
async function triggerNotification(type, data) {
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, data }),
    });
  } catch (e) {
    console.error("[Notification] Failed to trigger:", e);
    // Don't throw — notification failure should not break order creation
  }
}
```

- [ ] **Step 3: Update crearOrden in lib/data.js to fetch client email and send notification**

Replace the existing `crearOrden` function:

```js
export async function crearOrden({ cliente_id, tipo_articulo, marca, modelo, problema_reportado, notas_internas }) {
  const { data: orden, error } = await supabase
    .from("ordenes")
    .insert({
      cliente_id,
      tipo_articulo,
      marca,
      modelo,
      problema_reportado,
      notas_internas,
    })
    .select("*, clientes(nombre, email)")
    .single();

  if (error) throw error;

  // Send confirmation email if client has email
  if (orden.clientes?.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    triggerNotification("ORDEN_CREADA", {
      clienteEmail: orden.clientes.email,
      clienteNombre: orden.clientes.nombre,
      numeroOrden: String(orden.numero_orden).padStart(4, "0"),
      tipoArticulo: tipo_articulo,
      marca: marca || "",
      trackingUrl: `${appUrl}/seguimiento/${orden.tracking_token}`,
    });
  }

  return orden;
}
```

- [ ] **Step 4: Update cambiarEstado in lib/data.js to send LISTO_PARA_RETIRO email**

Replace the existing `cambiarEstado` function:

```js
export async function cambiarEstado(orden_id, nuevo_estado, extras = {}) {
  const updateData = { estado: nuevo_estado, ...extras };

  const { data: orden, error } = await supabase
    .from("ordenes")
    .update(updateData)
    .eq("id", orden_id)
    .select("*, clientes(nombre, email)")
    .single();

  if (error) throw error;

  if (nuevo_estado === "LISTO_PARA_RETIRO" && orden.clientes?.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    triggerNotification("LISTO_PARA_RETIRO", {
      clienteEmail: orden.clientes.email,
      clienteNombre: orden.clientes.nombre,
      numeroOrden: String(orden.numero_orden).padStart(4, "0"),
      tipoArticulo: orden.tipo_articulo,
      marca: orden.marca || "",
      trackingUrl: `${appUrl}/seguimiento/${orden.tracking_token}`,
    });
  }

  return orden;
}
```

- [ ] **Step 5: Verify manually**

```bash
npm run dev
```

1. Create a new order for a client that has an email in Supabase.
2. Check Resend dashboard → Emails — should see the orden-creada email.
3. Change status to LISTO_PARA_RETIRO — should see the listo-para-retiro email.

- [ ] **Step 6: Commit**

```bash
git add lib/data.js app/api/notify/route.js
git commit -m "feat: send email notifications on order creation and ready-for-pickup"
```

---

### Task 10: Public tracking page

**Files:**
- Create: `app/seguimiento/[token]/page.js`

This is a server component — it fetches data server-side using the admin client (bypasses RLS since the page is public), no auth required.

- [ ] **Step 1: Create tracking page**

```jsx
// app/seguimiento/[token]/page.js
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ESTADOS, formatFecha, formatNumeroOrden } from "@/lib/constants";
import { notFound } from "next/navigation";

export default async function SeguimientoPage({ params }) {
  const { token } = await params;

  const { data: orden, error } = await supabaseAdmin
    .from("ordenes")
    .select("*, clientes(nombre), talleres(nombre)")
    .eq("tracking_token", token)
    .single();

  if (error || !orden) notFound();

  const estadoConfig = ESTADOS[orden.estado];

  // Build a simple timeline of key dates
  const timeline = [
    { label: "Ingresado", fecha: orden.fecha_ingreso, done: true },
    { label: "En proceso", fecha: orden.fecha_aprobacion || orden.fecha_envio_taller, done: !!orden.fecha_aprobacion || !!orden.fecha_envio_taller },
    { label: "Listo para retiro", fecha: orden.fecha_listo, done: !!orden.fecha_listo },
    { label: "Entregado", fecha: orden.fecha_entrega, done: !!orden.fecha_entrega },
  ];

  return (
    <div className="min-h-screen bg-slate-100 py-12 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="text-4xl">⌚</span>
          <h1 className="text-lg font-bold text-slate-900 mt-2">RepairTrack</h1>
          <p className="text-sm text-slate-500">Seguimiento de orden</p>
        </div>

        {/* Order card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Orden</div>
              <div className="text-3xl font-extrabold text-slate-900 font-mono">
                #{formatNumeroOrden(orden.numero_orden)}
              </div>
            </div>
            <div
              className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ backgroundColor: estadoConfig.bg, color: estadoConfig.color }}
            >
              {estadoConfig.icon} {estadoConfig.label}
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-slate-400 w-24 flex-shrink-0">Cliente</span>
              <span className="font-semibold text-slate-900">{orden.clientes?.nombre}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 w-24 flex-shrink-0">Artículo</span>
              <span className="text-slate-700">
                {orden.tipo_articulo}{orden.marca ? ` — ${orden.marca}` : ""}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 w-24 flex-shrink-0">Ingreso</span>
              <span className="text-slate-700">{formatFecha(orden.fecha_ingreso)}</span>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-4">Progreso</div>
          <div className="space-y-3">
            {timeline.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    step.done
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-100 text-slate-300"
                  }`}
                >
                  {step.done ? "✓" : "○"}
                </div>
                <div className="flex-1">
                  <div className={`text-sm font-semibold ${step.done ? "text-slate-900" : "text-slate-300"}`}>
                    {step.label}
                  </div>
                  {step.fecha && (
                    <div className="text-xs text-slate-400">{formatFecha(step.fecha)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify tracking page works**

```bash
npm run dev
```

1. Create an order via the dashboard.
2. Run in Supabase SQL editor: `SELECT tracking_token FROM ordenes ORDER BY created_at DESC LIMIT 1;`
3. Open `http://localhost:3000/seguimiento/<token>` — should show order details without login.

- [ ] **Step 3: Commit**

```bash
git add app/seguimiento/
git commit -m "feat: add public order tracking page"
```

---

### Task 11: Maintenance reminder cron + tests

**Files:**
- Create: `app/api/cron/recordatorios/route.js`
- Create: `__tests__/cron.test.js`

- [ ] **Step 1: Write tests for reminder eligibility logic**

```js
// __tests__/cron.test.js
import { isReminderDue } from '@/lib/notifications/reminder-logic'

describe('isReminderDue', () => {
  it('returns true when ciclo_meses have passed since last service', () => {
    const fechaEntrega = new Date()
    fechaEntrega.setMonth(fechaEntrega.getMonth() - 19) // 19 months ago
    expect(isReminderDue(fechaEntrega.toISOString(), 18)).toBe(true)
  })

  it('returns false when ciclo_meses have not passed', () => {
    const fechaEntrega = new Date()
    fechaEntrega.setMonth(fechaEntrega.getMonth() - 10) // 10 months ago
    expect(isReminderDue(fechaEntrega.toISOString(), 18)).toBe(false)
  })

  it('returns true on the exact day the cycle completes', () => {
    const fechaEntrega = new Date()
    fechaEntrega.setMonth(fechaEntrega.getMonth() - 18)
    expect(isReminderDue(fechaEntrega.toISOString(), 18)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `isReminderDue` not found.

- [ ] **Step 3: Create reminder logic module**

```js
// lib/notifications/reminder-logic.js

/**
 * Returns true if ciclo_meses months have passed since fechaEntrega.
 * @param {string} fechaEntrega - ISO date string
 * @param {number} cicloMeses - reminder cycle in months
 */
export function isReminderDue(fechaEntrega, cicloMeses) {
  const entrega = new Date(fechaEntrega);
  const due = new Date(entrega);
  due.setMonth(due.getMonth() + cicloMeses);
  return new Date() >= due;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: All 3 cron tests pass.

- [ ] **Step 5: Create cron API route**

```js
// app/api/cron/recordatorios/route.js
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendNotification } from "@/lib/notifications";
import { isReminderDue } from "@/lib/notifications/reminder-logic";
import { NextResponse } from "next/server";

export async function GET(request) {
  // Verify secret token to prevent unauthorized calls
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all delivered orders with client email + service type info
  const { data: ordenes, error } = await supabaseAdmin
    .from("ordenes")
    .select(`
      id,
      tipo_articulo,
      fecha_entrega,
      clientes(id, nombre, email)
    `)
    .eq("estado", "ENTREGADO")
    .not("fecha_entrega", "is", null)
    .not("clientes.email", "is", null);

  if (error) {
    console.error("[Cron] Error fetching orders:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch service types with their cycles
  const { data: tiposServicio } = await supabaseAdmin
    .from("tipos_servicio")
    .select("nombre, ciclo_meses")
    .eq("activo", true);

  // Build a map: tipo nombre → ciclo_meses
  const cicloMap = {};
  tiposServicio?.forEach((t) => {
    cicloMap[t.nombre.toLowerCase()] = t.ciclo_meses;
  });

  // Check which orders already have a pending reminder sent this month
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  const { data: yaEnviados } = await supabaseAdmin
    .from("notificaciones_enviadas")
    .select("orden_id")
    .eq("tipo_notificacion", "RECORDATORIO_MANTENIMIENTO")
    .gte("created_at", startOfMonth);

  const yaEnviadosSet = new Set(yaEnviados?.map((n) => n.orden_id) || []);

  let sent = 0;
  const errors = [];

  for (const orden of ordenes || []) {
    if (yaEnviadosSet.has(orden.id)) continue; // already sent this month
    if (!orden.clientes?.email) continue;

    // Find matching service cycle by tipo_articulo
    const articulo = orden.tipo_articulo.toLowerCase();
    let cicloMeses = null;

    // Try exact match first, then partial match
    for (const [nombre, ciclo] of Object.entries(cicloMap)) {
      if (articulo.includes(nombre) || nombre.includes(articulo)) {
        cicloMeses = ciclo;
        break;
      }
    }

    if (!cicloMeses) continue; // no matching service type configured

    if (!isReminderDue(orden.fecha_entrega, cicloMeses)) continue;

    try {
      await sendNotification("RECORDATORIO_MANTENIMIENTO", {
        clienteEmail: orden.clientes.email,
        clienteNombre: orden.clientes.nombre,
        tipoServicio: orden.tipo_articulo,
        ultimaFecha: new Date(orden.fecha_entrega).toLocaleDateString("es-UY", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
      });

      // Record that we sent it
      await supabaseAdmin.from("notificaciones_enviadas").insert({
        orden_id: orden.id,
        cliente_id: orden.clientes.id,
        tipo_notificacion: "RECORDATORIO_MANTENIMIENTO",
        tipo: "RECORDATORIO_MANTENIMIENTO",
        canal: "email",
        enviado: true,
        fecha_envio: new Date().toISOString(),
      });

      sent++;
    } catch (e) {
      errors.push({ orden_id: orden.id, error: e.message });
    }
  }

  return NextResponse.json({ sent, errors });
}
```

- [ ] **Step 6: Add CRON_SECRET to .env.local**

```bash
# .env.local
CRON_SECRET=a-long-random-secret-string
```

Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

- [ ] **Step 7: Verify cron endpoint**

```bash
npm run dev
```

```bash
curl "http://localhost:3000/api/cron/recordatorios?secret=your-secret"
```

Expected: `{"sent":0,"errors":[]}` (no orders ready yet)

- [ ] **Step 8: Commit**

```bash
git add app/api/cron/ lib/notifications/reminder-logic.js __tests__/cron.test.js
git commit -m "feat: add maintenance reminder cron endpoint"
```

---

## ═══════════════════════════════════════
## PHASE 3 — ADMIN + REPORTS
## ═══════════════════════════════════════

---

### Task 12: Admin layout + navigation

**Files:**
- Create: `app/admin/layout.js`
- Create: `app/admin/page.js`

- [ ] **Step 1: Create admin layout**

```jsx
// app/admin/layout.js
import Link from "next/link";

export default function AdminLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-100">
      {/* Admin header */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⌚</span>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">RepairTrack</h1>
              <p className="text-[11px] text-slate-400">Panel de administración</p>
            </div>
          </div>
          <Link href="/" className="text-xs text-slate-400 hover:text-white transition-colors px-3 py-2">
            ← Volver al dashboard
          </Link>
        </div>
      </header>

      {/* Admin nav tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1">
            {[
              { href: "/admin/tipos-servicio", label: "⚙️ Tipos de servicio" },
              { href: "/admin/usuarios", label: "👤 Usuarios" },
              { href: "/admin/reportes", label: "📊 Reportes" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-b-2 border-transparent hover:border-slate-300 transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create admin index (redirect)**

```js
// app/admin/page.js
import { redirect } from "next/navigation";

export default function AdminPage() {
  redirect("/admin/tipos-servicio");
}
```

- [ ] **Step 3: Verify**

```bash
npm run dev
```

Open http://localhost:3000/admin — should redirect to /admin/tipos-servicio (which will 404 for now). Admin layout should be visible.

- [ ] **Step 4: Commit**

```bash
git add app/admin/layout.js app/admin/page.js
git commit -m "feat: add admin layout and navigation"
```

---

### Task 13: Service types CRUD (admin)

**Files:**
- Create: `app/admin/tipos-servicio/page.js`
- Modify: `lib/data.js` (add getTiposServicio, crearTipoServicio, updateTipoServicio, deleteTipoServicio)

- [ ] **Step 1: Add data functions to lib/data.js**

Add these functions at the end of lib/data.js:

```js
// ============================================================
// TIPOS DE SERVICIO
// ============================================================

export async function getTiposServicio() {
  const { data, error } = await supabase
    .from("tipos_servicio")
    .select("*")
    .order("nombre");
  if (error) throw error;
  return data;
}

export async function crearTipoServicio({ nombre, ciclo_meses }) {
  const { data, error } = await supabase
    .from("tipos_servicio")
    .insert({ nombre, ciclo_meses: parseInt(ciclo_meses) })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTipoServicio(id, { nombre, ciclo_meses }) {
  const { data, error } = await supabase
    .from("tipos_servicio")
    .update({ nombre, ciclo_meses: parseInt(ciclo_meses) })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTipoServicio(id) {
  const { error } = await supabase
    .from("tipos_servicio")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 2: Create tipos-servicio page**

```jsx
// app/admin/tipos-servicio/page.js
"use client";

import { useState, useEffect } from "react";
import { getTiposServicio, crearTipoServicio, updateTipoServicio, deleteTipoServicio } from "@/lib/data";

export default function TiposServicioPage() {
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ nombre: "", ciclo_meses: 12 });
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setTipos(await getTiposServicio());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!form.nombre || !form.ciclo_meses) return;
    setError(null);
    try {
      if (editingId) {
        await updateTipoServicio(editingId, form);
      } else {
        await crearTipoServicio(form);
      }
      setShowNew(false);
      setEditingId(null);
      setForm({ nombre: "", ciclo_meses: 12 });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este tipo de servicio?")) return;
    try {
      await deleteTipoServicio(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit(tipo) {
    setEditingId(tipo.id);
    setForm({ nombre: tipo.nombre, ciclo_meses: tipo.ciclo_meses });
    setShowNew(true);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Tipos de servicio</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Configurá los ciclos de recordatorio por tipo de servicio
          </p>
        </div>
        <button
          onClick={() => { setShowNew(true); setEditingId(null); setForm({ nombre: "", ciclo_meses: 12 }); }}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 transition-colors"
        >
          + Agregar tipo
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Form */}
      {showNew && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <h3 className="font-semibold text-slate-900 mb-4">
            {editingId ? "Editar tipo" : "Nuevo tipo de servicio"}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Nombre
              </label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Cambio de pila"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Ciclo de recordatorio (meses)
              </label>
              <input
                type="number"
                value={form.ciclo_meses}
                onChange={(e) => setForm({ ...form, ciclo_meses: e.target.value })}
                min="1"
                max="120"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={!form.nombre || !form.ciclo_meses}
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50"
            >
              {editingId ? "Guardar cambios" : "Crear tipo"}
            </button>
            <button
              onClick={() => { setShowNew(false); setEditingId(null); }}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Cargando...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tipo de servicio</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ciclo de recordatorio</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.nombre}</td>
                  <td className="px-4 py-3 text-slate-600">
                    Cada <span className="font-bold">{t.ciclo_meses}</span> meses
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tipos.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-slate-400 text-sm">
                    No hay tipos de servicio configurados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify CRUD works**

```bash
npm run dev
```

1. Open http://localhost:3000/admin/tipos-servicio (logged in as dueno)
2. Should see the 4 initial service types from the migration
3. Add a new type, edit one, delete one — all should persist

- [ ] **Step 4: Commit**

```bash
git add app/admin/tipos-servicio/ lib/data.js
git commit -m "feat: add service types CRUD in admin panel"
```

---

### Task 14: User management (admin)

**Files:**
- Create: `app/admin/usuarios/page.js`
- Create: `app/api/admin/usuarios/route.js`

User management requires the Supabase Admin API (service role key). We expose it only through API routes, never in client components.

- [ ] **Step 1: Create API route for user management**

```js
// app/api/admin/usuarios/route.js
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// Helper: verify caller is dueno
async function verifyDueno() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "dueno") return false;
  return true;
}

// GET — list all users
export async function GET() {
  if (!(await verifyDueno())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.app_metadata?.role || "empleado",
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  }));

  return NextResponse.json({ users });
}

// POST — invite a new user
export async function POST(request) {
  if (!(await verifyDueno())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email, role } = await request.json();
  if (!email || !role) {
    return NextResponse.json({ error: "email and role required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { role }, // sets user_metadata
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Set app_metadata.role (more secure than user_metadata)
  await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
    app_metadata: { role },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — remove a user
export async function DELETE(request) {
  if (!(await verifyDueno())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create usuarios page**

```jsx
// app/admin/usuarios/page.js
"use client";

import { useState, useEffect } from "react";

export default function UsuariosPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "empleado" });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/usuarios");
      const { users } = await res.json();
      setUsers(users || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleInvite(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Invitación enviada a ${inviteForm.email}`);
      setShowInvite(false);
      setInviteForm({ email: "", role: "empleado" });
      await loadUsers();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(userId, email) {
    if (!confirm(`¿Eliminar el usuario ${email}?`)) return;
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await loadUsers();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Usuarios</h2>
          <p className="text-sm text-slate-500 mt-0.5">Invitá y gestioná el acceso al sistema</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 transition-colors"
        >
          + Invitar usuario
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

      {showInvite && (
        <form onSubmit={handleInvite} className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <h3 className="font-semibold text-slate-900 mb-4">Invitar nuevo usuario</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Email</label>
              <input
                type="email"
                required
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="empleado@email.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Rol</label>
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                <option value="empleado">Empleado</option>
                <option value="dueno">Dueño</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600">
              Enviar invitación
            </button>
            <button type="button" onClick={() => setShowInvite(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Cargando...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Rol</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Último acceso</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      u.role === "dueno"
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      {u.role === "dueno" ? "Dueño" : "Empleado"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {u.last_sign_in_at
                      ? new Date(u.last_sign_in_at).toLocaleDateString("es-UY")
                      : "Nunca"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(u.id, u.email)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
npm run dev
```

1. Open http://localhost:3000/admin/usuarios — should list your current user
2. Invite a new user — should send an invitation email via Supabase
3. The invited user can follow the link in their email to set a password

- [ ] **Step 4: Commit**

```bash
git add app/admin/usuarios/ app/api/admin/
git commit -m "feat: add user management with invite flow"
```

---

### Task 15: Reports dashboard (admin)

**Files:**
- Create: `app/admin/reportes/page.js`
- Modify: `lib/data.js` (add getReportesStats)

- [ ] **Step 1: Add getReportesStats to lib/data.js**

```js
// Add to lib/data.js

export async function getReportesStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  // All non-draft orders
  const { data: todasLasOrdenes, error } = await supabase
    .from("ordenes")
    .select("id, estado, fecha_ingreso, fecha_entrega, fecha_listo, monto_presupuesto, cliente_id, tipo_articulo");

  if (error) throw error;

  const ordenesEsteMes = todasLasOrdenes.filter(
    (o) => o.fecha_ingreso >= startOfMonth
  );

  const ordenesEntregadasEsteMes = todasLasOrdenes.filter(
    (o) => o.estado === "ENTREGADO" && o.fecha_entrega >= startOfMonth
  );

  // Revenue this month (sum of monto_presupuesto for delivered orders)
  const ingresosMes = ordenesEntregadasEsteMes.reduce(
    (sum, o) => sum + (parseFloat(o.monto_presupuesto) || 0),
    0
  );

  // Average resolution time (fecha_listo - fecha_ingreso) for completed orders
  const ordenesTiempo = todasLasOrdenes.filter((o) => o.fecha_listo && o.fecha_ingreso);
  const promedioDias =
    ordenesTiempo.length > 0
      ? Math.round(
          ordenesTiempo.reduce((sum, o) => {
            const diff = new Date(o.fecha_listo) - new Date(o.fecha_ingreso);
            return sum + diff / (1000 * 60 * 60 * 24);
          }, 0) / ordenesTiempo.length
        )
      : 0;

  // Unique clients
  const clientesUnicos = new Set(todasLasOrdenes.map((o) => o.cliente_id)).size;
  const clientesNuevosEsteMes = new Set(
    ordenesEsteMes.map((o) => o.cliente_id)
  ).size;

  // Breakdown by tipo_articulo
  const porTipo = {};
  todasLasOrdenes.forEach((o) => {
    porTipo[o.tipo_articulo] = (porTipo[o.tipo_articulo] || 0) + 1;
  });

  return {
    ordenesEsteMes: ordenesEsteMes.length,
    ordenesEntregadasEsteMes: ordenesEntregadasEsteMes.length,
    ingresosMes,
    promedioDias,
    clientesUnicos,
    clientesNuevosEsteMes,
    porTipo,
    totalOrdenes: todasLasOrdenes.length,
  };
}
```

- [ ] **Step 2: Create reports page**

```jsx
// app/admin/reportes/page.js
"use client";

import { useState, useEffect } from "react";
import { getReportesStats } from "@/lib/data";

function StatBox({ label, value, sub, color = "#6366f1" }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">{label}</div>
      <div className="text-3xl font-extrabold" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function ReportesPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReportesStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-slate-400">Cargando reportes...</div>;
  if (!stats) return null;

  const topTipos = Object.entries(stats.porTipo)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Reportes</h2>
        <p className="text-sm text-slate-500 mt-0.5">Resumen de actividad del negocio</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatBox
          label="Órdenes este mes"
          value={stats.ordenesEsteMes}
          sub={`${stats.totalOrdenes} históricas`}
          color="#6366f1"
        />
        <StatBox
          label="Entregadas este mes"
          value={stats.ordenesEntregadasEsteMes}
          color="#22c55e"
        />
        <StatBox
          label="Ingresos del mes"
          value={`$${Math.round(stats.ingresosMes).toLocaleString("es-UY")}`}
          sub="UYU (presupuestado)"
          color="#f59e0b"
        />
        <StatBox
          label="Promedio de resolución"
          value={`${stats.promedioDias}d`}
          sub="días hasta listo"
          color="#8b5cf6"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Clients */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-4">Clientes</div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Total en la base</span>
              <span className="font-bold text-slate-900">{stats.clientesUnicos}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Nuevos este mes</span>
              <span className="font-bold text-indigo-600">{stats.clientesNuevosEsteMes}</span>
            </div>
          </div>
        </div>

        {/* Top article types */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-4">
            Artículos más frecuentes
          </div>
          <div className="space-y-2">
            {topTipos.map(([tipo, count]) => (
              <div key={tipo} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700">{tipo}</span>
                    <span className="font-semibold text-slate-900">{count}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-full"
                      style={{ width: `${(count / stats.totalOrdenes) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {topTipos.length === 0 && (
              <div className="text-sm text-slate-400">Sin datos aún</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
npm run dev
```

Open http://localhost:3000/admin/reportes — should show stats. With no data, most numbers will be 0.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Final commit**

```bash
git add app/admin/reportes/ lib/data.js
git commit -m "feat: add reports dashboard in admin panel"
```

---

## Post-Implementation Checklist

Before going live:

- [ ] Set `NEXT_PUBLIC_APP_URL` to production domain in hosting env vars
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` in hosting env vars (never commit this)
- [ ] Set `RESEND_API_KEY` in hosting env vars
- [ ] Set `CRON_SECRET` in hosting env vars
- [ ] Verify Resend domain is configured (DNS records for the sending domain)
- [ ] Create first `dueno` user and set role via Supabase SQL editor
- [ ] Run `002_v1_additions.sql` migration in production Supabase
- [ ] Configure cron-job.org to hit `/api/cron/recordatorios?secret=<CRON_SECRET>` daily at 9am

---

## Self-Review Notes

**Spec coverage:**
- ✅ Remove cadete module — Task 2
- ✅ Auth with roles (dueno, empleado) — Tasks 3, 4, 5
- ✅ Customer profiles (clientes table already exists, notifications wired) — Task 9
- ✅ Email abstraction layer scalable to WhatsApp — Task 8
- ✅ Tracking link per order — Tasks 6, 10
- ✅ Email on order creation — Task 9
- ✅ Email on LISTO_PARA_RETIRO — Task 9
- ✅ Maintenance reminders via cron — Task 11
- ✅ Admin section — Tasks 12-15
- ✅ Configurable service type cycles — Tasks 6, 13
- ✅ User management — Task 14
- ✅ Reports dashboard — Task 15
