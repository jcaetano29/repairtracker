# Auth Migration: Supabase Auth → Auth.js (NextAuth v5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase Auth with Auth.js (NextAuth v5) using a custom `usuarios` table with username/password, and rewrite the admin ABM to create/delete users directly.

**Architecture:** Auth.js Credentials provider queries a `public.usuarios` table (PostgreSQL via existing Supabase client) and compares bcrypt-hashed passwords. JWT sessions store `id`, `username`, and `role`. Supabase continues to host the database — only the auth layer changes.

**Tech Stack:** Next.js 14 App Router, next-auth@beta (v5), bcryptjs, Supabase (DB only), Tailwind CSS

---

## File Map

**Create:**
- `auth.js` — NextAuth v5 config: Credentials provider, JWT/session callbacks
- `app/api/auth/[...nextauth]/route.js` — NextAuth route handler (replaces callback route)
- `supabase/003_usuarios.sql` — usuarios table migration

**Modify:**
- `middleware.js` — swap Supabase middleware for Auth.js middleware
- `app/layout.js` — wrap children with SessionProvider
- `app/login/page.js` — change email→username, use Auth.js signIn
- `app/page.js` — use useSession for isDueno check, Auth.js signOut
- `app/api/notify/route.js` — use auth() instead of Supabase auth
- `app/api/admin/usuarios/route.js` — full rewrite: CRUD on public.usuarios + bcrypt
- `app/admin/usuarios/page.js` — full rewrite: username+password form, no invite flow

**Delete:**
- `app/api/auth/callback/route.js` — Supabase OAuth callback, no longer needed
- `lib/supabase-server.js` — only used for Supabase Auth, no longer needed
- `lib/supabase.js` — client-side Supabase auth client, no longer needed

---

## Task 1: Install dependencies and create SQL migration

**Files:**
- Modify: `package.json`
- Create: `supabase/003_usuarios.sql`

- [ ] **Step 1: Install Auth.js and bcryptjs**

```bash
cd /Users/joaquincaetano/gitrepo
npm install next-auth@beta bcryptjs
npm uninstall @supabase/ssr
```

Expected: packages installed, `@supabase/ssr` removed from node_modules and package.json.

- [ ] **Step 2: Generate AUTH_SECRET and add to .env.local**

```bash
openssl rand -base64 32
```

Copy the output. Then open `.env.local` and add:
```
AUTH_SECRET=<paste output here>
```

- [ ] **Step 3: Create the usuarios table migration**

Create `supabase/003_usuarios.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'empleado' CHECK (role IN ('empleado', 'dueno')),
  created_at timestamptz DEFAULT now()
);
```

- [ ] **Step 4: Run migration in Supabase SQL Editor**

Open Supabase dashboard → SQL Editor → paste and run the SQL above.

Expected: table `usuarios` created with no errors.

- [ ] **Step 5: Insert initial dueno user**

First generate a bcrypt hash for the initial password (run after `npm install` completes):

```bash
node -e "const b = require('bcryptjs'); b.hash('admin123', 10).then(h => console.log(h))"
```

Copy the output hash. Then in Supabase SQL Editor run:

```sql
INSERT INTO public.usuarios (username, password_hash, role)
VALUES ('admin', '<paste hash here>', 'dueno');
```

Expected: 1 row inserted. Login will work with username `admin` / password `admin123`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json supabase/003_usuarios.sql
git commit -m "chore: install next-auth v5, bcryptjs; add usuarios table migration"
```

---

## Task 2: Create Auth.js core config and route handler

**Files:**
- Create: `auth.js` (root of project)
- Create: `app/api/auth/[...nextauth]/route.js`

- [ ] **Step 1: Write the test**

Create `__tests__/auth.test.js`:

```js
import { describe, it, expect, vi } from "vitest"

// Mock getSupabaseAdmin
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: {
              id: "uuid-123",
              username: "admin",
              password_hash: "$2b$10$fixedhashfortest",
              role: "dueno",
            },
          })),
        })),
      })),
    })),
  })),
}))

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn((plain, hash) => Promise.resolve(plain === "correctpassword")),
  },
}))

describe("Auth.js Credentials authorize", () => {
  it("returns null for missing credentials", async () => {
    const { authorizeUser } = await import("../auth.js")
    const result = await authorizeUser({ username: "", password: "" })
    expect(result).toBeNull()
  })

  it("returns user object for valid credentials", async () => {
    const { authorizeUser } = await import("../auth.js")
    const result = await authorizeUser({ username: "admin", password: "correctpassword" })
    expect(result).toEqual({ id: "uuid-123", name: "admin", role: "dueno" })
  })

  it("returns null for wrong password", async () => {
    const { authorizeUser } = await import("../auth.js")
    const result = await authorizeUser({ username: "admin", password: "wrongpassword" })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- __tests__/auth.test.js
```

Expected: FAIL — `authorizeUser` not defined.

- [ ] **Step 3: Create auth.js at project root**

```js
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export async function authorizeUser(credentials) {
  if (!credentials?.username || !credentials?.password) return null

  const { data: usuario } = await getSupabaseAdmin()
    .from("usuarios")
    .select("id, username, password_hash, role")
    .eq("username", credentials.username)
    .single()

  if (!usuario) return null

  const valid = await bcrypt.compare(String(credentials.password), usuario.password_hash)
  if (!valid) return null

  return { id: usuario.id, name: usuario.username, role: usuario.role }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: authorizeUser,
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.username = user.name
        token.id = user.id
      }
      return token
    },
    session({ session, token }) {
      session.user.role = token.role
      session.user.username = token.username
      session.user.id = token.id
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- __tests__/auth.test.js
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Create the NextAuth route handler**

Create `app/api/auth/[...nextauth]/route.js`:

```js
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

- [ ] **Step 6: Commit**

```bash
git add auth.js app/api/auth/[...nextauth]/route.js __tests__/auth.test.js
git commit -m "feat: add Auth.js config with Credentials provider and bcrypt"
```

---

## Task 3: Update middleware to use Auth.js

**Files:**
- Modify: `middleware.js`

- [ ] **Step 1: Rewrite middleware.js**

```js
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Always public
  if (pathname.startsWith("/seguimiento")) return NextResponse.next()

  // Login page: redirect authenticated users to dashboard
  if (pathname.startsWith("/login")) {
    if (session) return NextResponse.redirect(new URL("/", req.url))
    return NextResponse.next()
  }

  // All other routes require auth
  if (!session) return NextResponse.redirect(new URL("/login", req.url))

  // Admin routes require dueno role
  if (pathname.startsWith("/admin") && session.user?.role !== "dueno") {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)"],
}
```

- [ ] **Step 2: Verify the app still builds**

```bash
npm run build
```

Expected: build succeeds (or exits with only unrelated warnings).

- [ ] **Step 3: Commit**

```bash
git add middleware.js
git commit -m "feat: replace Supabase middleware with Auth.js session middleware"
```

---

## Task 4: Update layout and login page

**Files:**
- Modify: `app/layout.js`
- Modify: `app/login/page.js`

- [ ] **Step 1: Add SessionProvider to app/layout.js**

```js
import "./globals.css"
import { SessionProvider } from "next-auth/react"

export const metadata = {
  title: "RepairTrack — Gestión de Reparaciones",
  description: "Sistema de gestión para relojerías y joyerías",
  manifest: "/manifest.json",
  themeColor: "#0f172a",
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Rewrite app/login/page.js**

```js
"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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
      setError("Usuario o contraseña incorrectos")
      setLoading(false)
    } else {
      router.push("/")
      router.refresh()
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
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="usuario"
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
              autoComplete="current-password"
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
  )
}
```

- [ ] **Step 3: Verify tests still pass**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/layout.js app/login/page.js
git commit -m "feat: add SessionProvider to layout, rewrite login with username/Auth.js"
```

---

## Task 5: Update dashboard (app/page.js)

**Files:**
- Modify: `app/page.js`

- [ ] **Step 1: Replace Supabase auth imports and usage**

Replace the top of `app/page.js`. The full updated file:

```js
"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { Badge } from "@/components/Badge"
import { StatCard } from "@/components/StatCard"
import { NuevoIngresoModal } from "@/components/NuevoIngresoModal"
import { DetalleOrdenModal } from "@/components/DetalleOrdenModal"
import { ESTADOS, getNivelRetraso, formatNumeroOrden } from "@/lib/constants"
import { getOrdenes, getStats, getTalleres } from "@/lib/data"

export default function DashboardPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const isDueno = session?.user?.role === "dueno"

  const [ordenes, setOrdenes] = useState([])
  const [stats, setStatsState] = useState({ activas: 0, conRetraso: 0, listasRetiro: 0, enTaller: 0 })
  const [talleres, setTalleresState] = useState([])
  const [filtroEstado, setFiltroEstado] = useState("TODOS")
  const [filtroTaller, setFiltroTaller] = useState("TODOS")
  const [busqueda, setBusqueda] = useState("")
  const [vista, setVista] = useState("tabla")
  const [showNuevo, setShowNuevo] = useState(false)
  const [selectedOrden, setSelectedOrden] = useState(null)
  const [loading, setLoading] = useState(true)

  async function handleLogout() {
    await signOut({ callbackUrl: "/login" })
  }

  const loadData = useCallback(async () => {
    try {
      const [ordenesData, statsData, talleresData] = await Promise.all([
        getOrdenes({
          estado: filtroEstado,
          taller_id: filtroTaller,
          busqueda: busqueda || undefined,
        }),
        getStats(),
        getTalleres(),
      ])
      setOrdenes(ordenesData)
      setStatsState(statsData)
      setTalleresState(talleresData)
    } catch (e) {
      console.error("Error cargando datos:", e)
    } finally {
      setLoading(false)
    }
  }, [filtroEstado, filtroTaller, busqueda])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Auto-refresh cada 30 segundos
  useEffect(() => {
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [loadData])

  // Debounce búsqueda
  const [searchTimeout, setSearchTimeout] = useState(null)
  function handleSearch(value) {
    setBusqueda(value)
    if (searchTimeout) clearTimeout(searchTimeout)
    setSearchTimeout(setTimeout(() => loadData(), 400))
  }

  const estadosActivos = Object.entries(ESTADOS).filter(([k]) => k !== "ENTREGADO")
```

Then keep the rest of the JSX identical except the header buttons section, which becomes:

```jsx
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNuevo(true)}
              className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5"
            >
              + Nuevo Ingreso
            </button>
            {isDueno && (
              <Link
                href="/admin"
                className="px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors"
              >
                Admin
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Salir
            </button>
          </div>
```

- [ ] **Step 2: Verify tests pass**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/page.js
git commit -m "feat: use Auth.js session in dashboard, remove Supabase client dependency"
```

---

## Task 6: Rewrite /api/admin/usuarios

**Files:**
- Modify: `app/api/admin/usuarios/route.js`

- [ ] **Step 1: Rewrite the route**

```js
import { auth } from "@/auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"

async function verifyDueno() {
  const session = await auth()
  return session?.user?.role === "dueno" ? session : null
}

// GET — list all usuarios
export async function GET() {
  if (!(await verifyDueno())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from("usuarios")
    .select("id, username, role, created_at")
    .order("created_at")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users: data })
}

// POST — create new usuario
export async function POST(request) {
  if (!(await verifyDueno())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { username, password, role } = body
  if (!username || !password || !role) {
    return NextResponse.json({ error: "username, password and role are required" }, { status: 400 })
  }
  if (!["empleado", "dueno"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
  }

  const password_hash = await bcrypt.hash(password, 10)

  const { error } = await getSupabaseAdmin()
    .from("usuarios")
    .insert({ username, password_hash, role })

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "El nombre de usuario ya existe" }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE — remove usuario
export async function DELETE(request) {
  const session = await verifyDueno()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { userId } = body
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  if (userId === session.user.id) {
    return NextResponse.json({ error: "No podés eliminar tu propia cuenta" }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from("usuarios")
    .delete()
    .eq("id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH — update role
export async function PATCH(request) {
  if (!(await verifyDueno())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { userId, role } = body
  if (!userId || !role) {
    return NextResponse.json({ error: "userId and role required" }, { status: 400 })
  }
  if (!["empleado", "dueno"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from("usuarios")
    .update({ role })
    .eq("id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify tests pass**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/usuarios/route.js
git commit -m "feat: rewrite usuarios API to use custom table with bcrypt, Auth.js auth"
```

---

## Task 7: Rewrite admin/usuarios/page.js

**Files:**
- Modify: `app/admin/usuarios/page.js`

- [ ] **Step 1: Rewrite the page**

```js
"use client"

import { useState, useEffect } from "react"

export default function UsuariosPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: "", password: "", role: "empleado" })
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  async function loadUsers() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/usuarios")
      const { users } = await res.json()
      setUsers(users || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(`Usuario "${form.username}" creado correctamente`)
      setShowForm(false)
      setForm({ username: "", password: "", role: "empleado" })
      await loadUsers()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleRoleChange(userId, newRole) {
    setError(null)
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await loadUsers()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDelete(userId, username) {
    if (!confirm(`¿Eliminar el usuario "${username}"?`)) return
    setError(null)
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await loadUsers()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Usuarios</h2>
          <p className="text-sm text-slate-500 mt-0.5">Gestioná el acceso al sistema</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(null); setSuccess(null) }}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 transition-colors"
        >
          + Nuevo usuario
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {success}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <h3 className="font-semibold text-slate-900 mb-4">Crear nuevo usuario</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Usuario
              </label>
              <input
                type="text"
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="nombreusuario"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Contraseña
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="mínimo 6 caracteres"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Rol
              </label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                <option value="empleado">Empleado</option>
                <option value="dueno">Dueño</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600"
            >
              Crear usuario
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600"
            >
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
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Rol
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Creado
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{u.username}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className="px-2 py-0.5 rounded-full text-xs font-semibold border-0 cursor-pointer focus:ring-2 focus:ring-indigo-500/20 bg-transparent"
                    >
                      <option value="empleado">Empleado</option>
                      <option value="dueno">Dueño</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(u.created_at).toLocaleDateString("es-UY")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(u.id, u.username)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">
                    No hay usuarios creados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify tests pass**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/admin/usuarios/page.js
git commit -m "feat: rewrite usuarios admin page with username/password ABM"
```

---

## Task 8: Update /api/notify auth check

**Files:**
- Modify: `app/api/notify/route.js`

- [ ] **Step 1: Rewrite the route**

```js
import { auth } from "@/auth"
import { sendNotification } from "@/lib/notifications"
import { NextResponse } from "next/server"

export async function POST(request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { type, data } = body
    await sendNotification(type, data)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[/api/notify]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify tests pass**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/notify/route.js
git commit -m "feat: update /api/notify to use Auth.js session check"
```

---

## Task 9: Delete dead files and verify build

**Files:**
- Delete: `app/api/auth/callback/route.js`
- Delete: `lib/supabase-server.js`
- Delete: `lib/supabase.js`

- [ ] **Step 1: Delete unused files**

```bash
rm app/api/auth/callback/route.js
rm lib/supabase-server.js
rm lib/supabase.js
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Build to verify no import errors**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 4: Add AUTH_SECRET to Vercel**

In Vercel dashboard → Project → Settings → Environment Variables, add:
- `AUTH_SECRET` — the value generated in Task 1 Step 2

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "chore: remove Supabase Auth files, complete migration to Auth.js"
git push
```

Expected: Vercel auto-deploys and build succeeds.
