# Vista de Cadete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `cadete` role with a restricted view showing only assigned task summaries (traslados + ad-hoc), managed by admin/employee.

**Architecture:** New `cadete` role in `usuarios`, two new tables (`resumenes_cadete`, `items_resumen_cadete`), a DB view for the cadete's item display, a dedicated `/cadete` page, API routes for CRUD, and a management panel accessible from the main dashboard.

**Tech Stack:** Next.js (App Router), Supabase (PostgreSQL), NextAuth (JWT sessions), Tailwind CSS.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/025_vista_cadete.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/025_vista_cadete.sql
-- Add cadete role and resumen tables

BEGIN;

-- ============================================================
-- 1. Add 'cadete' to usuarios role constraint
-- ============================================================
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_role_check
  CHECK (role IN ('admin', 'employee', 'cadete'));

-- ============================================================
-- 2. Create resumenes_cadete table
-- ============================================================
CREATE TABLE IF NOT EXISTS resumenes_cadete (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cadete_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_por UUID NOT NULL REFERENCES usuarios(id),
  nombre TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resumenes_cadete_cadete_activo
  ON resumenes_cadete(cadete_id, activo);

-- Trigger for updated_at (reuses existing function from 001_schema.sql)
CREATE TRIGGER update_resumenes_cadete_updated_at
  BEFORE UPDATE ON resumenes_cadete
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE resumenes_cadete ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON resumenes_cadete
  FOR ALL USING (auth.role() = 'authenticated' OR true);

-- ============================================================
-- 3. Create items_resumen_cadete table
-- ============================================================
CREATE TABLE IF NOT EXISTS items_resumen_cadete (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resumen_id UUID NOT NULL REFERENCES resumenes_cadete(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('traslado', 'ad_hoc')),
  traslado_id UUID REFERENCES traslados(id) ON DELETE SET NULL,
  descripcion TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT items_tipo_check CHECK (
    (tipo = 'traslado' AND traslado_id IS NOT NULL)
    OR (tipo = 'ad_hoc' AND descripcion IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_items_resumen_cadete_resumen
  ON items_resumen_cadete(resumen_id);

-- RLS
ALTER TABLE items_resumen_cadete ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON items_resumen_cadete
  FOR ALL USING (auth.role() = 'authenticated' OR true);

-- ============================================================
-- 4. Create view for cadete item display
-- ============================================================
CREATE OR REPLACE VIEW v_items_resumen_cadete AS
SELECT
  i.id AS item_id,
  i.resumen_id,
  i.tipo,
  i.orden,
  i.created_at,
  -- Traslado fields (NULL for ad_hoc)
  t.id AS traslado_id,
  t.tipo AS traslado_tipo,
  t.estado AS traslado_estado,
  o.tipo_articulo,
  o.marca,
  o.modelo,
  so.nombre AS sucursal_origen_nombre,
  sd.nombre AS sucursal_destino_nombre,
  -- Ad-hoc fields (NULL for traslado)
  i.descripcion
FROM items_resumen_cadete i
LEFT JOIN traslados t ON i.traslado_id = t.id
LEFT JOIN ordenes o ON t.orden_id = o.id
LEFT JOIN sucursales so ON t.sucursal_origen = so.id
LEFT JOIN sucursales sd ON t.sucursal_destino = sd.id
ORDER BY i.orden ASC, i.created_at ASC;

COMMIT;
```

- [ ] **Step 2: Run the migration against the database**

Run: `psql $DATABASE_URL -f supabase/025_vista_cadete.sql`
Expected: `COMMIT` with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/025_vista_cadete.sql
git commit -m "feat: add cadete role, resumenes and items tables"
```

---

### Task 2: Middleware — cadete routing restrictions

**Files:**
- Modify: `middleware.js`

- [ ] **Step 1: Update middleware to handle cadete role routing**

Replace the entire content of `middleware.js` with:

```js
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Always public
  if (pathname.startsWith("/seguimiento")) return NextResponse.next()

  // Login page: redirect authenticated users based on role
  if (pathname.startsWith("/login")) {
    if (session) {
      const dest = session.user?.role === "cadete" ? "/cadete" : "/"
      return NextResponse.redirect(new URL(dest, req.url))
    }
    return NextResponse.next()
  }

  // All other routes require auth
  if (!session) return NextResponse.redirect(new URL("/login", req.url))

  const role = session.user?.role

  // Cadete can only access /cadete and /api/cadete/*
  if (role === "cadete") {
    if (pathname === "/cadete" || pathname.startsWith("/api/cadete")) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL("/cadete", req.url))
  }

  // Non-cadete users cannot access /cadete
  if (pathname === "/cadete") {
    return NextResponse.redirect(new URL("/", req.url))
  }

  // Admin routes require admin role
  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)"],
}
```

Note: The `matcher` excludes `/api` routes from middleware page-redirect logic. API route protection for `/api/cadete/*` and `/api/resumenes-cadete/*` is handled within each route handler via session checks (same pattern as existing `/api/admin/*` routes).

- [ ] **Step 2: Update login page to redirect cadete to /cadete**

In `app/login/page.js`, the `handleLogin` function currently does `router.push("/")`. Update it to check the session role after login. Replace the `handleLogin` function:

```js
async function handleLogin(e) {
  e.preventDefault()
  setLoading(true)
  setError(null)

  const result = await signIn("credentials", {
    username,
    password,
    redirect: false,
  })

  if (result?.error) {
    setError("Usuario o contrasena incorrectos")
    setLoading(false)
  } else {
    // Fetch session to determine role-based redirect
    const res = await fetch("/api/auth/session")
    const session = await res.json()
    const dest = session?.user?.role === "cadete" ? "/cadete" : "/"
    router.push(dest)
    router.refresh()
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add middleware.js app/login/page.js
git commit -m "feat: add cadete role routing in middleware and login redirect"
```

---

### Task 3: User management — support cadete role

**Files:**
- Modify: `app/api/admin/usuarios/route.js`
- Modify: `app/admin/usuarios/page.js`

- [ ] **Step 1: Update API to accept cadete role**

In `app/api/admin/usuarios/route.js`, find the role validation in the POST handler (line 53):

```js
  if (!["employee", "admin"].includes(role)) {
```

Replace with:

```js
  if (!["employee", "admin", "cadete"].includes(role)) {
```

Find the sucursal_id requirement check (line 56-58):

```js
  if (role === "employee" && !sucursal_id) {
    return NextResponse.json({ error: "sucursal_id es requerido para employees" }, { status: 400 })
  }
```

Replace with:

```js
  if ((role === "employee" || role === "cadete") && !sucursal_id) {
    return NextResponse.json({ error: "sucursal_id es requerido para employees y cadetes" }, { status: 400 })
  }
```

Find the insert (line 67):

```js
    .insert({ username, password_hash, role, sucursal_id: role === "employee" ? sucursal_id : null })
```

Replace with:

```js
    .insert({ username, password_hash, role, sucursal_id: (role === "employee" || role === "cadete") ? sucursal_id : null })
```

Find the PATCH handler role validation (line 143):

```js
  if (!["employee", "admin"].includes(role)) {
```

Replace with:

```js
  if (!["employee", "admin", "cadete"].includes(role)) {
```

Find the PATCH update (line 147):

```js
    .update({ role, sucursal_id: role === "employee" ? (sucursal_id ?? null) : null })
```

Replace with:

```js
    .update({ role, sucursal_id: (role === "employee" || role === "cadete") ? (sucursal_id ?? null) : null })
```

- [ ] **Step 2: Update admin UI to show cadete role option**

In `app/admin/usuarios/page.js`, find the role `<select>` in the create form (lines 150-157):

```jsx
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value, sucursal_id: "" })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </select>
```

Replace with:

```jsx
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value, sucursal_id: "" })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                <option value="employee">Employee</option>
                <option value="cadete">Cadete</option>
                <option value="admin">Admin</option>
              </select>
```

Find the sucursal conditional (line 160):

```jsx
          {form.role === "employee" && (
```

Replace with:

```jsx
          {(form.role === "employee" || form.role === "cadete") && (
```

Find the role `<select>` in the users table (lines 223-229):

```jsx
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value, u.sucursal_id)}
                      className="px-2 py-0.5 rounded-full text-xs font-semibold border-0 cursor-pointer focus:ring-2 focus:ring-indigo-500/20 bg-transparent"
                    >
                      <option value="employee">Employee</option>
                      <option value="admin">Admin</option>
                    </select>
```

Replace with:

```jsx
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value, u.sucursal_id)}
                      className="px-2 py-0.5 rounded-full text-xs font-semibold border-0 cursor-pointer focus:ring-2 focus:ring-indigo-500/20 bg-transparent"
                    >
                      <option value="employee">Employee</option>
                      <option value="cadete">Cadete</option>
                      <option value="admin">Admin</option>
                    </select>
```

Find the sucursal display conditional (line 233):

```jsx
                    {u.role === "employee" ? (u.sucursales?.nombre ?? "—") : <span className="text-slate-400">Todas</span>}
```

Replace with:

```jsx
                    {(u.role === "employee" || u.role === "cadete") ? (u.sucursales?.nombre ?? "—") : <span className="text-slate-400">Todas</span>}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/usuarios/route.js app/admin/usuarios/page.js
git commit -m "feat: support cadete role in user management"
```

---

### Task 4: Data layer — cadete functions

**Files:**
- Create: `lib/cadete.js`

- [ ] **Step 1: Create the cadete data layer**

```js
// lib/cadete.js
// Data layer for cadete resumen management

import { getSupabaseClient } from "./supabase-client"

// ============================================================
// RESUMENES — used by admin/employee
// ============================================================

/**
 * Get all resumenes with item counts, optionally filtered.
 * @returns {Promise<Array>}
 */
export async function getResumenes() {
  const { data, error } = await getSupabaseClient()
    .from("resumenes_cadete")
    .select("*, cadete:usuarios!resumenes_cadete_cadete_id_fkey(id, username), items:items_resumen_cadete(id)")
    .order("created_at", { ascending: false })

  if (error) throw error
  return (data ?? []).map((r) => ({
    ...r,
    cadete_username: r.cadete?.username ?? "—",
    item_count: r.items?.length ?? 0,
    items: undefined,
    cadete: undefined,
  }))
}

/**
 * Create a new resumen for a cadete.
 * @param {Object} params
 * @param {string} params.cadete_id
 * @param {string} params.creado_por
 * @param {string} [params.nombre]
 * @returns {Promise<Object>}
 */
export async function crearResumen({ cadete_id, creado_por, nombre }) {
  const { data, error } = await getSupabaseClient()
    .from("resumenes_cadete")
    .insert({ cadete_id, creado_por, nombre: nombre || null })
    .select("*")
    .single()

  if (error) throw error
  return data
}

/**
 * Update a resumen (name, active status).
 * @param {string} id
 * @param {Object} updates - { nombre?, activo? }
 * @returns {Promise<Object>}
 */
export async function updateResumen(id, updates) {
  const allowed = {}
  if (updates.nombre !== undefined) allowed.nombre = updates.nombre || null
  if (updates.activo !== undefined) allowed.activo = updates.activo

  const { data, error } = await getSupabaseClient()
    .from("resumenes_cadete")
    .update(allowed)
    .eq("id", id)
    .select("*")
    .single()

  if (error) throw error
  return data
}

/**
 * Delete a resumen and all its items (CASCADE).
 * @param {string} id
 */
export async function deleteResumen(id) {
  const { error } = await getSupabaseClient()
    .from("resumenes_cadete")
    .delete()
    .eq("id", id)

  if (error) throw error
}

// ============================================================
// ITEMS — used by admin/employee
// ============================================================

/**
 * Get items for a resumen using the view (includes traslado details).
 * @param {string} resumen_id
 * @returns {Promise<Array>}
 */
export async function getItemsResumen(resumen_id) {
  const { data, error } = await getSupabaseClient()
    .from("v_items_resumen_cadete")
    .select("*")
    .eq("resumen_id", resumen_id)
    .order("orden", { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Add a traslado item to a resumen.
 * @param {string} resumen_id
 * @param {string} traslado_id
 * @returns {Promise<Object>}
 */
export async function addItemTraslado(resumen_id, traslado_id) {
  // Get max orden for this resumen
  const { data: existing } = await getSupabaseClient()
    .from("items_resumen_cadete")
    .select("orden")
    .eq("resumen_id", resumen_id)
    .order("orden", { ascending: false })
    .limit(1)

  const nextOrden = (existing?.[0]?.orden ?? -1) + 1

  const { data, error } = await getSupabaseClient()
    .from("items_resumen_cadete")
    .insert({ resumen_id, tipo: "traslado", traslado_id, orden: nextOrden })
    .select("*")
    .single()

  if (error) throw error
  return data
}

/**
 * Add an ad-hoc item to a resumen.
 * @param {string} resumen_id
 * @param {string} descripcion
 * @returns {Promise<Object>}
 */
export async function addItemAdHoc(resumen_id, descripcion) {
  const { data: existing } = await getSupabaseClient()
    .from("items_resumen_cadete")
    .select("orden")
    .eq("resumen_id", resumen_id)
    .order("orden", { ascending: false })
    .limit(1)

  const nextOrden = (existing?.[0]?.orden ?? -1) + 1

  const { data, error } = await getSupabaseClient()
    .from("items_resumen_cadete")
    .insert({ resumen_id, tipo: "ad_hoc", descripcion, orden: nextOrden })
    .select("*")
    .single()

  if (error) throw error
  return data
}

/**
 * Delete an item from a resumen.
 * @param {string} item_id
 */
export async function deleteItem(item_id) {
  const { error } = await getSupabaseClient()
    .from("items_resumen_cadete")
    .delete()
    .eq("id", item_id)

  if (error) throw error
}

/**
 * Reorder items: swap two items' orden values.
 * @param {string} item_id_a
 * @param {number} orden_a - new orden for item A
 * @param {string} item_id_b
 * @param {number} orden_b - new orden for item B
 */
export async function swapItemOrder(item_id_a, orden_a, item_id_b, orden_b) {
  const supabase = getSupabaseClient()

  const { error: errA } = await supabase
    .from("items_resumen_cadete")
    .update({ orden: orden_a })
    .eq("id", item_id_a)

  if (errA) throw errA

  const { error: errB } = await supabase
    .from("items_resumen_cadete")
    .update({ orden: orden_b })
    .eq("id", item_id_b)

  if (errB) throw errB
}

// ============================================================
// CADETE VIEW — used by cadete
// ============================================================

/**
 * Get active resumenes for a specific cadete, with all items via the view.
 * @param {string} cadete_id
 * @returns {Promise<Array>} Array of resumenes, each with an `items` array
 */
export async function getResumenesCadete(cadete_id) {
  // 1. Get active resumenes for this cadete
  const { data: resumenes, error: rErr } = await getSupabaseClient()
    .from("resumenes_cadete")
    .select("id, nombre, created_at")
    .eq("cadete_id", cadete_id)
    .eq("activo", true)
    .order("created_at", { ascending: false })

  if (rErr) throw rErr
  if (!resumenes?.length) return []

  // 2. Get all items for these resumenes via the view
  const resumenIds = resumenes.map((r) => r.id)
  const { data: items, error: iErr } = await getSupabaseClient()
    .from("v_items_resumen_cadete")
    .select("*")
    .in("resumen_id", resumenIds)
    .order("orden", { ascending: true })

  if (iErr) throw iErr

  // 3. Group items by resumen
  const itemsByResumen = {}
  for (const item of items ?? []) {
    if (!itemsByResumen[item.resumen_id]) itemsByResumen[item.resumen_id] = []
    itemsByResumen[item.resumen_id].push(item)
  }

  return resumenes.map((r) => ({
    ...r,
    items: itemsByResumen[r.id] ?? [],
  }))
}

/**
 * Get all users with role 'cadete'.
 * @returns {Promise<Array>}
 */
export async function getCadetes() {
  const { data, error } = await getSupabaseClient()
    .from("usuarios")
    .select("id, username, sucursal_id")
    .eq("role", "cadete")
    .order("username")

  if (error) throw error
  return data ?? []
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/cadete.js
git commit -m "feat: add cadete data layer functions"
```

---

### Task 5: API routes — cadete endpoints

**Files:**
- Create: `app/api/cadete/resumenes/route.js`
- Create: `app/api/resumenes-cadete/route.js`
- Create: `app/api/resumenes-cadete/[id]/route.js`
- Create: `app/api/resumenes-cadete/[id]/items/route.js`

- [ ] **Step 1: Create cadete API route (GET own resumenes)**

```js
// app/api/cadete/resumenes/route.js
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getResumenesCadete } from "@/lib/cadete"

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "cadete") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const resumenes = await getResumenesCadete(session.user.id)
    return NextResponse.json({ resumenes })
  } catch (e) {
    console.error("[/api/cadete/resumenes] GET error:", e)
    return NextResponse.json({ error: "Error al obtener resumenes" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create admin/employee resumen CRUD route**

```js
// app/api/resumenes-cadete/route.js
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getResumenes, crearResumen, deleteResumen } from "@/lib/cadete"

async function verifyStaff() {
  const session = await auth()
  if (!session?.user) return null
  if (session.user.role === "admin" || session.user.role === "employee") return session
  return null
}

export async function GET() {
  if (!(await verifyStaff())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const resumenes = await getResumenes()
    return NextResponse.json({ resumenes })
  } catch (e) {
    console.error("[/api/resumenes-cadete] GET error:", e)
    return NextResponse.json({ error: "Error al obtener resumenes" }, { status: 500 })
  }
}

export async function POST(request) {
  const session = await verifyStaff()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { cadete_id, nombre } = body
  if (!cadete_id) {
    return NextResponse.json({ error: "cadete_id es requerido" }, { status: 400 })
  }

  try {
    const resumen = await crearResumen({
      cadete_id,
      creado_por: session.user.id,
      nombre,
    })
    return NextResponse.json({ resumen })
  } catch (e) {
    console.error("[/api/resumenes-cadete] POST error:", e)
    return NextResponse.json({ error: "Error al crear resumen" }, { status: 500 })
  }
}

export async function DELETE(request) {
  if (!(await verifyStaff())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { resumen_id } = body
  if (!resumen_id) {
    return NextResponse.json({ error: "resumen_id es requerido" }, { status: 400 })
  }

  try {
    await deleteResumen(resumen_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[/api/resumenes-cadete] DELETE error:", e)
    return NextResponse.json({ error: "Error al eliminar resumen" }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create resumen PATCH route (update name/active)**

```js
// app/api/resumenes-cadete/[id]/route.js
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { updateResumen } from "@/lib/cadete"

export async function PATCH(request, { params }) {
  const session = await auth()
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "employee")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const resumen = await updateResumen(id, body)
    return NextResponse.json({ resumen })
  } catch (e) {
    console.error("[/api/resumenes-cadete/[id]] PATCH error:", e)
    return NextResponse.json({ error: "Error al actualizar resumen" }, { status: 500 })
  }
}
```

- [ ] **Step 4: Create items CRUD route**

```js
// app/api/resumenes-cadete/[id]/items/route.js
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getItemsResumen, addItemTraslado, addItemAdHoc, deleteItem, swapItemOrder } from "@/lib/cadete"

async function verifyStaff() {
  const session = await auth()
  if (!session?.user) return null
  if (session.user.role === "admin" || session.user.role === "employee") return session
  return null
}

export async function GET(request, { params }) {
  if (!(await verifyStaff())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  try {
    const items = await getItemsResumen(id)
    return NextResponse.json({ items })
  } catch (e) {
    console.error("[/api/resumenes-cadete/[id]/items] GET error:", e)
    return NextResponse.json({ error: "Error al obtener items" }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  if (!(await verifyStaff())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { tipo, traslado_id, descripcion } = body

  if (tipo === "traslado" && !traslado_id) {
    return NextResponse.json({ error: "traslado_id es requerido para tipo traslado" }, { status: 400 })
  }
  if (tipo === "ad_hoc" && !descripcion) {
    return NextResponse.json({ error: "descripcion es requerida para tipo ad_hoc" }, { status: 400 })
  }
  if (!["traslado", "ad_hoc"].includes(tipo)) {
    return NextResponse.json({ error: "tipo must be 'traslado' or 'ad_hoc'" }, { status: 400 })
  }

  try {
    const item = tipo === "traslado"
      ? await addItemTraslado(id, traslado_id)
      : await addItemAdHoc(id, descripcion)
    return NextResponse.json({ item })
  } catch (e) {
    console.error("[/api/resumenes-cadete/[id]/items] POST error:", e)
    return NextResponse.json({ error: "Error al agregar item" }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  if (!(await verifyStaff())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { item_id } = body
  if (!item_id) {
    return NextResponse.json({ error: "item_id es requerido" }, { status: 400 })
  }

  try {
    await deleteItem(item_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[/api/resumenes-cadete/[id]/items] DELETE error:", e)
    return NextResponse.json({ error: "Error al eliminar item" }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  if (!(await verifyStaff())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { item_id_a, orden_a, item_id_b, orden_b } = body
  if (!item_id_a || orden_a === undefined || !item_id_b || orden_b === undefined) {
    return NextResponse.json({ error: "item_id_a, orden_a, item_id_b, orden_b required" }, { status: 400 })
  }

  try {
    await swapItemOrder(item_id_a, orden_a, item_id_b, orden_b)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[/api/resumenes-cadete/[id]/items] PATCH error:", e)
    return NextResponse.json({ error: "Error al reordenar items" }, { status: 500 })
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/cadete/resumenes/route.js app/api/resumenes-cadete/route.js app/api/resumenes-cadete/[id]/route.js "app/api/resumenes-cadete/[id]/items/route.js"
git commit -m "feat: add API routes for cadete resumen management"
```

---

### Task 6: Cadete page — restricted view

**Files:**
- Create: `app/cadete/page.js`

- [ ] **Step 1: Create the cadete page**

```jsx
// app/cadete/page.js
"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession, signOut } from "next-auth/react"

export default function CadetePage() {
  const { data: session } = useSession()
  const [resumenes, setResumenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState({})

  // Load checked state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cadete_checks")
      if (stored) setChecked(JSON.parse(stored))
    } catch {}
  }, [])

  // Save checked state to localStorage
  function toggleCheck(itemId) {
    setChecked((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] }
      try { localStorage.setItem("cadete_checks", JSON.stringify(next)) } catch {}
      return next
    })
  }

  const loadResumenes = useCallback(async () => {
    try {
      const res = await fetch("/api/cadete/resumenes")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { resumenes: data } = await res.json()
      setResumenes(data || [])

      // Clean up localStorage: remove checks for items that no longer exist
      const activeItemIds = new Set()
      for (const r of data || []) {
        for (const item of r.items || []) {
          activeItemIds.add(item.item_id)
        }
      }
      setChecked((prev) => {
        const cleaned = {}
        for (const [k, v] of Object.entries(prev)) {
          if (activeItemIds.has(k)) cleaned[k] = v
        }
        try { localStorage.setItem("cadete_checks", JSON.stringify(cleaned)) } catch {}
        return cleaned
      })
    } catch (e) {
      console.error("Error cargando resumenes:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadResumenes() }, [loadResumenes])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadResumenes, 30000)
    return () => clearInterval(interval)
  }, [loadResumenes])

  function getTrasladoLabel(item) {
    const action = item.traslado_tipo === "ida" ? "Llevar a" : "Retirar de"
    const destination = item.traslado_tipo === "ida"
      ? item.sucursal_destino_nombre
      : item.sucursal_origen_nombre
    const article = [item.tipo_articulo, item.marca, item.modelo].filter(Boolean).join(" — ")
    return { action, destination, article }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚚</span>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">RepairTrack</h1>
              <p className="text-sm text-slate-400">
                {session?.user?.username ? `Cadete: ${session.user.username}` : "Cadete"}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-5">
        {loading && (
          <div className="text-center py-20 text-slate-400">Cargando...</div>
        )}

        {!loading && resumenes.length === 0 && (
          <div className="text-center py-20">
            <span className="text-4xl block mb-3">📋</span>
            <p className="text-slate-500 text-sm">No tenes tareas asignadas</p>
          </div>
        )}

        {!loading && resumenes.map((resumen) => (
          <div key={resumen.id} className="mb-6">
            {/* Resumen header */}
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                {resumen.nombre || "Tareas asignadas"}
              </h2>
              <span className="text-xs text-slate-400">
                ({resumen.items.length} {resumen.items.length === 1 ? "item" : "items"})
              </span>
            </div>

            {resumen.items.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
                Sin items en este resumen
              </div>
            )}

            <div className="space-y-2">
              {resumen.items.map((item) => {
                const isChecked = !!checked[item.item_id]

                if (item.tipo === "traslado") {
                  const { action, destination, article } = getTrasladoLabel(item)
                  return (
                    <div
                      key={item.item_id}
                      onClick={() => toggleCheck(item.item_id)}
                      className={`bg-white rounded-xl border p-4 cursor-pointer transition-all active:scale-[0.98] ${
                        isChecked
                          ? "border-green-300 bg-green-50/50 opacity-60"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isChecked
                            ? "bg-green-500 border-green-500 text-white"
                            : "border-slate-300"
                        }`}>
                          {isChecked && <span className="text-xs font-bold">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              item.traslado_tipo === "ida"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {item.traslado_tipo === "ida" ? "↑ LLEVAR" : "↓ RETIRAR"}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">{article || "Articulo"}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {action} <span className="font-semibold text-slate-700">{destination}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                }

                // Ad-hoc item
                return (
                  <div
                    key={item.item_id}
                    onClick={() => toggleCheck(item.item_id)}
                    className={`bg-white rounded-xl border p-4 cursor-pointer transition-all active:scale-[0.98] ${
                      isChecked
                        ? "border-green-300 bg-green-50/50 opacity-60"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        isChecked
                          ? "bg-green-500 border-green-500 text-white"
                          : "border-slate-300"
                      }`}>
                        {isChecked && <span className="text-xs font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 mb-1 inline-block">
                          TAREA
                        </span>
                        <p className="text-sm text-slate-900 mt-1">{item.descripcion}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev`
Navigate to `/cadete` (while logged in as a cadete user). Expected: the page renders with the "No tenes tareas asignadas" empty state.

- [ ] **Step 3: Commit**

```bash
git add app/cadete/page.js
git commit -m "feat: add cadete restricted view page"
```

---

### Task 7: Resumen management panel — dashboard component

**Files:**
- Create: `components/ResumenCadetePanel.js`
- Modify: `app/page.js`

- [ ] **Step 1: Create the ResumenCadetePanel component**

```jsx
// components/ResumenCadetePanel.js
"use client"

import { useState, useEffect } from "react"

export function ResumenCadetePanel({ onClose }) {
  const [resumenes, setResumenes] = useState([])
  const [cadetes, setCadetes] = useState([])
  const [traslados, setTraslados] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedResumen, setSelectedResumen] = useState(null)
  const [items, setItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [newCadeteId, setNewCadeteId] = useState("")
  const [newNombre, setNewNombre] = useState("")

  // Ad-hoc form
  const [adHocText, setAdHocText] = useState("")

  // Error/success
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [resRes, cadRes] = await Promise.all([
        fetch("/api/resumenes-cadete"),
        fetch("/api/admin/usuarios"),
      ])

      const { resumenes: resData } = await resRes.json()
      const { users } = await cadRes.json()

      setResumenes(resData || [])
      setCadetes((users || []).filter((u) => u.role === "cadete"))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadItems(resumenId) {
    setLoadingItems(true)
    try {
      const res = await fetch(`/api/resumenes-cadete/${resumenId}/items`)
      const { items: data } = await res.json()
      setItems(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingItems(false)
    }
  }

  async function loadTraslados() {
    try {
      const res = await fetch("/api/traslados")
      const data = await res.json()
      setTraslados(Array.isArray(data) ? data : data.traslados || [])
    } catch {
      setTraslados([])
    }
  }

  async function handleSelectResumen(resumen) {
    setSelectedResumen(resumen)
    setError(null)
    await Promise.all([loadItems(resumen.id), loadTraslados()])
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch("/api/resumenes-cadete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadete_id: newCadeteId, nombre: newNombre || undefined }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setShowCreate(false)
      setNewCadeteId("")
      setNewNombre("")
      await loadData()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleToggleActivo(resumen) {
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${resumen.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !resumen.activo }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await loadData()
      if (selectedResumen?.id === resumen.id) {
        setSelectedResumen({ ...resumen, activo: !resumen.activo })
      }
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDeleteResumen(resumenId) {
    if (!confirm("¿Eliminar este resumen y todos sus items?")) return
    setError(null)
    try {
      const res = await fetch("/api/resumenes-cadete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumen_id: resumenId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      if (selectedResumen?.id === resumenId) {
        setSelectedResumen(null)
        setItems([])
      }
      await loadData()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleAddTraslado(trasladoId) {
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "traslado", traslado_id: trasladoId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await loadItems(selectedResumen.id)
      await loadData()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleAddAdHoc(e) {
    e.preventDefault()
    if (!adHocText.trim()) return
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "ad_hoc", descripcion: adHocText.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setAdHocText("")
      await loadItems(selectedResumen.id)
      await loadData()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDeleteItem(itemId) {
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await loadItems(selectedResumen.id)
      await loadData()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleMoveItem(index, direction) {
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= items.length) return
    const itemA = items[index]
    const itemB = items[swapIndex]
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id_a: itemA.item_id,
          orden_a: itemB.orden,
          item_id_b: itemB.item_id,
          orden_b: itemA.orden,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await loadItems(selectedResumen.id)
    } catch (e) {
      setError(e.message)
    }
  }

  // Items already added (to filter traslado selector)
  const addedTrasladoIds = new Set(items.filter((i) => i.tipo === "traslado").map((i) => i.traslado_id))
  const availableTraslados = traslados.filter((t) => !addedTrasladoIds.has(t.id))

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Resumenes de Cadete</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12 text-slate-400">Cargando...</div>
          ) : selectedResumen ? (
            /* Item management view */
            <div>
              <button
                onClick={() => { setSelectedResumen(null); setItems([]) }}
                className="text-sm text-indigo-600 hover:text-indigo-800 mb-4 flex items-center gap-1"
              >
                ← Volver a resumenes
              </button>

              <h3 className="text-sm font-bold text-slate-700 mb-1">
                {selectedResumen.nombre || "Sin nombre"} — {selectedResumen.cadete_username}
              </h3>

              {/* Items list */}
              {loadingItems ? (
                <div className="text-center py-8 text-slate-400 text-sm">Cargando items...</div>
              ) : (
                <div className="space-y-2 mb-6">
                  {items.length === 0 && (
                    <p className="text-sm text-slate-400 py-4 text-center">Sin items. Agrega traslados o tareas.</p>
                  )}
                  {items.map((item, idx) => (
                    <div key={item.item_id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-3 border border-slate-200">
                      {/* Reorder buttons */}
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => handleMoveItem(idx, -1)}
                          disabled={idx === 0}
                          className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-20"
                        >▲</button>
                        <button
                          onClick={() => handleMoveItem(idx, 1)}
                          disabled={idx === items.length - 1}
                          className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-20"
                        >▼</button>
                      </div>

                      <div className="flex-1 min-w-0">
                        {item.tipo === "traslado" ? (
                          <div>
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                              item.traslado_tipo === "ida"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {item.traslado_tipo === "ida" ? "LLEVAR" : "RETIRAR"}
                            </span>
                            <span className="text-sm text-slate-700 ml-2">
                              {[item.tipo_articulo, item.marca, item.modelo].filter(Boolean).join(" — ")}
                            </span>
                            <span className="text-xs text-slate-500 ml-2">
                              {item.sucursal_origen_nombre} → {item.sucursal_destino_nombre}
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">TAREA</span>
                            <span className="text-sm text-slate-700 ml-2">{item.descripcion}</span>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleDeleteItem(item.item_id)}
                        className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
                      >Eliminar</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add traslado */}
              {availableTraslados.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Agregar traslado</h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {availableTraslados.map((t) => (
                      <div key={t.id} className="flex items-center justify-between bg-white rounded-lg p-2 border border-slate-200 text-sm">
                        <div>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            t.tipo === "ida" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                          }`}>
                            {t.tipo === "ida" ? "IDA" : "RETORNO"}
                          </span>
                          <span className="ml-2 text-slate-700">
                            #{String(t.ordenes?.numero_orden).padStart(4, "0")} — {t.ordenes?.tipo_articulo} {t.ordenes?.marca || ""}
                          </span>
                          <span className="text-xs text-slate-400 ml-2">
                            {t.sucursal_origen_rel?.nombre} → {t.sucursal_destino_rel?.nombre}
                          </span>
                        </div>
                        <button
                          onClick={() => handleAddTraslado(t.id)}
                          className="px-2 py-1 text-xs bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
                        >+ Agregar</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add ad-hoc */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Agregar tarea</h4>
                <form onSubmit={handleAddAdHoc} className="flex gap-2">
                  <input
                    type="text"
                    value={adHocText}
                    onChange={(e) => setAdHocText(e.target.value)}
                    placeholder='Ej: "Retirar repuesto en Taller Lopez, Av. Italia 1234"'
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  />
                  <button
                    type="submit"
                    disabled={!adHocText.trim()}
                    className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 disabled:opacity-40"
                  >Agregar</button>
                </form>
              </div>
            </div>
          ) : (
            /* Resumenes list view */
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-500">
                  {resumenes.length} {resumenes.length === 1 ? "resumen" : "resumenes"}
                </p>
                <button
                  onClick={() => { setShowCreate(true); setError(null) }}
                  className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600"
                >+ Nuevo resumen</button>
              </div>

              {/* Create form */}
              {showCreate && (
                <form onSubmit={handleCreate} className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Cadete</label>
                      <select
                        required
                        value={newCadeteId}
                        onChange={(e) => setNewCadeteId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      >
                        <option value="">Seleccionar cadete...</option>
                        {cadetes.map((c) => (
                          <option key={c.id} value={c.id}>{c.username}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Nombre (opcional)</label>
                      <input
                        type="text"
                        value={newNombre}
                        onChange={(e) => setNewNombre(e.target.value)}
                        placeholder="Ej: Ronda lunes tarde"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button type="submit" disabled={!newCadeteId} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 disabled:opacity-40">Crear</button>
                    <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancelar</button>
                  </div>
                </form>
              )}

              {/* Resumenes table */}
              {resumenes.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  No hay resumenes creados. Crea uno para asignar tareas a un cadete.
                </div>
              ) : (
                <div className="space-y-2">
                  {resumenes.map((r) => (
                    <div
                      key={r.id}
                      className={`bg-white rounded-xl border p-4 transition-colors ${
                        r.activo ? "border-slate-200" : "border-slate-100 opacity-50"
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => handleSelectResumen(r)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">{r.nombre || "Sin nombre"}</span>
                            {!r.activo && (
                              <span className="text-xs px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded">Inactivo</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Cadete: <span className="font-medium">{r.cadete_username}</span> — {r.item_count} items
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSelectResumen(r)}
                            className="px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium"
                          >Editar</button>
                          <button
                            onClick={() => handleToggleActivo(r)}
                            className="px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                          >{r.activo ? "Desactivar" : "Activar"}</button>
                          <button
                            onClick={() => handleDeleteResumen(r.id)}
                            className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 font-medium"
                          >Eliminar</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the button and panel to the dashboard**

In `app/page.js`, add the import at the top (after the existing imports, around line 12):

```js
import { ResumenCadetePanel } from "@/components/ResumenCadetePanel"
```

Add state for the panel (after `const [trasladosRefresh, setTrasladosRefresh] = useState(0)` on line 40):

```js
const [showResumenCadete, setShowResumenCadete] = useState(false)
```

Add the button in the header, before the Admin link (after the `+ Nuevo Ingreso` button, around line 144). Insert between the `+ Nuevo Ingreso` button's closing tag and the `{isDueno && (` block:

```jsx
            <button
              onClick={() => setShowResumenCadete(true)}
              className="px-4 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5"
            >
              🚚 Cadete
            </button>
```

Add the modal render at the bottom, after the `DetalleOrdenModal` closing block (before the final `</div>`):

```jsx
      {showResumenCadete && (
        <ResumenCadetePanel onClose={() => setShowResumenCadete(false)} />
      )}
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`
- Log in as admin or employee
- Click the "Cadete" button in the header
- The management panel should open
- Create a resumen, add items, verify it works

- [ ] **Step 4: Commit**

```bash
git add components/ResumenCadetePanel.js app/page.js
git commit -m "feat: add cadete resumen management panel in dashboard"
```

---

### Task 8: End-to-end testing in browser

- [ ] **Step 1: Create a cadete user via admin panel**

1. Log in as admin
2. Go to Admin > Usuarios
3. Create user with role "cadete" and assign a sucursal
4. Verify user appears in the list with role "Cadete"

- [ ] **Step 2: Create and populate a resumen**

1. From the dashboard, click "Cadete" button
2. Create a new resumen, select the cadete, give it a name
3. Click "Editar" on the resumen
4. Add a traslado (if any available) and an ad-hoc task
5. Verify items show with correct data
6. Test reorder (arrows), delete item
7. Test activate/deactivate and delete resumen

- [ ] **Step 3: Test cadete login and view**

1. Log out
2. Log in as the cadete user
3. Verify redirect to `/cadete`
4. Verify the resumen and items appear
5. Tap items to check/uncheck — verify localStorage persistence
6. Try navigating to `/` or `/admin` — verify redirect back to `/cadete`

- [ ] **Step 4: Test responsive layouts**

1. Test on mobile viewport (375px width)
2. Test on iPad viewport (768px width)
3. Test on desktop (1280px width)
4. Verify touch targets are at least 44px on mobile/iPad
