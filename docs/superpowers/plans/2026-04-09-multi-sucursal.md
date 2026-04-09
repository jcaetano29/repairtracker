# Multi-Sucursal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar soporte de dos sucursales (Punta Carretas y Nuevo Centro) separando órdenes por sucursal, con empleados que solo ven su sucursal y dueños que ven todo.

**Architecture:** La seguridad se implementa a nivel de aplicación (no RLS real de Supabase) porque el app usa NextAuth con bcrypt + tabla `usuarios` propia, no Supabase Auth — el cliente anon no puede enviar el JWT de NextAuth a Supabase. El `sucursal_id` se almacena en el JWT de NextAuth y se pasa como filtro a todas las queries de datos.

**Tech Stack:** Next.js 14, Supabase (anon client + admin client), NextAuth JWT, Vitest, Tailwind CSS

---

## File Map

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `supabase/008_sucursales.sql` | Crear | Migración: tabla sucursales, FK en ordenes/usuarios, view update, datos de prueba |
| `auth.js` | Modificar | Incluir `sucursal_id` en JWT y session de NextAuth |
| `lib/data.js` | Modificar | `getSucursales()`, `crearOrden` con `sucursal_id`, `getOrdenes` con filtro, `getReportesStats` con filtro |
| `app/api/admin/sucursales/route.js` | Crear | API REST para CRUD de sucursales (solo dueño) |
| `app/admin/sucursales/page.js` | Crear | UI admin para gestión de sucursales |
| `app/admin/layout.js` | Modificar | Agregar tab "Sucursales" al nav |
| `app/api/admin/usuarios/route.js` | Modificar | POST/PATCH aceptan `sucursal_id` |
| `app/admin/usuarios/page.js` | Modificar | Dropdown sucursal cuando rol=empleado, columna sucursal en tabla |
| `app/page.js` | Modificar | Filtro de sucursal para dueño; empleado filtra automáticamente |
| `components/NuevoIngresoModal.js` | Modificar | Pasar `sucursal_id` de session a `crearOrden` |
| `app/admin/reportes/page.js` | Modificar | Selector de sucursal, pasar a `getReportesStats` |
| `__tests__/auth.test.js` | Modificar | Actualizar test de `authorizeUser` para incluir `sucursal_id` |

---

### Task 1: Migración de base de datos

**Files:**
- Create: `supabase/008_sucursales.sql`

- [ ] **Step 1: Escribir la migración completa**

Crear el archivo `supabase/008_sucursales.sql` con el siguiente contenido:

```sql
-- supabase/008_sucursales.sql
-- Multi-sucursal: Punta Carretas y Nuevo Centro

BEGIN;

-- ============================================================
-- TABLA: sucursales
-- ============================================================
CREATE TABLE sucursales (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre     TEXT NOT NULL,
  activo     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON sucursales
  FOR ALL USING (auth.role() = 'authenticated' OR true);

-- Datos iniciales
INSERT INTO sucursales (nombre) VALUES
  ('Punta Carretas'),
  ('Nuevo Centro');

-- ============================================================
-- ALTER: ordenes y usuarios
-- ============================================================

-- Agregar sucursal_id a ordenes (nullable primero para poder rellenar)
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES sucursales(id);

-- Agregar sucursal_id a usuarios (nullable: NULL = dueño, UUID = empleado)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES sucursales(id);

-- Índice en ordenes
CREATE INDEX IF NOT EXISTS idx_ordenes_sucursal ON ordenes(sucursal_id);

-- ============================================================
-- DISTRIBUCIÓN de órdenes existentes entre sucursales
-- ============================================================
-- Pares → Punta Carretas, Impares → Nuevo Centro
UPDATE ordenes
SET sucursal_id = (SELECT id FROM sucursales WHERE nombre = 'Punta Carretas')
WHERE numero_orden % 2 = 0;

UPDATE ordenes
SET sucursal_id = (SELECT id FROM sucursales WHERE nombre = 'Nuevo Centro')
WHERE numero_orden % 2 = 1;

-- ============================================================
-- INSERTAR órdenes de prueba adicionales
-- ============================================================
-- Necesitamos al menos un cliente para las órdenes de prueba
-- Usamos el primer cliente existente o creamos uno de prueba

DO $$
DECLARE
  v_pc UUID;
  v_nc UUID;
  v_cliente UUID;
  v_taller UUID;
  v_ts UUID;
BEGIN
  SELECT id INTO v_pc FROM sucursales WHERE nombre = 'Punta Carretas';
  SELECT id INTO v_nc FROM sucursales WHERE nombre = 'Nuevo Centro';
  SELECT id INTO v_cliente FROM clientes LIMIT 1;
  SELECT id INTO v_taller FROM talleres LIMIT 1;
  SELECT id INTO v_ts FROM tipos_servicio WHERE nombre = 'Service completo' LIMIT 1;

  -- Si no hay clientes, crear uno de prueba
  IF v_cliente IS NULL THEN
    INSERT INTO clientes (nombre, telefono, email)
    VALUES ('Cliente Demo', '099000001', 'demo@test.com')
    RETURNING id INTO v_cliente;
  END IF;

  -- Punta Carretas — estados variados
  INSERT INTO ordenes (cliente_id, sucursal_id, tipo_articulo, marca, modelo, problema_reportado, estado, fecha_ingreso)
  VALUES
    (v_cliente, v_pc, 'Reloj', 'Rolex', 'Submariner', 'No anda el segundero', 'INGRESADO', NOW() - INTERVAL '1 day'),
    (v_cliente, v_pc, 'Reloj', 'Omega', 'Seamaster', 'Se paró', 'ESPERANDO_PRESUPUESTO', NOW() - INTERVAL '3 days'),
    (v_cliente, v_pc, 'Reloj', 'Seiko', 'Presage', 'Vidrio roto', 'ENVIADO_A_TALLER', NOW() - INTERVAL '7 days'),
    (v_cliente, v_pc, 'Joya', NULL, NULL, 'Cierre roto', 'PRESUPUESTO_RECIBIDO', NOW() - INTERVAL '5 days'),
    (v_cliente, v_pc, 'Reloj', 'Casio', 'G-Shock', 'Sin pila', 'ESPERANDO_APROBACION', NOW() - INTERVAL '4 days'),
    (v_cliente, v_pc, 'Reloj', 'Longines', 'Master', 'No da la hora bien', 'EN_REPARACION', NOW() - INTERVAL '10 days'),
    (v_cliente, v_pc, 'Reloj', 'TAG Heuer', 'Carrera', 'Rotura interna', 'LISTO_PARA_RETIRO', NOW() - INTERVAL '15 days'),
    (v_cliente, v_pc, 'Reloj', 'Tissot', 'PRX', 'Service preventivo', 'ENTREGADO', NOW() - INTERVAL '20 days'),
    (v_cliente, v_pc, 'Reloj', 'Breitling', 'Navitimer', 'Presupuesto muy alto', 'RECHAZADO', NOW() - INTERVAL '8 days'),
    (v_cliente, v_pc, 'Joya', NULL, NULL, 'Ajuste de talle', 'INGRESADO', NOW() - INTERVAL '2 days');

  -- Nuevo Centro — estados variados
  INSERT INTO ordenes (cliente_id, sucursal_id, tipo_articulo, marca, modelo, problema_reportado, estado, fecha_ingreso)
  VALUES
    (v_cliente, v_nc, 'Reloj', 'IWC', 'Pilot', 'Cristal rayado', 'INGRESADO', NOW() - INTERVAL '1 day'),
    (v_cliente, v_nc, 'Reloj', 'Zenith', 'El Primero', 'No da cuerda automática', 'ESPERANDO_PRESUPUESTO', NOW() - INTERVAL '2 days'),
    (v_cliente, v_nc, 'Joya', NULL, NULL, 'Limpieza profunda', 'ENVIADO_A_TALLER', NOW() - INTERVAL '6 days'),
    (v_cliente, v_nc, 'Reloj', 'Patek', 'Calatrava', 'Service completo', 'EN_REPARACION', NOW() - INTERVAL '12 days'),
    (v_cliente, v_nc, 'Reloj', 'Vacheron', 'Overseas', 'Ajuste de correa', 'LISTO_PARA_RETIRO', NOW() - INTERVAL '9 days'),
    (v_cliente, v_nc, 'Reloj', 'Audemars', 'Royal Oak', 'Pila agotada', 'ENTREGADO', NOW() - INTERVAL '18 days'),
    (v_cliente, v_nc, 'Reloj', 'Cartier', 'Tank', 'Manecillas flojas', 'ESPERANDO_APROBACION', NOW() - INTERVAL '3 days'),
    (v_cliente, v_nc, 'Joya', NULL, NULL, 'Reparación cierre', 'PRESUPUESTO_RECIBIDO', NOW() - INTERVAL '4 days'),
    (v_cliente, v_nc, 'Reloj', 'Panerai', 'Luminor', 'No enciende luminiscencia', 'RECHAZADO', NOW() - INTERVAL '10 days'),
    (v_cliente, v_nc, 'Reloj', 'Hublot', 'Big Bang', 'Revisión completa', 'INGRESADO', NOW() - INTERVAL '1 day');

END $$;

-- ============================================================
-- Aplicar NOT NULL en ordenes.sucursal_id (todos los registros ya tienen valor)
-- ============================================================
ALTER TABLE ordenes ALTER COLUMN sucursal_id SET NOT NULL;

-- ============================================================
-- ACTUALIZAR VIEW: v_ordenes_dashboard — agregar sucursal
-- ============================================================
CREATE OR REPLACE VIEW v_ordenes_dashboard AS
SELECT
  o.id,
  o.numero_orden,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
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
  EXTRACT(DAY FROM NOW() - o.fecha_ingreso)::INT AS dias_totales,
  CASE
    WHEN o.estado IN ('INGRESADO', 'ESPERANDO_PRESUPUESTO')
         AND NOW() - o.updated_at > INTERVAL '6 days' THEN 'grave'
    WHEN o.estado IN ('INGRESADO', 'ESPERANDO_PRESUPUESTO')
         AND NOW() - o.updated_at > INTERVAL '3 days' THEN 'leve'
    WHEN o.estado = 'ENVIADO_A_TALLER'
         AND NOW() - o.updated_at > INTERVAL '10 days' THEN 'grave'
    WHEN o.estado = 'ENVIADO_A_TALLER'
         AND NOW() - o.updated_at > INTERVAL '5 days' THEN 'leve'
    WHEN o.estado = 'ESPERANDO_APROBACION'
         AND NOW() - o.updated_at > INTERVAL '4 days' THEN 'grave'
    WHEN o.estado = 'ESPERANDO_APROBACION'
         AND NOW() - o.updated_at > INTERVAL '2 days' THEN 'leve'
    WHEN o.estado = 'EN_REPARACION'
         AND NOW() - o.updated_at > INTERVAL '30 days' THEN 'grave'
    WHEN o.estado = 'EN_REPARACION'
         AND NOW() - o.updated_at > INTERVAL '15 days' THEN 'leve'
    WHEN o.estado = 'LISTO_PARA_RETIRO'
         AND NOW() - o.updated_at > INTERVAL '10 days' THEN 'grave'
    WHEN o.estado = 'LISTO_PARA_RETIRO'
         AND NOW() - o.updated_at > INTERVAL '5 days' THEN 'leve'
    ELSE 'none'
  END AS nivel_retraso
FROM ordenes o
LEFT JOIN clientes c ON o.cliente_id = c.id
LEFT JOIN talleres t ON o.taller_id = t.id
LEFT JOIN sucursales s ON o.sucursal_id = s.id;

COMMIT;
```

- [ ] **Step 2: Ejecutar la migración en Supabase**

Ir a Supabase Dashboard → SQL Editor → pegar y ejecutar el contenido de `supabase/008_sucursales.sql`.

Verificar que no haya errores. Verificar que existan filas en `sucursales`:
```sql
SELECT * FROM sucursales;
-- Debe mostrar: Punta Carretas, Nuevo Centro
SELECT COUNT(*) FROM ordenes WHERE sucursal_id IS NOT NULL;
-- Debe ser 0 diferencia con COUNT(*) FROM ordenes
```

- [ ] **Step 3: Commit**

```bash
git add supabase/008_sucursales.sql
git commit -m "chore: add 008_sucursales migration with test data"
```

---

### Task 2: Agregar sucursal_id al JWT y session de NextAuth

**Files:**
- Modify: `auth.js`
- Modify: `__tests__/auth.test.js`

- [ ] **Step 1: Escribir test que falla**

En `__tests__/auth.test.js`, agregar al final del `describe("authorizeUser")`:

```javascript
it("includes sucursal_id in returned user for valid credentials", async () => {
  const { getSupabaseAdmin } = await import("@/lib/supabase-admin")
  const bcrypt = await import("bcryptjs")
  getSupabaseAdmin.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: {
              id: "uuid-1",
              username: "emp1",
              password_hash: "$2b$10$hash",
              role: "empleado",
              sucursal_id: "suc-uuid-1",
            },
          }),
        }),
      }),
    }),
  })
  bcrypt.default.compare.mockResolvedValue(true)
  const { authorizeUser } = await import("../auth.js")
  const result = await authorizeUser({ username: "emp1", password: "pass123" })
  expect(result).toEqual({
    id: "uuid-1",
    name: "emp1",
    role: "empleado",
    sucursal_id: "suc-uuid-1",
  })
})

it("returns null sucursal_id for dueno", async () => {
  const { getSupabaseAdmin } = await import("@/lib/supabase-admin")
  const bcrypt = await import("bcryptjs")
  getSupabaseAdmin.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: {
              id: "uuid-2",
              username: "dueno1",
              password_hash: "$2b$10$hash",
              role: "dueno",
              sucursal_id: null,
            },
          }),
        }),
      }),
    }),
  })
  bcrypt.default.compare.mockResolvedValue(true)
  const { authorizeUser } = await import("../auth.js")
  const result = await authorizeUser({ username: "dueno1", password: "pass123" })
  expect(result).toEqual({
    id: "uuid-2",
    name: "dueno1",
    role: "dueno",
    sucursal_id: null,
  })
})
```

- [ ] **Step 2: Ejecutar tests y verificar que fallan**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "sucursal_id"
```

Esperado: 2 tests FAIL (sucursal_id no existe en el retorno de authorizeUser aún)

- [ ] **Step 3: Modificar auth.js**

En `auth.js`, cambiar dos cosas:

**1. `authorizeUser`** — agregar `sucursal_id` al SELECT y al return:

```javascript
export async function authorizeUser(credentials) {
  if (!credentials?.username || !credentials?.password) return null

  const { data: usuario, error } = await getSupabaseAdmin()
    .from("usuarios")
    .select("id, username, password_hash, role, sucursal_id")
    .eq("username", credentials.username)
    .single()

  if (error && error.code !== "PGRST116") throw new Error(error.message)

  if (!usuario) {
    await bcrypt.compare(String(credentials.password), "$2b$10$dummyhashfortimingprotect")
    return null
  }

  const valid = await bcrypt.compare(String(credentials.password), usuario.password_hash)
  if (!valid) return null

  return {
    id: usuario.id,
    name: usuario.username,
    role: usuario.role,
    sucursal_id: usuario.sucursal_id ?? null,
  }
}
```

**2. JWT y session callbacks** — agregar `sucursal_id`:

```javascript
callbacks: {
  jwt({ token, user }) {
    if (user) {
      token.role = user.role
      token.username = user.name
      token.id = user.id
      token.sucursal_id = user.sucursal_id ?? null
    }
    return token
  },
  session({ session, token }) {
    session.user.role = token.role
    session.user.username = token.username
    session.user.id = token.id
    session.user.sucursal_id = token.sucursal_id ?? null
    return session
  },
},
```

- [ ] **Step 4: Ejecutar tests y verificar que pasan**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "✓|✗|PASS|FAIL"
```

Esperado: todos los tests pasan.

- [ ] **Step 5: Commit**

```bash
git add auth.js __tests__/auth.test.js
git commit -m "feat: add sucursal_id to NextAuth JWT and session"
```

---

### Task 3: API y funciones de datos para sucursales

**Files:**
- Modify: `lib/data.js`
- Create: `app/api/admin/sucursales/route.js`

- [ ] **Step 1: Agregar `getSucursales` en lib/data.js**

Al final de `lib/data.js`, agregar:

```javascript
// ─── Sucursales ─────────────────────────────────────────────────────────────

export async function getSucursales() {
  const { data, error } = await getSupabaseClient()
    .from("sucursales")
    .select("id, nombre, activo, created_at")
    .order("nombre")
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Modificar `crearOrden` en lib/data.js para aceptar sucursal_id**

Cambiar la firma y el insert de `crearOrden`:

```javascript
export async function crearOrden({ cliente_id, tipo_articulo, marca, modelo, problema_reportado, notas_internas, monto_presupuesto, nombre_articulo, tipo_servicio_id, sucursal_id }) {
  const { data: orden, error } = await getSupabaseClient()
    .from("ordenes")
    .insert({
      cliente_id,
      tipo_articulo,
      marca,
      modelo,
      problema_reportado,
      notas_internas,
      monto_presupuesto: monto_presupuesto || null,
      nombre_articulo: nombre_articulo || null,
      tipo_servicio_id: tipo_servicio_id || null,
      sucursal_id,
    })
    .select("*, clientes(nombre, email)")
    .single()

  if (error) throw error
  // ... resto sin cambios (notificaciones)
```

- [ ] **Step 3: Modificar `getOrdenes` en lib/data.js para filtrar por sucursal**

Agregar parámetro `sucursal_id` a `getOrdenes`:

```javascript
export async function getOrdenes({ estado, taller_id, busqueda, incluirEntregados = false, sucursal_id }) {
  let query = getSupabaseClient()
    .from("v_ordenes_dashboard")
    .select("*")
    .order("fecha_ingreso", { ascending: false });

  if (!incluirEntregados && estado !== "ENTREGADO") {
    query = query.neq("estado", "ENTREGADO");
  }
  if (estado !== "RECHAZADO") {
    query = query.neq("estado", "RECHAZADO");
  }
  if (estado && estado !== "TODOS") {
    query = query.eq("estado", estado);
  }
  if (taller_id && taller_id !== "TODOS") {
    if (taller_id === "LOCAL") {
      query = query.is("taller_id", null);
    } else {
      query = query.eq("taller_id", taller_id);
    }
  }
  if (sucursal_id && sucursal_id !== "TODAS") {
    query = query.eq("sucursal_id", sucursal_id);
  }
  if (busqueda) {
    query = query.or(
      `cliente_nombre.ilike.%${busqueda}%,marca.ilike.%${busqueda}%,cliente_telefono.ilike.%${busqueda}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Modificar `getReportesStats` en lib/data.js para filtrar por sucursal**

Agregar parámetro `sucursal_id` (null = todas):

```javascript
export async function getReportesStats({ sucursal_id = null } = {}) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const supabase = getSupabaseClient();

  let ordenesQuery = supabase
    .from("ordenes")
    .select("id, estado, fecha_ingreso, fecha_entrega, fecha_listo, monto_presupuesto, cliente_id, tipo_articulo, updated_at, presupuesto_aprobado, sucursal_id");

  if (sucursal_id) {
    ordenesQuery = ordenesQuery.eq("sucursal_id", sucursal_id);
  }

  const { data: todasLasOrdenes, error } = await ordenesQuery;
  if (error) throw error;

  // ... resto de la función sin cambios
```

- [ ] **Step 5: Crear app/api/admin/sucursales/route.js**

```javascript
import { auth } from "@/auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

async function verifyDueno() {
  const session = await auth()
  return session?.user?.role === "dueno" ? session : null
}

// GET — list all sucursales
export async function GET() {
  if (!(await verifyDueno())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from("sucursales")
    .select("id, nombre, activo, created_at")
    .order("nombre")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sucursales: data })
}

// POST — create sucursal
export async function POST(request) {
  if (!(await verifyDueno())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { nombre } = body
  if (!nombre?.trim()) {
    return NextResponse.json({ error: "nombre es requerido" }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from("sucursales")
    .insert({ nombre: nombre.trim() })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH — update nombre or activo
export async function PATCH(request) {
  if (!(await verifyDueno())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { sucursalId, nombre, activo } = body
  if (!sucursalId) {
    return NextResponse.json({ error: "sucursalId es requerido" }, { status: 400 })
  }

  const updates = {}
  if (nombre !== undefined) updates.nombre = nombre.trim()
  if (activo !== undefined) updates.activo = activo

  const { error } = await getSupabaseAdmin()
    .from("sucursales")
    .update(updates)
    .eq("id", sucursalId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/data.js app/api/admin/sucursales/route.js
git commit -m "feat: add getSucursales, sucursal_id filter in data functions, and sucursales API"
```

---

### Task 4: Página admin de sucursales + nav tab

**Files:**
- Create: `app/admin/sucursales/page.js`
- Modify: `app/admin/layout.js`

- [ ] **Step 1: Crear app/admin/sucursales/page.js**

```javascript
"use client"

import { useState, useEffect } from "react"

export default function SucursalesPage() {
  const [sucursales, setSucursales] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [nombre, setNombre] = useState("")
  const [editando, setEditando] = useState(null) // { id, nombre }
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/sucursales")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { sucursales } = await res.json()
      setSucursales(sucursales || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch("/api/admin/sucursales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(`Sucursal "${nombre}" creada`)
      setNombre("")
      setShowForm(false)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleToggleActivo(s) {
    setError(null)
    try {
      const res = await fetch("/api/admin/sucursales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sucursalId: s.id, activo: !s.activo }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleEditNombre(e) {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch("/api/admin/sucursales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sucursalId: editando.id, nombre: editando.nombre }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setEditando(null)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Sucursales</h2>
          <p className="text-sm text-slate-500 mt-0.5">Gestioná las sucursales del negocio</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(null); setSuccess(null) }}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 transition-colors"
        >
          + Nueva sucursal
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <h3 className="font-semibold text-slate-900 mb-4">Nueva sucursal</h3>
          <div className="flex gap-3">
            <input
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre de la sucursal"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <button type="submit" className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600">
              Crear
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">
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
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sucursales.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {editando?.id === s.id ? (
                      <form onSubmit={handleEditNombre} className="flex gap-2">
                        <input
                          autoFocus
                          value={editando.nombre}
                          onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                          className="px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <button type="submit" className="text-xs text-indigo-600 font-semibold">Guardar</button>
                        <button type="button" onClick={() => setEditando(null)} className="text-xs text-slate-400">Cancelar</button>
                      </form>
                    ) : (
                      <span className="font-medium text-slate-900">{s.nombre}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${s.activo ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {s.activo ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right flex gap-3 justify-end">
                    <button
                      onClick={() => setEditando({ id: s.id, nombre: s.nombre })}
                      className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                    >
                      Renombrar
                    </button>
                    <button
                      onClick={() => handleToggleActivo(s)}
                      className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                    >
                      {s.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
              {sucursales.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400 text-sm">No hay sucursales</td>
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

- [ ] **Step 2: Agregar tab "Sucursales" en app/admin/layout.js**

Localizar el array de tabs en `app/admin/layout.js`:

```javascript
{ href: "/admin/tipos-servicio", label: "⚙️ Tipos de servicio" },
{ href: "/admin/talleres", label: "🏪 Talleres" },
{ href: "/admin/usuarios", label: "👤 Usuarios" },
{ href: "/admin/reportes", label: "📊 Reportes" },
```

Reemplazar con:

```javascript
{ href: "/admin/tipos-servicio", label: "⚙️ Tipos de servicio" },
{ href: "/admin/talleres", label: "🏪 Talleres" },
{ href: "/admin/usuarios", label: "👤 Usuarios" },
{ href: "/admin/sucursales", label: "🏢 Sucursales" },
{ href: "/admin/reportes", label: "📊 Reportes" },
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/sucursales/page.js app/admin/layout.js
git commit -m "feat: add sucursales admin page and nav tab"
```

---

### Task 5: Usuarios admin — agregar campo sucursal

**Files:**
- Modify: `app/api/admin/usuarios/route.js`
- Modify: `app/admin/usuarios/page.js`

- [ ] **Step 1: Modificar API de usuarios — POST y PATCH aceptan sucursal_id**

En `app/api/admin/usuarios/route.js`:

**GET** — agregar `sucursal_id` y `sucursal_nombre` al SELECT:

```javascript
const { data, error } = await getSupabaseAdmin()
  .from("usuarios")
  .select("id, username, role, sucursal_id, sucursales(nombre), created_at")
  .order("created_at")
```

**POST** — aceptar y validar `sucursal_id`:

```javascript
const { username, password, role, sucursal_id } = body
if (!username || !password || !role) {
  return NextResponse.json({ error: "username, password and role are required" }, { status: 400 })
}
if (!["empleado", "dueno"].includes(role)) {
  return NextResponse.json({ error: "Invalid role" }, { status: 400 })
}
if (role === "empleado" && !sucursal_id) {
  return NextResponse.json({ error: "sucursal_id es requerido para empleados" }, { status: 400 })
}
if (password.length < 6) {
  return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
}

const password_hash = await bcrypt.hash(password, 10)

const { error } = await getSupabaseAdmin()
  .from("usuarios")
  .insert({
    username,
    password_hash,
    role,
    sucursal_id: role === "empleado" ? sucursal_id : null,
  })
```

**PATCH** — aceptar `sucursal_id` junto con `role`:

```javascript
const { userId, role, sucursal_id } = body
if (!userId || !role) {
  return NextResponse.json({ error: "userId and role required" }, { status: 400 })
}
if (!["empleado", "dueno"].includes(role)) {
  return NextResponse.json({ error: "Invalid role" }, { status: 400 })
}

const updates = {
  role,
  sucursal_id: role === "empleado" ? (sucursal_id ?? null) : null,
}

const { error } = await getSupabaseAdmin()
  .from("usuarios")
  .update(updates)
  .eq("id", userId)
```

- [ ] **Step 2: Modificar frontend de usuarios — dropdown sucursal en form + columna en tabla**

En `app/admin/usuarios/page.js`:

**Agregar estado para sucursales** en el componente, justo debajo de `const [error, setError] = useState(null)`:

```javascript
const [sucursales, setSucursales] = useState([])
```

**Agregar `sucursal_id` al estado del form**:

```javascript
const [form, setForm] = useState({ username: "", password: "", role: "empleado", sucursal_id: "" })
```

**Cargar sucursales en `useEffect`**:

```javascript
useEffect(() => {
  loadUsers()
  fetch("/api/admin/sucursales")
    .then(r => r.json())
    .then(d => setSucursales(d.sucursales || []))
    .catch(() => {})
}, [])
```

**En el form de creación**, agregar campo sucursal después del campo rol — reemplazar el `<div>` del rol con:

```javascript
<div>
  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
    Rol
  </label>
  <select
    value={form.role}
    onChange={(e) => setForm({ ...form, role: e.target.value, sucursal_id: "" })}
    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
  >
    <option value="empleado">Empleado</option>
    <option value="dueno">Dueño</option>
  </select>
</div>
{form.role === "empleado" && (
  <div>
    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
      Sucursal
    </label>
    <select
      required
      value={form.sucursal_id}
      onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}
      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
    >
      <option value="">Seleccionar...</option>
      {sucursales.map(s => (
        <option key={s.id} value={s.id}>{s.nombre}</option>
      ))}
    </select>
  </div>
)}
```

**En `handleCreate`**, agregar `sucursal_id` al body:

```javascript
body: JSON.stringify(form),
```
(Ya lo tiene, no cambia porque `form` ya incluye `sucursal_id`)

**En `handleRoleChange`**, cambiar la función para incluir sucursal_id (agregar parámetro `sucursal_id`):

```javascript
async function handleRoleChange(userId, newRole, newSucursalId) {
  setError(null)
  try {
    const res = await fetch("/api/admin/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: newRole, sucursal_id: newSucursalId }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
    await loadUsers()
  } catch (e) {
    setError(e.message)
  }
}
```

**En la tabla**, agregar columna "Sucursal" entre Rol y Creado:

```javascript
<th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
  Sucursal
</th>
```

Y en cada fila, después de la celda de rol:

```javascript
<td className="px-4 py-3 text-slate-600 text-xs">
  {u.role === "empleado" ? (u.sucursales?.nombre ?? "—") : <span className="text-slate-400">Todas</span>}
</td>
```

- [ ] **Step 3: Ejecutar los tests para asegurarse de que no rompemos nada**

```bash
npm test 2>&1 | tail -20
```

Esperado: todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/usuarios/route.js app/admin/usuarios/page.js
git commit -m "feat: add sucursal field to usuarios admin — form and table"
```

---

### Task 6: Dashboard — filtro de sucursal para dueño + asignación automática para empleado

**Files:**
- Modify: `app/page.js`
- Modify: `components/NuevoIngresoModal.js`

- [ ] **Step 1: Modificar NuevoIngresoModal para pasar sucursal_id a crearOrden**

En `components/NuevoIngresoModal.js`:

Agregar `useSession` al import de next-auth si no está:
```javascript
import { useSession } from "next-auth/react"
```

Al inicio del componente, agregar:
```javascript
const { data: session } = useSession()
```

En la llamada a `crearOrden`, agregar `sucursal_id`:
```javascript
const orden = await crearOrden({
  cliente_id: clienteSeleccionado.id,
  tipo_articulo: form.tipo_articulo,
  marca: form.marca,
  modelo: form.modelo,
  problema_reportado: form.problema_reportado,
  notas_internas: form.notas_internas,
  nombre_articulo: form.tipo_articulo === "Otro" ? form.nombre_articulo : null,
  monto_presupuesto: form.monto_presupuesto ? parseFloat(form.monto_presupuesto) : null,
  tipo_servicio_id: form.tipo_servicio_id || null,
  sucursal_id: session?.user?.sucursal_id,
})
```

- [ ] **Step 2: Modificar app/page.js — selector de sucursal para dueño, filtro automático para empleado**

En `app/page.js`, localizar el estado del componente. Agregar estado del filtro de sucursal:

```javascript
const [filtroSucursal, setFiltroSucursal] = useState("TODAS")
const [sucursales, setSucursales] = useState([])
```

En `loadData`, agregar `sucursal_id` al llamado de `getOrdenes`:

```javascript
const sucursalFiltro = isDueno ? (filtroSucursal === "TODAS" ? undefined : filtroSucursal) : session?.user?.sucursal_id

const [ordenesData, statsData, talleresData] = await Promise.all([
  getOrdenes({
    estado: filtroEstado,
    taller_id: filtroTaller,
    busqueda: debouncedBusqueda || undefined,
    incluirEntregados: filtroEstado === "ENTREGADO",
    sucursal_id: sucursalFiltro,
  }),
  getStats(),
  getTalleres(),
])
```

Agregar `filtroSucursal` a las dependencias de `useCallback`:

```javascript
const loadData = useCallback(async () => {
  // ...
}, [filtroEstado, filtroTaller, debouncedBusqueda, filtroSucursal, session])
```

Agregar `getSucursales` al import existente de `@/lib/data`:

```javascript
import { getOrdenes, getStats, getTalleres, getSucursales } from "@/lib/data"
```

Cargar sucursales en el useEffect inicial (solo para dueño):

```javascript
useEffect(() => {
  if (isDueno) {
    getSucursales().then(setSucursales).catch(() => {})
  }
}, [isDueno])
```

**En el JSX del header**, agregar selector de sucursal para dueño. Localizar el header/filtros existentes (cerca de los filtros de estado) y agregar un selector:

```javascript
{isDueno && sucursales.length > 0 && (
  <select
    value={filtroSucursal}
    onChange={(e) => setFiltroSucursal(e.target.value)}
    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-700"
  >
    <option value="TODAS">Todas las sucursales</option>
    {sucursales.map(s => (
      <option key={s.id} value={s.id}>{s.nombre}</option>
    ))}
  </select>
)}
```

Para empleados (no dueños), mostrar el nombre de la sucursal en el header como badge informativo. Dentro del header donde va el nombre del usuario, agregar:

```javascript
{!isDueno && session?.user?.sucursal_id && (
  <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">
    {/* El nombre lo mostramos desde sesión si lo guardamos, o simplemente no lo mostramos */}
  </span>
)}
```

> Nota: el nombre de la sucursal no está en el session JWT por defecto. Para mostrarlo se puede hacer un lookup en `sucursales` por `sucursal_id` del session o simplemente omitir el badge y dejarlo implícito. Omitir es YAGNI para ahora.

- [ ] **Step 3: Ejecutar tests**

```bash
npm test 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add app/page.js components/NuevoIngresoModal.js
git commit -m "feat: filter orders by sucursal — auto for employees, selector for owner"
```

---

### Task 7: Reportes — selector de sucursal

**Files:**
- Modify: `app/admin/reportes/page.js`

- [ ] **Step 1: Agregar selector de sucursal al componente de reportes**

En `app/admin/reportes/page.js`:

Agregar estados al inicio del componente:

```javascript
const [filtroSucursal, setFiltroSucursal] = useState(null) // null = todas
const [sucursales, setSucursales] = useState([])
```

Cargar sucursales en useEffect (junto con stats):

```javascript
useEffect(() => {
  fetch("/api/admin/sucursales")
    .then(r => r.json())
    .then(d => setSucursales(d.sucursales || []))
    .catch(() => {})

  getReportesStats({ sucursal_id: filtroSucursal })
    .then(setStats)
    .catch(() => setError("Error cargando reportes"))
    .finally(() => setLoading(false))
}, [filtroSucursal])
```

En el JSX, agregar selector arriba del título (reemplazar el div del título):

```javascript
<div className="flex items-center justify-between mb-6">
  <div>
    <h2 className="text-xl font-bold text-slate-900">Reportes</h2>
    <p className="text-sm text-slate-500 mt-0.5">Resumen de actividad del negocio</p>
  </div>
  <div className="flex gap-2">
    <button
      onClick={() => setFiltroSucursal(null)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        filtroSucursal === null
          ? "bg-indigo-500 text-white"
          : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      Todas
    </button>
    {sucursales.map(s => (
      <button
        key={s.id}
        onClick={() => setFiltroSucursal(s.id)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          filtroSucursal === s.id
            ? "bg-indigo-500 text-white"
            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
      >
        {s.nombre}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 2: Ejecutar todos los tests**

```bash
npm test 2>&1 | tail -20
```

Esperado: todos pasan.

- [ ] **Step 3: Commit final**

```bash
git add app/admin/reportes/page.js
git commit -m "feat: add sucursal filter to reportes page"
```

---

## Checklist de verificación manual post-implementación

Antes de dar por completo:

- [ ] Login como empleado asignado a "Punta Carretas" → solo ve órdenes de Punta Carretas
- [ ] Login como empleado asignado a "Nuevo Centro" → solo ve órdenes de Nuevo Centro
- [ ] Login como dueño → selector "Todas / Punta Carretas / Nuevo Centro" en dashboard
- [ ] Crear orden como empleado → se asigna automáticamente a su sucursal
- [ ] Admin reportes como dueño → selector funciona, estadísticas cambian al filtrar
- [ ] Admin sucursales → listar, renombrar, activar/desactivar
- [ ] Admin usuarios → crear empleado con sucursal, dueño sin sucursal
