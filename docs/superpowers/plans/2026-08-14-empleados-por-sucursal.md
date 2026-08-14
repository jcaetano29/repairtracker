# Empleados por Sucursal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins maintain a roster of employees per sucursal, and require selecting one of them (only after a sucursal is chosen) when creating a new orden.

**Architecture:** New `empleados` table (id, sucursal_id, nombre, activo) managed from the existing Sucursales admin page via a new `/api/admin/empleados` route, following the exact CRUD pattern already used for `sucursales`. `ordenes` gets a new nullable `empleado_id` FK, populated and validated (required, must belong to the chosen sucursal) at order-creation time only — never editable afterward.

**Tech Stack:** Next.js 14 App Router (JS), Supabase (Postgres + `@supabase/supabase-js`, RLS), NextAuth v5, Vitest for tests. No ORM, no zod — validation is hand-written.

## Global Constraints

- `empleado_id` is **required** to create an orden — validated both client-side (submit button disabled, inline error) and server-side (`crearOrden` throws, API returns 400/500).
- `empleado_id` is **fixed at creation** — no task in this plan adds it to any orden edit/detail screen.
- The employee `<select>` in `NuevoIngresoModal` is **disabled until a sucursal is chosen**, and only lists employees where `activo = true` for that sucursal.
- Employees are **never hard-deleted** — only deactivated (`activo` toggle), so historical orders keep a valid reference.
- An `empleado_id` submitted for an order must **belong to the order's `sucursal_id`** — enforced server-side in `crearOrden`.
- Employee management lives **inside the existing `app/admin/sucursales/page.js`**, not a new admin nav section.
- DB migration file: `supabase/038_empleados.sql` (next number after `037_whatsapp_conversaciones_unread.sql`).

---

## File Structure

- **Create** `supabase/038_empleados.sql` — `empleados` table, `ordenes.empleado_id` column, updated `v_ordenes_dashboard` view.
- **Modify** `lib/data.js` — add `getEmpleados()`; extend `crearOrden()` to require and validate `empleado_id`.
- **Modify** `lib/__tests__/data.test.js` — tests for both.
- **Create** `app/api/admin/empleados/route.js` — GET/POST/PATCH, admin-gated, mirrors `app/api/admin/sucursales/route.js`.
- **Create** `app/api/admin/empleados/__tests__/route.test.js`.
- **Modify** `app/api/ordenes/route.js` — POST validates `empleado_id` is present.
- **Create** `app/api/ordenes/__tests__/route.test.js`.
- **Modify** `app/admin/sucursales/page.js` — each sucursal row shows its employees + "+ Agregar empleado".
- **Modify** `components/NuevoIngresoModal.js` — add required, sucursal-gated employee `<select>`.

---

### Task 1: Database migration — `empleados` table + `ordenes.empleado_id`

**Files:**
- Create: `supabase/038_empleados.sql`

**Interfaces:**
- Produces: table `empleados(id uuid pk, sucursal_id uuid fk→sucursales, nombre text, activo boolean, created_at timestamptz)`; column `ordenes.empleado_id uuid fk→empleados` (nullable); view `v_ordenes_dashboard` gains `empleado_id`, `empleado_nombre`.

This project has no automated migration runner — every prior migration (see `supabase/037_whatsapp_conversaciones_unread.sql` and earlier) is applied by hand through the Supabase Dashboard SQL Editor. This task follows that same convention; verification is a manual SQL check, not a Vitest test.

- [ ] **Step 1: Write the migration file**

Create `supabase/038_empleados.sql`:

```sql
-- supabase/038_empleados.sql
-- Empleados por sucursal: roster liviano (solo nombre) para registrar
-- quién ingresa cada orden. Distinto de `usuarios` (cuentas de login).

BEGIN;

CREATE TABLE empleados (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sucursal_id UUID NOT NULL REFERENCES sucursales(id),
  nombre      TEXT NOT NULL,
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_empleados_sucursal ON empleados(sucursal_id);

ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON empleados
  FOR ALL USING (auth.role() = 'authenticated' OR true);

-- Nullable: las órdenes históricas no tienen empleado registrado y no se
-- pueden backfillear retroactivamente.
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS empleado_id UUID REFERENCES empleados(id);
CREATE INDEX IF NOT EXISTS idx_ordenes_empleado ON ordenes(empleado_id);

-- Redefinir v_ordenes_dashboard (base: definición vigente en
-- supabase/024_fecha_entrega_estimada.sql) agregando empleado_id / empleado_nombre.
DROP VIEW IF EXISTS v_ordenes_dashboard;
CREATE VIEW v_ordenes_dashboard AS
SELECT
  o.id,
  o.numero_orden,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
  c.email AS cliente_email,
  c.documento AS cliente_documento,
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
  o.sucursal_recepcion_id,
  sr.nombre AS sucursal_recepcion_nombre,
  o.sucursal_retiro_id,
  srt.nombre AS sucursal_retiro_nombre,
  o.empleado_id,
  e.nombre AS empleado_nombre,
  o.tipo_servicio_id,
  o.en_garantia,
  o.monto_presupuesto,
  o.monto_presupuesto_taller,
  o.moneda,
  o.presupuesto_aprobado,
  o.monto_final,
  o.notas_internas,
  o.foto_ingreso,
  o.material,
  o.material_otro,
  o.peso_gramos,
  o.tracking_token,
  o.fecha_ingreso,
  o.fecha_envio_taller,
  o.fecha_presupuesto,
  o.fecha_aprobacion,
  o.fecha_listo,
  o.fecha_entrega,
  o.fecha_entrega_estimada,
  o.updated_at,
  EXTRACT(DAY FROM NOW() - o.updated_at)::INT AS dias_en_estado,
  EXTRACT(DAY FROM NOW() - o.fecha_ingreso)::INT AS dias_totales,
  CASE
    WHEN o.estado = 'ENTREGADO' THEN 'none'
    WHEN o.fecha_entrega_estimada IS NOT NULL AND o.fecha_entrega_estimada < CURRENT_DATE THEN 'grave'
    WHEN o.fecha_entrega_estimada IS NOT NULL AND o.fecha_entrega_estimada <= CURRENT_DATE + INTERVAL '2 days' THEN 'leve'
    WHEN o.fecha_entrega_estimada IS NOT NULL THEN 'none'
    WHEN o.estado = 'INGRESADO'
         AND NOW() - o.updated_at > INTERVAL '6 days' THEN 'grave'
    WHEN o.estado = 'INGRESADO'
         AND NOW() - o.updated_at > INTERVAL '3 days' THEN 'leve'
    WHEN o.estado = 'EN_TALLER'
         AND NOW() - o.updated_at > INTERVAL '10 days' THEN 'grave'
    WHEN o.estado = 'EN_TALLER'
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
  END AS nivel_retraso,
  tl.id AS traslado_activo_id,
  tl.tipo AS traslado_activo_tipo,
  tl.estado AS traslado_activo_estado
FROM ordenes o
LEFT JOIN clientes c ON o.cliente_id = c.id
LEFT JOIN talleres t ON o.taller_id = t.id
LEFT JOIN sucursales s ON o.sucursal_id = s.id
LEFT JOIN sucursales sr ON o.sucursal_recepcion_id = sr.id
LEFT JOIN sucursales srt ON o.sucursal_retiro_id = srt.id
LEFT JOIN empleados e ON o.empleado_id = e.id
LEFT JOIN LATERAL (
  SELECT tl2.id, tl2.tipo, tl2.estado
  FROM traslados tl2
  WHERE tl2.orden_id = o.id AND tl2.estado != 'recibido'
  ORDER BY tl2.created_at DESC
  LIMIT 1
) tl ON true;

-- DROP + CREATE resets view options, so security_invoker must be reapplied
-- (see supabase/032_security_hardening.sql for why this view needs it).
ALTER VIEW public.v_ordenes_dashboard SET (security_invoker = true);

COMMIT;
```

**Before running this**, open `supabase/037_whatsapp_conversaciones_unread.sql` (and check `git log -- supabase/` for anything newer) to confirm no migration after `024_fecha_entrega_estimada.sql` redefined `v_ordenes_dashboard` again with extra columns. If one exists, add its columns to the `SELECT` above before applying.

- [ ] **Step 2: Apply the migration**

Go to Supabase Dashboard → SQL Editor → paste the full contents of `supabase/038_empleados.sql` → Run.

- [ ] **Step 3: Verify**

Run this in the same SQL Editor:

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'empleados' ORDER BY column_name;
SELECT column_name FROM information_schema.columns WHERE table_name = 'ordenes' AND column_name = 'empleado_id';
SELECT empleado_id, empleado_nombre FROM v_ordenes_dashboard LIMIT 1;
```

Expected: first query returns `activo, created_at, id, nombre, sucursal_id`; second returns one row (`empleado_id`); third succeeds with `empleado_id`/`empleado_nombre` both `NULL` (no orders have one yet) instead of erroring.

- [ ] **Step 4: Commit**

```bash
git add supabase/038_empleados.sql
git commit -m "feat(db): add empleados table and ordenes.empleado_id column"
```

---

### Task 2: `lib/data.js` — `getEmpleados()`

**Files:**
- Modify: `lib/data.js` (add after `getSucursales()`, currently `lib/data.js:654-661`)
- Test: `lib/__tests__/data.test.js`

**Interfaces:**
- Consumes: `getSupabaseClient` from `./supabase-client` (already imported in `lib/data.js:1`).
- Produces: `getEmpleados(): Promise<Array<{id, sucursal_id, nombre, activo, created_at}>>` — later consumed by Task 6 (admin UI) and Task 7 (order form).

- [ ] **Step 1: Write the failing test**

Add to `lib/__tests__/data.test.js` (new `describe` block, needs its own mock of `../supabase-client` since existing mocks in this file only cover `../supabase-admin`):

```js
vi.mock("../supabase-client", () => ({
  getSupabaseClient: vi.fn(),
}));
```

Add this near the top of the file, alongside the existing `vi.mock("../supabase-admin", ...)` block (both must be declared before the `import * as dataModule from "../data"` line, per Vitest hoisting rules already followed in this file).

```js
import { getSupabaseClient } from "../supabase-client";

describe("getEmpleados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empleados ordered by nombre", async () => {
    const mockData = [
      { id: "e1", sucursal_id: "s1", nombre: "Ana", activo: true, created_at: "2026-01-01" },
    ];
    const mockClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    };
    getSupabaseClient.mockReturnValue(mockClient);

    const result = await dataModule.getEmpleados();

    expect(mockClient.from).toHaveBeenCalledWith("empleados");
    expect(result).toEqual(mockData);
  });

  it("throws when the query errors", async () => {
    const mockClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
    };
    getSupabaseClient.mockReturnValue(mockClient);

    await expect(dataModule.getEmpleados()).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/data.test.js -t getEmpleados`
Expected: FAIL — `dataModule.getEmpleados is not a function`.

- [ ] **Step 3: Implement**

In `lib/data.js`, right after `getSucursales()` (after line 661, before the `// MARCAS` section comment):

```js
export async function getEmpleados() {
  const { data, error } = await getSupabaseClient()
    .from("empleados")
    .select("id, sucursal_id, nombre, activo, created_at")
    .order("nombre")
  if (error) throw error
  return data
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/data.test.js -t getEmpleados`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/data.js lib/__tests__/data.test.js
git commit -m "feat: add getEmpleados data helper"
```

---

### Task 3: `lib/data.js` — `crearOrden()` requires and validates `empleado_id`

**Files:**
- Modify: `lib/data.js:74-133` (`crearOrden`)
- Test: `lib/__tests__/data.test.js`

**Interfaces:**
- Consumes: `getSupabaseAdmin` from `./supabase-admin` (already imported).
- Produces: `crearOrden({ ..., empleado_id })` — throws `Error("empleado_id es requerido")` if missing/falsy; throws `Error("El empleado no pertenece a la sucursal seleccionada")` if the referenced empleado's `sucursal_id` doesn't match the order's `sucursal_id`; otherwise inserts `empleado_id` into `ordenes` same as today's other fields. Consumed by Task 5 (`POST /api/ordenes`).

- [ ] **Step 1: Write the failing tests**

Add to `lib/__tests__/data.test.js`. `crearOrden` also calls `getCentrosReparacion`/`crearTraslado`/`getTrasladoActivo` from `../traslados` — mock that module so those calls are inert:

```js
vi.mock("../traslados", () => ({
  getCentrosReparacion: vi.fn().mockResolvedValue([]),
  crearTraslado: vi.fn(),
  getTrasladoActivo: vi.fn(),
}));
```

```js
import { getSupabaseAdmin } from "../supabase-admin";

describe("crearOrden — empleado_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when empleado_id is missing", async () => {
    await expect(
      dataModule.crearOrden({
        cliente_id: "c1",
        tipo_articulo: "Reloj",
        problema_reportado: "no anda",
        sucursal_id: "s1",
      })
    ).rejects.toThrow("empleado_id es requerido");
  });

  it("throws when empleado belongs to a different sucursal", async () => {
    const mockClient = {
      from: vi.fn((table) => {
        if (table === "empleados") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { sucursal_id: "OTRA-SUCURSAL" }, error: null }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    getSupabaseAdmin.mockReturnValue(mockClient);

    await expect(
      dataModule.crearOrden({
        cliente_id: "c1",
        tipo_articulo: "Reloj",
        problema_reportado: "no anda",
        sucursal_id: "s1",
        empleado_id: "e1",
      })
    ).rejects.toThrow("El empleado no pertenece a la sucursal seleccionada");
  });

  it("inserts empleado_id when it belongs to the order's sucursal", async () => {
    const insertedOrden = { id: "o1", sucursal_id: "s1", empleado_id: "e1" };
    const mockClient = {
      from: vi.fn((table) => {
        if (table === "empleados") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { sucursal_id: "s1" }, error: null }),
          };
        }
        if (table === "ordenes") {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: insertedOrden, error: null }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    getSupabaseAdmin.mockReturnValue(mockClient);

    const result = await dataModule.crearOrden({
      cliente_id: "c1",
      tipo_articulo: "Reloj",
      problema_reportado: "no anda",
      sucursal_id: "s1",
      empleado_id: "e1",
    });

    expect(result).toEqual(insertedOrden);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/data.test.js -t "crearOrden — empleado_id"`
Expected: FAIL — no `empleado_id` validation exists yet, so the first test won't throw and the others won't hit the `empleados` table lookup.

- [ ] **Step 3: Implement**

In `lib/data.js`, replace the `crearOrden` signature and the start of its body (`lib/data.js:74-101`):

```js
export async function crearOrden({ cliente_id, tipo_articulo, marca, modelo, problema_reportado, notas_internas, monto_presupuesto, moneda, nombre_articulo, tipo_servicio_id, sucursal_id, empleado_id, material, material_otro, peso_gramos, monto_presupuesto_taller, en_garantia, forzar_traslado_a, fecha_entrega_estimada }) {
  if (!empleado_id) {
    throw new Error("empleado_id es requerido");
  }

  const { data: empleado, error: empleadoError } = await getSupabaseAdmin()
    .from("empleados")
    .select("sucursal_id")
    .eq("id", empleado_id)
    .single();

  if (empleadoError || !empleado || empleado.sucursal_id !== sucursal_id) {
    throw new Error("El empleado no pertenece a la sucursal seleccionada");
  }

  const { data: orden, error } = await getSupabaseAdmin()
    .from("ordenes")
    .insert({
      cliente_id,
      tipo_articulo,
      marca,
      modelo,
      problema_reportado,
      notas_internas,
      monto_presupuesto: monto_presupuesto || null,
      monto_presupuesto_taller: monto_presupuesto_taller || null,
      moneda: moneda || "UYU",
      nombre_articulo: nombre_articulo || null,
      tipo_servicio_id: tipo_servicio_id || null,
      sucursal_id,
      empleado_id,
      sucursal_recepcion_id: sucursal_id,
      sucursal_retiro_id: sucursal_id,
      material: material || null,
      material_otro: material_otro || null,
      peso_gramos: peso_gramos || null,
      en_garantia: en_garantia || false,
      fecha_entrega_estimada: fecha_entrega_estimada || null,
    })
    .select("*")
    .single();

  if (error) throw error;
```

The rest of the function (the auto-traslado block and `return orden;`, currently `lib/data.js:102-133`) stays unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/data.test.js -t "crearOrden — empleado_id"`
Expected: PASS (3 tests). Also run `npx vitest run lib/__tests__/data.test.js` in full to confirm no existing test broke.

- [ ] **Step 5: Commit**

```bash
git add lib/data.js lib/__tests__/data.test.js
git commit -m "feat: require and validate empleado_id in crearOrden"
```

---

### Task 4: `app/api/admin/empleados/route.js` (new)

**Files:**
- Create: `app/api/admin/empleados/route.js`
- Test: Create `app/api/admin/empleados/__tests__/route.test.js`

**Interfaces:**
- Consumes: `auth` from `@/auth`, `getSupabaseAdmin` from `@/lib/supabase-admin`.
- Produces: `GET` (optionally `?sucursal_id=`) → `{ empleados: [...] }`; `POST({ sucursal_id, nombre })` → `{ ok: true }`; `PATCH({ empleadoId, activo })` → `{ ok: true }`. All three return `403 { error: "Forbidden" }` when `session.user.role !== "admin"`. Consumed by Task 6 (admin UI).

- [ ] **Step 1: Write the failing tests**

Create `app/api/admin/empleados/__tests__/route.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET, POST, PATCH } from "../route.js"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: vi.fn() }))

describe("GET /api/admin/empleados", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 403 when not admin", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue({ user: { role: "employee" } })

    const response = await GET(new Request("http://localhost/api/admin/empleados"))
    expect(response.status).toBe(403)
  })

  it("lists empleados ordered by nombre", async () => {
    const { auth } = await import("@/auth")
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")
    auth.mockResolvedValue({ user: { role: "admin" } })

    const mockData = [{ id: "e1", sucursal_id: "s1", nombre: "Ana", activo: true, created_at: "2026-01-01" }]
    getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      }),
    })

    const response = await GET(new Request("http://localhost/api/admin/empleados"))
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.empleados).toEqual(mockData)
  })
})

describe("POST /api/admin/empleados", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 403 when not admin", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue(null)

    const request = new Request("http://localhost/api/admin/empleados", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "s1", nombre: "Ana" }),
    })
    const response = await POST(request)
    expect(response.status).toBe(403)
  })

  it("rejects empty nombre", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue({ user: { role: "admin" } })

    const request = new Request("http://localhost/api/admin/empleados", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "s1", nombre: "   " }),
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it("rejects invalid sucursal_id format", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue({ user: { role: "admin" } })

    const request = new Request("http://localhost/api/admin/empleados", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "not-a-uuid", nombre: "Ana" }),
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it("creates an empleado", async () => {
    const { auth } = await import("@/auth")
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")
    auth.mockResolvedValue({ user: { role: "admin" } })

    const insertFn = vi.fn().mockResolvedValue({ error: null })
    getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue({ insert: insertFn }) })

    const request = new Request("http://localhost/api/admin/empleados", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "11111111-1111-1111-1111-111111111111", nombre: "Ana" }),
    })
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(insertFn).toHaveBeenCalledWith({ sucursal_id: "11111111-1111-1111-1111-111111111111", nombre: "Ana" })
  })
})

describe("PATCH /api/admin/empleados", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 403 when not admin", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue({ user: { role: "employee" } })

    const request = new Request("http://localhost/api/admin/empleados", {
      method: "PATCH",
      body: JSON.stringify({ empleadoId: "e1", activo: false }),
    })
    const response = await PATCH(request)
    expect(response.status).toBe(403)
  })

  it("toggles activo", async () => {
    const { auth } = await import("@/auth")
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")
    auth.mockResolvedValue({ user: { role: "admin" } })

    const eqFn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn })
    getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateFn }) })

    const request = new Request("http://localhost/api/admin/empleados", {
      method: "PATCH",
      body: JSON.stringify({ empleadoId: "e1", activo: false }),
    })
    const response = await PATCH(request)

    expect(response.status).toBe(200)
    expect(updateFn).toHaveBeenCalledWith({ activo: false })
    expect(eqFn).toHaveBeenCalledWith("id", "e1")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/admin/empleados/__tests__/route.test.js`
Expected: FAIL — `../route.js` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `app/api/admin/empleados/route.js`:

```js
import { auth } from "@/auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

async function verifyAdmin() {
  const session = await auth()
  return session?.user?.role === "admin" ? session : null
}

// GET — list empleados, optionally filtered by sucursal_id
export async function GET(request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const sucursalId = searchParams.get("sucursal_id")

  let query = getSupabaseAdmin()
    .from("empleados")
    .select("id, sucursal_id, nombre, activo, created_at")
    .order("nombre")

  if (sucursalId) {
    query = query.eq("sucursal_id", sucursalId)
  }

  const { data, error } = await query

  if (error) {
    console.error("[/api/admin/empleados] GET error:", error)
    return NextResponse.json({ error: "Error al obtener empleados" }, { status: 500 })
  }
  return NextResponse.json({ empleados: data })
}

// POST — create empleado
export async function POST(request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { sucursal_id, nombre } = body
  if (!sucursal_id || typeof sucursal_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sucursal_id)) {
    return NextResponse.json({ error: "sucursal_id inválido" }, { status: 400 })
  }
  if (!nombre?.trim() || typeof nombre !== "string") {
    return NextResponse.json({ error: "nombre es requerido" }, { status: 400 })
  }
  if (nombre.trim().length > 100) {
    return NextResponse.json({ error: "nombre muy largo (máx 100 caracteres)" }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from("empleados")
    .insert({ sucursal_id, nombre: nombre.trim() })

  if (error) {
    console.error("[/api/admin/empleados] POST error:", error)
    return NextResponse.json({ error: "Error al crear empleado" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// PATCH — toggle activo
export async function PATCH(request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { empleadoId, activo } = body
  if (!empleadoId) {
    return NextResponse.json({ error: "empleadoId es requerido" }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from("empleados")
    .update({ activo })
    .eq("id", empleadoId)

  if (error) {
    console.error("[/api/admin/empleados] PATCH error:", error)
    return NextResponse.json({ error: "Error al actualizar empleado" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
```

Note: the `insert({ sucursal_id, nombre: nombre.trim() })` call must match the test's exact expectation (`{ sucursal_id: "...", nombre: "Ana" }` with no extra whitespace) — the test's input `"Ana"` has no surrounding whitespace so `.trim()` is a no-op there, keeping the assertion exact.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/admin/empleados/__tests__/route.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/empleados/route.js app/api/admin/empleados/__tests__/route.test.js
git commit -m "feat: add /api/admin/empleados CRUD route"
```

---

### Task 5: `POST /api/ordenes` validates `empleado_id`

**Files:**
- Modify: `app/api/ordenes/route.js:36-55` (`POST`)
- Test: Create `app/api/ordenes/__tests__/route.test.js`

**Interfaces:**
- Consumes: `crearOrden` from `@/lib/data` (Task 3 already makes it throw when `empleado_id` is missing/invalid — this task adds an explicit early 400 so the client gets a clean validation error instead of a generic 500).

- [ ] **Step 1: Write the failing test**

Create `app/api/ordenes/__tests__/route.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "../route.js"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/data", () => ({
  getOrdenes: vi.fn(),
  crearOrden: vi.fn(),
}))

describe("POST /api/ordenes", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 401 without session", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue(null)

    const request = new Request("http://localhost/api/ordenes", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "s1", empleado_id: "e1" }),
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it("returns 400 when empleado_id is missing", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue({ user: { id: "u1", role: "admin" } })

    const request = new Request("http://localhost/api/ordenes", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "s1" }),
    })
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain("empleado")
  })

  it("creates the orden when empleado_id is present", async () => {
    const { auth } = await import("@/auth")
    const { crearOrden } = await import("@/lib/data")
    auth.mockResolvedValue({ user: { id: "u1", role: "admin" } })
    crearOrden.mockResolvedValue({ id: "o1" })

    const request = new Request("http://localhost/api/ordenes", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "s1", empleado_id: "e1" }),
    })
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.orden).toEqual({ id: "o1" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/ordenes/__tests__/route.test.js -t "missing"`
Expected: FAIL — currently there's no `empleado_id` check, so `crearOrden` (mocked, resolves fine) gets called and the response is 200, not 400.

- [ ] **Step 3: Implement**

In `app/api/ordenes/route.js`, add the check right after the existing sucursal authorization check (`app/api/ordenes/route.js:44-46`):

```js
  // Non-admin can only create within their own sucursal
  if (session.user.role !== "admin" && body.sucursal_id !== session.user.sucursal_id) {
    return NextResponse.json({ error: "No autorizado para esta sucursal" }, { status: 403 })
  }

  if (!body.empleado_id) {
    return NextResponse.json({ error: "empleado_id es requerido" }, { status: 400 })
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/ordenes/__tests__/route.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/ordenes/route.js app/api/ordenes/__tests__/route.test.js
git commit -m "feat: require empleado_id when creating an orden via API"
```

---

### Task 6: Admin UI — employees per sucursal in `app/admin/sucursales/page.js`

**Files:**
- Modify: `app/admin/sucursales/page.js`

**Interfaces:**
- Consumes: `GET/POST/PATCH /api/admin/empleados` (Task 4).

No Vitest/RTL setup exists for client-page components in this repo (`app/admin/configuracion/__tests__/page.test.js` only tests server-component auth logic, not rendering) — verification for this task is manual, via the dev server, matching existing project convention.

- [ ] **Step 1: Add employee state, loading, and mutation handlers**

In `app/admin/sucursales/page.js`, add `Fragment` to the React import and new state, right after the existing `useState` declarations (after line 12):

```js
import { useState, useEffect, Fragment } from "react"
```

```js
  const [empleadosPorSucursal, setEmpleadosPorSucursal] = useState({}) // { [sucursalId]: Empleado[] }
  const [showEmpleadoForm, setShowEmpleadoForm] = useState(null) // sucursalId | null
  const [nuevoEmpleadoNombre, setNuevoEmpleadoNombre] = useState("")
```

Add `loadEmpleados` after the existing `load()` function (after line 26):

```js
  async function loadEmpleados() {
    try {
      const res = await fetch("/api/admin/empleados")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { empleados } = await res.json()
      const grouped = {}
      for (const emp of empleados || []) {
        if (!grouped[emp.sucursal_id]) grouped[emp.sucursal_id] = []
        grouped[emp.sucursal_id].push(emp)
      }
      setEmpleadosPorSucursal(grouped)
    } catch (e) {
      setError(e.message)
    }
  }
```

Update the mount effect (line 28) to also load employees:

```js
  useEffect(() => { load(); loadEmpleados() }, [])
```

Add the create/toggle handlers after `handleEditNombre` (after line 81):

```js
  async function handleCreateEmpleado(sucursalId, e) {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch("/api/admin/empleados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sucursal_id: sucursalId, nombre: nuevoEmpleadoNombre }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNuevoEmpleadoNombre("")
      setShowEmpleadoForm(null)
      await loadEmpleados()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleToggleEmpleadoActivo(empleado) {
    setError(null)
    try {
      const res = await fetch("/api/admin/empleados", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empleadoId: empleado.id, activo: !empleado.activo }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await loadEmpleados()
    } catch (e) {
      setError(e.message)
    }
  }
```

- [ ] **Step 2: Render employees under each sucursal row**

The `<tbody>` currently maps sucursales to a single `<tr>` each (`app/admin/sucursales/page.js:140-178`). Wrap each sucursal's row in a `Fragment` and add a second `<tr>` with the employee list right after it:

```jsx
            <tbody>
              {sucursales.map((s) => (
                <Fragment key={s.id}>
                  <tr className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800">
                    {/* ...existing <td> cells unchanged, just drop the key from this <tr> since Fragment now carries it... */}
                  </tr>
                  <tr className="border-b border-slate-100 bg-slate-50/50 dark:bg-slate-800/30">
                    <td colSpan={3} className="px-4 py-3">
                      <div className="pl-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Empleados</span>
                          <button
                            onClick={() => { setShowEmpleadoForm(s.id); setNuevoEmpleadoNombre(""); setError(null) }}
                            className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                          >
                            + Agregar empleado
                          </button>
                        </div>
                        {showEmpleadoForm === s.id && (
                          <form onSubmit={(e) => handleCreateEmpleado(s.id, e)} className="flex gap-2 mb-2">
                            <input
                              autoFocus
                              required
                              value={nuevoEmpleadoNombre}
                              onChange={(e) => setNuevoEmpleadoNombre(e.target.value)}
                              placeholder="Nombre del empleado"
                              className="flex-1 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                            <button type="submit" className="text-xs text-indigo-600 font-semibold">Guardar</button>
                            <button type="button" onClick={() => setShowEmpleadoForm(null)} className="text-xs text-slate-400">Cancelar</button>
                          </form>
                        )}
                        <ul className="space-y-1">
                          {(empleadosPorSucursal[s.id] || []).map((emp) => (
                            <li key={emp.id} className="flex items-center justify-between text-sm">
                              <span className={emp.activo ? "text-slate-700 dark:text-slate-300" : "text-slate-400 line-through"}>
                                {emp.nombre}
                              </span>
                              <button
                                onClick={() => handleToggleEmpleadoActivo(emp)}
                                className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                              >
                                {emp.activo ? "Desactivar" : "Activar"}
                              </button>
                            </li>
                          ))}
                          {(empleadosPorSucursal[s.id] || []).length === 0 && (
                            <li className="text-xs text-slate-400">Sin empleados cargados</li>
                          )}
                        </ul>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
              {sucursales.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400 text-sm">No hay sucursales</td>
                </tr>
              )}
            </tbody>
```

Concretely: take the existing `<tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800">...</tr>` block (lines 141-177) unchanged except removing its `key` prop (the `Fragment` now owns `key={s.id}`), and insert the new employees `<tr>` immediately after its closing `</tr>`, both wrapped in `<Fragment key={s.id}>...</Fragment>`.

- [ ] **Step 3: Manual verification**

Run the dev server (`npm run dev`), sign in as an admin, go to `/admin/sucursales`:
- Confirm each sucursal shows an "Empleados" sub-section with "+ Agregar empleado".
- Click it, type a name, submit — confirm it appears in the list immediately and persists after a page reload.
- Click "Desactivar" on that employee — confirm the label switches to strikethrough + "Activar", and persists after reload.

- [ ] **Step 4: Commit**

```bash
git add app/admin/sucursales/page.js
git commit -m "feat: manage empleados per sucursal from admin panel"
```

---

### Task 7: `NuevoIngresoModal.js` — required, sucursal-gated employee selector

**Files:**
- Modify: `components/NuevoIngresoModal.js`

**Interfaces:**
- Consumes: `getEmpleados()` from `@/lib/data` (Task 2).

No RTL setup for this component either — verification is manual via the dev server, per existing project convention (see `docs/superpowers/specs/2026-04-09-selector-sucursal-nuevo-ingreso-design.md`, which shipped the analogous sucursal selector the same way).

- [ ] **Step 1: Import, state, and loading**

Update the import (`components/NuevoIngresoModal.js:6`):

```js
import { getTiposServicio, getSucursales, getMarcas, getEmpleados } from "@/lib/data";
```

Add `empleado_id: ""` to the initial `form` state (`components/NuevoIngresoModal.js:43`, right after `sucursal_id: ""`):

```js
    sucursal_id: "",
    empleado_id: "",
```

Add an `empleados` state and loading effect, right after the existing sucursales effect (`components/NuevoIngresoModal.js:64-68`):

```js
  useEffect(() => {
    getEmpleados()
      .then((data) => setEmpleados(data.filter((e) => e.activo)))
      .catch(() => {});
  }, []);
```

And its `useState` declaration alongside `sucursales` (`components/NuevoIngresoModal.js:51`):

```js
  const [sucursales, setSucursales] = useState([]);
  const [empleados, setEmpleados] = useState([]);
```

Add the derived list right before the `return (` (`components/NuevoIngresoModal.js:216`, alongside the existing `userSucursalId` derivation):

```js
  const empleadosDeSucursal = empleados.filter((e) => e.sucursal_id === form.sucursal_id);
```

- [ ] **Step 2: Validation and payload**

Add the required-field check in `handleSubmit`, right after the existing `sucursal_id` check (`components/NuevoIngresoModal.js:148-151`):

```js
    if (!form.sucursal_id) {
      setError("Seleccioná una sucursal.");
      return;
    }

    if (!form.empleado_id) {
      setError("Seleccioná qué empleado ingresa la orden.");
      return;
    }
```

Add `empleado_id` to the POST payload, right after `sucursal_id: form.sucursal_id,` (`components/NuevoIngresoModal.js:181`):

```js
          sucursal_id: form.sucursal_id,
          empleado_id: form.empleado_id,
```

- [ ] **Step 3: Select UI**

For the admin sucursal `<select>`, reset the employee choice whenever sucursal changes (`components/NuevoIngresoModal.js:428`):

```js
                    onChange={(e) => setForm({ ...form, sucursal_id: e.target.value, empleado_id: "" })}
```

Add the employee `<select>` right after the closing `</div>` of the Sucursal block and before the "Trasladar a otro centro" block (`components/NuevoIngresoModal.js:445`, i.e. between the sucursal `<div>` and the `{centroDestino && (...)}` block):

```jsx
              {/* Empleado */}
              <div>
                <label htmlFor="empleado_id" className="block text-sm font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Empleado *
                </label>
                <select
                  id="empleado_id"
                  aria-required="true"
                  value={form.empleado_id}
                  onChange={(e) => setForm({ ...form, empleado_id: e.target.value })}
                  disabled={!form.sucursal_id}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:bg-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {form.sucursal_id ? "Seleccioná un empleado" : "Elegí una sucursal primero"}
                  </option>
                  {empleadosDeSucursal.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre}
                    </option>
                  ))}
                </select>
              </div>
```

- [ ] **Step 4: Disable submit until empleado is chosen**

Update the submit button's `disabled` condition (`components/NuevoIngresoModal.js:719`):

```jsx
                disabled={!form.problema_reportado || !form.sucursal_id || !form.empleado_id || loading}
```

- [ ] **Step 5: Manual verification**

Run the dev server, open "Nuevo Ingreso" as an admin:
- Confirm the Empleado `<select>` is disabled and shows "Elegí una sucursal primero" before picking a sucursal.
- Pick a sucursal with at least one active employee (create one via Task 6's UI if needed) — confirm the select enables and lists that employee.
- Switch to a different sucursal — confirm the employee selection resets and the list updates to that sucursal's employees.
- Confirm "Registrar Ingreso" stays disabled until an employee is picked, and that the created order is saved with the right `empleado_id` (check via `/admin` order detail's underlying data, or a quick Supabase table view).
- Repeat as a non-admin (`role: "employee"`) session — confirm the Empleado select is enabled immediately (sucursal is already fixed) and only shows that user's sucursal's employees.

- [ ] **Step 6: Commit**

```bash
git add components/NuevoIngresoModal.js
git commit -m "feat: require selecting empleado when creating an orden"
```

---

## Self-Review

**Spec coverage:**
- Migración `empleados` + `ordenes.empleado_id` → Task 1.
- Alta de empleados por sucursal en admin (botón "+") → Task 6.
- Selector de empleado deshabilitado hasta elegir sucursal, obligatorio → Task 7.
- Validación server-side de obligatoriedad y pertenencia a la sucursal → Tasks 3 and 5.
- Datos históricos (`empleado_id` nullable, sin backfill) → Task 1.
- Campo fijo tras la creación (no editable) → enforced by omission: no task touches any orden-edit screen; called out explicitly in Global Constraints.

**Placeholder scan:** No "TBD"/"TODO"/"handle appropriately" phrasing anywhere above; every step has literal code or an exact manual command.

**Type consistency:** `empleado_id` (snake_case, matching every other FK field like `sucursal_id`, `taller_id`, `cliente_id` in this codebase) is used identically across Tasks 1, 3, 5, and 7. `getEmpleados()` return shape (`{id, sucursal_id, nombre, activo, created_at}`) from Task 2 matches what Task 6 (`empleadosPorSucursal` grouping) and Task 7 (`empleadosDeSucursal` filter) both consume.
