# Traslados Entre Sucursales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track physical transfers of repair orders between branches (Nuevo Centro <-> Punta Carretas) with dispatch/receive actions and automatic transfer creation.

**Architecture:** New `traslados` table tracks transfers as a parallel process to the order state machine. Two new columns on `ordenes` (`sucursal_recepcion_id`, `sucursal_retiro_id`) distinguish reception vs. current location vs. pickup branch. A new `lib/traslados.js` module handles all transfer CRUD. Transfer blocking logic is enforced in the API and UI layers.

**Tech Stack:** Supabase (PostgreSQL), Next.js 14, React 18, Tailwind CSS, Vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/015_traslados.sql` | Migration: table, columns, indexes, data backfill |
| Create | `lib/traslados.js` | Data access: CRUD for traslados |
| Create | `app/api/traslados/route.js` | API: despachar, recibir traslados |
| Create | `components/TrasladosBadge.js` | Badge showing transfer status on orders |
| Create | `components/TrasladosPanel.js` | Dashboard section listing active transfers |
| Create | `lib/__tests__/traslados.test.js` | Unit tests for traslados data layer |
| Create | `app/api/traslados/__tests__/route.test.js` | Unit tests for traslados API |
| Modify | `lib/data.js` | Update `crearOrden` to set new columns + auto-create ida transfer |
| Modify | `components/DetalleOrdenModal.js` | Add traslados history section, sucursal retiro dropdown, block transitions |
| Modify | `components/NuevoIngresoModal.js` | No changes needed (sucursal_id already set; new columns are set in `crearOrden`) |
| Modify | `app/page.js` | Add TrasladosBadge to table/kanban, add TrasladosPanel section |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/015_traslados.sql`

- [ ] **Step 1: Write migration file**

```sql
-- supabase/015_traslados.sql
-- Traslados entre sucursales

BEGIN;

-- ============================================================
-- FLAG: centro de reparacion en sucursales
-- ============================================================
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS es_centro_reparacion BOOLEAN DEFAULT false;
UPDATE sucursales SET es_centro_reparacion = true WHERE nombre = 'Punta Carretas';

-- ============================================================
-- NUEVAS COLUMNAS en ordenes
-- ============================================================
-- Donde el cliente dejo el objeto (inmutable)
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS sucursal_recepcion_id UUID REFERENCES sucursales(id);
-- Donde el cliente retira (default = recepcion, editable)
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS sucursal_retiro_id UUID REFERENCES sucursales(id);

-- Backfill: asumir recepcion y retiro = sucursal actual
UPDATE ordenes SET sucursal_recepcion_id = sucursal_id WHERE sucursal_recepcion_id IS NULL;
UPDATE ordenes SET sucursal_retiro_id = sucursal_id WHERE sucursal_retiro_id IS NULL;

-- Aplicar NOT NULL
ALTER TABLE ordenes ALTER COLUMN sucursal_recepcion_id SET NOT NULL;
ALTER TABLE ordenes ALTER COLUMN sucursal_retiro_id SET NOT NULL;

-- ============================================================
-- TABLA: traslados
-- ============================================================
CREATE TABLE traslados (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_id          UUID REFERENCES ordenes(id) ON DELETE CASCADE NOT NULL,
  sucursal_origen   UUID REFERENCES sucursales(id) NOT NULL,
  sucursal_destino  UUID REFERENCES sucursales(id) NOT NULL,
  tipo              TEXT NOT NULL CHECK (tipo IN ('ida', 'retorno')),
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'en_transito', 'recibido')),
  creado_por        UUID,
  recibido_por      UUID,
  fecha_salida      TIMESTAMPTZ,
  fecha_recepcion   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE traslados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON traslados
  FOR ALL USING (auth.role() = 'authenticated' OR true);

-- Indexes
CREATE INDEX idx_traslados_orden ON traslados(orden_id);
CREATE INDEX idx_traslados_estado ON traslados(estado);
CREATE INDEX idx_traslados_destino_estado ON traslados(sucursal_destino, estado);

-- Trigger: auto-update updated_at
CREATE TRIGGER tr_traslados_updated
  BEFORE UPDATE ON traslados
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ACTUALIZAR VIEW: v_ordenes_dashboard
-- ============================================================
DROP VIEW IF EXISTS v_ordenes_dashboard;
CREATE VIEW v_ordenes_dashboard AS
SELECT
  o.id,
  o.numero_orden,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
  c.email AS cliente_email,
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
  sret.nombre AS sucursal_retiro_nombre,
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
  END AS nivel_retraso,
  -- Traslado activo (no recibido) para esta orden
  tl.id AS traslado_activo_id,
  tl.tipo AS traslado_activo_tipo,
  tl.estado AS traslado_activo_estado
FROM ordenes o
LEFT JOIN clientes c ON o.cliente_id = c.id
LEFT JOIN talleres t ON o.taller_id = t.id
LEFT JOIN sucursales s ON o.sucursal_id = s.id
LEFT JOIN sucursales sr ON o.sucursal_recepcion_id = sr.id
LEFT JOIN sucursales sret ON o.sucursal_retiro_id = sret.id
LEFT JOIN LATERAL (
  SELECT tl2.id, tl2.tipo, tl2.estado
  FROM traslados tl2
  WHERE tl2.orden_id = o.id AND tl2.estado != 'recibido'
  ORDER BY tl2.created_at DESC
  LIMIT 1
) tl ON true;

COMMIT;
```

- [ ] **Step 2: Apply migration to Supabase**

Run in Supabase SQL Editor or via CLI:
```bash
# If using Supabase CLI:
supabase db push
# Otherwise paste contents into Supabase Dashboard > SQL Editor and run
```

- [ ] **Step 3: Verify migration**

Check in Supabase Dashboard:
1. `sucursales` table has `es_centro_reparacion` column, Punta Carretas = true
2. `ordenes` table has `sucursal_recepcion_id` and `sucursal_retiro_id` columns, all non-null
3. `traslados` table exists with correct columns and constraints
4. `v_ordenes_dashboard` view includes `sucursal_recepcion_nombre`, `sucursal_retiro_nombre`, `traslado_activo_id`, `traslado_activo_tipo`, `traslado_activo_estado`

- [ ] **Step 4: Commit**

```bash
git add supabase/015_traslados.sql
git commit -m "feat: add traslados migration with table, columns, and updated view"
```

---

### Task 2: Traslados Data Layer

**Files:**
- Create: `lib/traslados.js`
- Create: `lib/__tests__/traslados.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// lib/__tests__/traslados.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockNeq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

function createChain() {
  const chain = {
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    update: mockUpdate.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    neq: mockNeq.mockReturnThis(),
    order: mockOrder.mockReturnThis(),
    single: mockSingle,
  };
  return chain;
}

const mockFrom = vi.fn(() => createChain());

vi.mock("@/lib/supabase-client", () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

let trasladosModule;

beforeEach(async () => {
  vi.clearAllMocks();
  trasladosModule = await import("@/lib/traslados");
});

describe("getTraslados", () => {
  it("fetches active traslados filtered by sucursal", async () => {
    const mockData = [{ id: "t1", tipo: "ida", estado: "pendiente" }];
    mockOrder.mockResolvedValue({ data: mockData, error: null });

    const result = await trasladosModule.getTraslados({ sucursal_id: "s1" });

    expect(mockFrom).toHaveBeenCalledWith("traslados");
    expect(result).toEqual(mockData);
  });

  it("throws on supabase error", async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: "fail" } });

    await expect(trasladosModule.getTraslados({})).rejects.toThrow();
  });
});

describe("getTrasladosByOrden", () => {
  it("fetches all traslados for an order", async () => {
    const mockData = [
      { id: "t1", tipo: "ida", estado: "recibido" },
      { id: "t2", tipo: "retorno", estado: "pendiente" },
    ];
    mockOrder.mockResolvedValue({ data: mockData, error: null });

    const result = await trasladosModule.getTrasladosByOrden("orden-1");

    expect(mockFrom).toHaveBeenCalledWith("traslados");
    expect(mockEq).toHaveBeenCalledWith("orden_id", "orden-1");
    expect(result).toEqual(mockData);
  });
});

describe("crearTraslado", () => {
  it("inserts a new traslado", async () => {
    const newTraslado = {
      orden_id: "o1",
      sucursal_origen: "s1",
      sucursal_destino: "s2",
      tipo: "ida",
      creado_por: "u1",
    };
    mockSingle.mockResolvedValue({ data: { id: "t1", ...newTraslado, estado: "pendiente" }, error: null });

    const result = await trasladosModule.crearTraslado(newTraslado);

    expect(mockFrom).toHaveBeenCalledWith("traslados");
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      orden_id: "o1",
      tipo: "ida",
    }));
    expect(result.estado).toBe("pendiente");
  });
});

describe("despacharTraslado", () => {
  it("updates traslado to en_transito with fecha_salida", async () => {
    mockSingle.mockResolvedValue({ data: { id: "t1", estado: "en_transito" }, error: null });

    const result = await trasladosModule.despacharTraslado("t1");

    expect(mockFrom).toHaveBeenCalledWith("traslados");
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      estado: "en_transito",
    }));
    expect(result.estado).toBe("en_transito");
  });
});

describe("recibirTraslado", () => {
  it("updates traslado to recibido with fecha_recepcion and recibido_por", async () => {
    mockSingle.mockResolvedValue({ data: { id: "t1", estado: "recibido" }, error: null });

    const result = await trasladosModule.recibirTraslado("t1", "u2");

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      estado: "recibido",
      recibido_por: "u2",
    }));
    expect(result.estado).toBe("recibido");
  });
});

describe("getCentroReparacion", () => {
  it("returns the sucursal with es_centro_reparacion = true", async () => {
    mockSingle.mockResolvedValue({ data: { id: "s-pc", nombre: "Punta Carretas" }, error: null });

    const result = await trasladosModule.getCentroReparacion();

    expect(mockFrom).toHaveBeenCalledWith("sucursales");
    expect(mockEq).toHaveBeenCalledWith("es_centro_reparacion", true);
    expect(result.nombre).toBe("Punta Carretas");
  });
});

describe("getTrasladoActivo", () => {
  it("returns the active (non-recibido) traslado for an order", async () => {
    mockSingle.mockResolvedValue({ data: { id: "t1", estado: "pendiente" }, error: null });

    const result = await trasladosModule.getTrasladoActivo("o1");

    expect(mockFrom).toHaveBeenCalledWith("traslados");
    expect(mockNeq).toHaveBeenCalledWith("estado", "recibido");
    expect(result.estado).toBe("pendiente");
  });

  it("returns null when no active traslado", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } });

    const result = await trasladosModule.getTrasladoActivo("o1");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/traslados.test.js`
Expected: FAIL — module `@/lib/traslados` does not exist

- [ ] **Step 3: Write the traslados data layer**

```javascript
// lib/traslados.js
import { getSupabaseClient } from "./supabase-client";

/**
 * Get active traslados, optionally filtered by sucursal (as origin or destination).
 */
export async function getTraslados({ sucursal_id } = {}) {
  let query = getSupabaseClient()
    .from("traslados")
    .select("*, ordenes!inner(numero_orden, tipo_articulo, marca, cliente_id, clientes!inner(nombre, telefono))")
    .neq("estado", "recibido")
    .order("created_at", { ascending: false });

  if (sucursal_id) {
    // Show traslados where this sucursal is origin OR destination
    query = query.or(`sucursal_origen.eq.${sucursal_id},sucursal_destino.eq.${sucursal_id}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Get all traslados for a specific order (for history display).
 */
export async function getTrasladosByOrden(orden_id) {
  const { data, error } = await getSupabaseClient()
    .from("traslados")
    .select("*")
    .eq("orden_id", orden_id)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * Create a new traslado.
 */
export async function crearTraslado({ orden_id, sucursal_origen, sucursal_destino, tipo, creado_por }) {
  const { data, error } = await getSupabaseClient()
    .from("traslados")
    .insert({
      orden_id,
      sucursal_origen,
      sucursal_destino,
      tipo,
      creado_por: creado_por || null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Mark a traslado as dispatched (en_transito).
 */
export async function despacharTraslado(traslado_id) {
  const { data, error } = await getSupabaseClient()
    .from("traslados")
    .update({
      estado: "en_transito",
      fecha_salida: new Date().toISOString(),
    })
    .eq("id", traslado_id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Mark a traslado as received. Also updates ordenes.sucursal_id to the destination.
 */
export async function recibirTraslado(traslado_id, recibido_por) {
  const supabase = getSupabaseClient();

  // Get traslado to know the destination
  const { data: traslado, error: fetchError } = await supabase
    .from("traslados")
    .select("*")
    .eq("id", traslado_id)
    .single();

  if (fetchError) throw fetchError;

  // Update traslado
  const { data: updated, error: updateError } = await supabase
    .from("traslados")
    .update({
      estado: "recibido",
      fecha_recepcion: new Date().toISOString(),
      recibido_por: recibido_por || null,
    })
    .eq("id", traslado_id)
    .select("*")
    .single();

  if (updateError) throw updateError;

  // Update order's current location
  const { error: ordenError } = await supabase
    .from("ordenes")
    .update({ sucursal_id: traslado.sucursal_destino })
    .eq("id", traslado.orden_id);

  if (ordenError) throw ordenError;

  return updated;
}

/**
 * Get the sucursal marked as centro de reparacion.
 */
export async function getCentroReparacion() {
  const { data, error } = await getSupabaseClient()
    .from("sucursales")
    .select("id, nombre")
    .eq("es_centro_reparacion", true)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get the active (non-recibido) traslado for an order, if any.
 * Returns null if there is no active traslado.
 */
export async function getTrasladoActivo(orden_id) {
  const { data, error } = await getSupabaseClient()
    .from("traslados")
    .select("*")
    .eq("orden_id", orden_id)
    .neq("estado", "recibido")
    .order("created_at", { ascending: false })
    .single();

  // PGRST116 = no rows returned — not an error for us
  if (error && error.code === "PGRST116") return null;
  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/traslados.test.js`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/traslados.js lib/__tests__/traslados.test.js
git commit -m "feat: add traslados data layer with CRUD operations"
```

---

### Task 3: Update Order Creation to Set New Columns + Auto-Create Transfer

**Files:**
- Modify: `lib/data.js:63-85` (crearOrden function)

- [ ] **Step 1: Write failing test**

Add to `lib/__tests__/data.test.js` or create new test block:

```javascript
// lib/__tests__/traslados-integration.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ single: mockSingle }));
const mockInsert = vi.fn(() => ({ select: mockSelect }));
const mockFrom = vi.fn(() => ({
  insert: mockInsert,
  select: mockSelect,
  eq: vi.fn().mockReturnValue({ single: mockSingle }),
}));

vi.mock("@/lib/supabase-client", () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

// Mock getCentroReparacion
vi.mock("@/lib/traslados", () => ({
  getCentroReparacion: vi.fn().mockResolvedValue({ id: "centro-id", nombre: "Punta Carretas" }),
  crearTraslado: vi.fn().mockResolvedValue({ id: "t1" }),
}));

describe("crearOrden with traslados", () => {
  it("sets sucursal_recepcion_id and sucursal_retiro_id from sucursal_id", async () => {
    mockSingle.mockResolvedValue({
      data: { id: "o1", sucursal_id: "s1", sucursal_recepcion_id: "s1", sucursal_retiro_id: "s1" },
      error: null,
    });

    const { crearOrden } = await import("@/lib/data");
    const result = await crearOrden({
      cliente_id: "c1",
      tipo_articulo: "Reloj",
      problema_reportado: "Roto",
      sucursal_id: "s1",
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      sucursal_recepcion_id: "s1",
      sucursal_retiro_id: "s1",
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/traslados-integration.test.js`
Expected: FAIL — `crearOrden` doesn't include `sucursal_recepcion_id`

- [ ] **Step 3: Update crearOrden in lib/data.js**

Replace the `crearOrden` function at `lib/data.js:63-85` with:

```javascript
export async function crearOrden({ cliente_id, tipo_articulo, marca, modelo, problema_reportado, notas_internas, monto_presupuesto, moneda, nombre_articulo, tipo_servicio_id, sucursal_id }) {
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
      moneda: moneda || "UYU",
      nombre_articulo: nombre_articulo || null,
      tipo_servicio_id: tipo_servicio_id || null,
      sucursal_id,
      sucursal_recepcion_id: sucursal_id,
      sucursal_retiro_id: sucursal_id,
    })
    .select("*")
    .single();

  if (error) throw error;

  // Auto-create transfer if not received at the repair center
  try {
    const { getCentroReparacion, crearTraslado } = await import("./traslados");
    const centro = await getCentroReparacion();
    if (centro && sucursal_id !== centro.id) {
      await crearTraslado({
        orden_id: orden.id,
        sucursal_origen: sucursal_id,
        sucursal_destino: centro.id,
        tipo: "ida",
      });
    }
  } catch (e) {
    console.error("[Traslado] Error creating auto-transfer:", e);
  }

  return orden;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/traslados-integration.test.js`
Expected: PASS

Also run existing tests to make sure nothing broke:
Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/data.js lib/__tests__/traslados-integration.test.js
git commit -m "feat: set sucursal_recepcion/retiro on order creation, auto-create ida transfer"
```

---

### Task 4: Traslados API Route

**Files:**
- Create: `app/api/traslados/route.js`
- Create: `app/api/traslados/__tests__/route.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// app/api/traslados/__tests__/route.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/traslados", () => ({
  getTraslados: vi.fn(),
  despacharTraslado: vi.fn(),
  recibirTraslado: vi.fn(),
  getTrasladoActivo: vi.fn(),
  crearTraslado: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  getOrden: vi.fn(),
}));

let GET, POST, PATCH;
let auth, trasladosModule, dataModule;

beforeEach(async () => {
  vi.clearAllMocks();
  auth = (await import("@/auth")).auth;
  trasladosModule = await import("@/lib/traslados");
  dataModule = await import("@/lib/data");
  const mod = await import("@/app/api/traslados/route");
  GET = mod.GET;
  POST = mod.POST;
  PATCH = mod.PATCH;
});

describe("GET /api/traslados", () => {
  it("returns 401 when not authenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/traslados"));
    expect(res.status).toBe(401);
  });

  it("returns active traslados", async () => {
    auth.mockResolvedValue({ user: { id: "u1", sucursal_id: "s1" } });
    trasladosModule.getTraslados.mockResolvedValue([{ id: "t1" }]);

    const res = await GET(new Request("http://localhost/api/traslados?sucursal_id=s1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.traslados).toHaveLength(1);
  });
});

describe("PATCH /api/traslados", () => {
  it("dispatches a traslado", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    trasladosModule.despacharTraslado.mockResolvedValue({ id: "t1", estado: "en_transito" });

    const res = await PATCH(new Request("http://localhost/api/traslados", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traslado_id: "t1", accion: "despachar" }),
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.traslado.estado).toBe("en_transito");
  });

  it("receives a traslado", async () => {
    auth.mockResolvedValue({ user: { id: "u2" } });
    trasladosModule.recibirTraslado.mockResolvedValue({ id: "t1", estado: "recibido" });

    const res = await PATCH(new Request("http://localhost/api/traslados", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traslado_id: "t1", accion: "recibir" }),
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.traslado.estado).toBe("recibido");
  });

  it("returns 400 on invalid action", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    const res = await PATCH(new Request("http://localhost/api/traslados", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traslado_id: "t1", accion: "invalid" }),
    }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/traslados/__tests__/route.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the API route**

```javascript
// app/api/traslados/route.js
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTraslados, despacharTraslado, recibirTraslado } from "@/lib/traslados";

export async function GET(request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const sucursal_id = searchParams.get("sucursal_id") || undefined;

    const traslados = await getTraslados({ sucursal_id });
    return NextResponse.json({ traslados });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { traslado_id, accion } = await request.json();

    if (!traslado_id || !["despachar", "recibir"].includes(accion)) {
      return NextResponse.json({ error: "traslado_id y accion (despachar|recibir) requeridos" }, { status: 400 });
    }

    let traslado;
    if (accion === "despachar") {
      traslado = await despacharTraslado(traslado_id);
    } else {
      traslado = await recibirTraslado(traslado_id, session.user?.id);
    }

    return NextResponse.json({ traslado });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/traslados/__tests__/route.test.js`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/traslados/route.js app/api/traslados/__tests__/route.test.js
git commit -m "feat: add traslados API route with despachar/recibir actions"
```

---

### Task 5: Auto-Create Return Transfer on LISTO_PARA_RETIRO

**Files:**
- Modify: `components/DetalleOrdenModal.js` (handleRetiro function, lines 187-206)

- [ ] **Step 1: Update handleRetiro to auto-create return transfer**

In `components/DetalleOrdenModal.js`, update the `handleRetiro` function (currently at line 187) to create a return transfer after changing state:

```javascript
  async function handleRetiro() {
    setLoading(true);
    setError(null);
    try {
      await cambiarEstado(orden.id, "LISTO_PARA_RETIRO");

      // Auto-create return transfer if pickup branch differs from current location
      if (orden.sucursal_retiro_id && orden.sucursal_id && orden.sucursal_retiro_id !== orden.sucursal_id) {
        try {
          const res = await fetch("/api/traslados/retorno", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orden_id: orden.id }),
          });
          if (!res.ok) console.error("[Traslado] Error creating return transfer");
        } catch (e) {
          console.error("[Traslado] Error creating return transfer:", e);
        }
      }

      if (notificarRetiro && orden.cliente_email) {
        try {
          await triggerNotify("LISTO_PARA_RETIRO");
        } catch (e) {
          console.error("[Notify] Error al enviar listo para retiro:", e);
        }
      }
      onUpdated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
```

- [ ] **Step 2: Add the retorno API endpoint**

Create `app/api/traslados/retorno/route.js`:

```javascript
// app/api/traslados/retorno/route.js
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { crearTraslado } from "@/lib/traslados";
import { getOrden } from "@/lib/data";

export async function POST(request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { orden_id } = await request.json();
    if (!orden_id) {
      return NextResponse.json({ error: "orden_id requerido" }, { status: 400 });
    }

    const orden = await getOrden(orden_id);
    if (!orden) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    // Only create return transfer if pickup branch differs from current location
    if (orden.sucursal_retiro_id === orden.sucursal_id) {
      return NextResponse.json({ message: "No transfer needed" }, { status: 200 });
    }

    const traslado = await crearTraslado({
      orden_id,
      sucursal_origen: orden.sucursal_id,
      sucursal_destino: orden.sucursal_retiro_id,
      tipo: "retorno",
      creado_por: session.user?.id,
    });

    return NextResponse.json({ traslado });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify the app compiles**

Run: `npx next build` or `npx next lint`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add components/DetalleOrdenModal.js app/api/traslados/retorno/route.js
git commit -m "feat: auto-create return transfer when LISTO_PARA_RETIRO and pickup differs"
```

---

### Task 6: State Transition Blocking

**Files:**
- Modify: `components/DetalleOrdenModal.js` (transition buttons area, lines 483-510)

- [ ] **Step 1: Add blocking logic to DetalleOrdenModal**

At the top of the component, after the existing state declarations (around line 28), add:

```javascript
  const trasladoActivo = orden.traslado_activo_id ? {
    id: orden.traslado_activo_id,
    tipo: orden.traslado_activo_tipo,
    estado: orden.traslado_activo_estado,
  } : null;

  // Block state transitions when there's an active transfer
  const bloqueadoPorTraslado = trasladoActivo && (
    // Block advancing beyond INGRESADO if ida transfer is pending/in transit
    (trasladoActivo.tipo === "ida" && ["pendiente", "en_transito"].includes(trasladoActivo.estado)) ||
    // Block ENTREGADO if retorno transfer is pending/in transit
    (trasladoActivo.tipo === "retorno" && ["pendiente", "en_transito"].includes(trasladoActivo.estado))
  );

  const estadosBloqueados = [];
  if (trasladoActivo?.tipo === "ida" && trasladoActivo.estado !== "recibido") {
    // Block ALL transitions (nothing beyond INGRESADO)
    estadosBloqueados.push(...Object.keys(ESTADOS));
  }
  if (trasladoActivo?.tipo === "retorno" && trasladoActivo.estado !== "recibido") {
    estadosBloqueados.push("ENTREGADO");
  }
```

Then modify the transition buttons section (around line 484) to filter out blocked states and show a warning:

Replace the entire generic transitions block (lines 483-510) with:

```javascript
          {/* Traslado blocking alert */}
          {bloqueadoPorTraslado && (
            <div className="p-3 rounded-lg text-sm border bg-blue-50 border-blue-200 text-blue-800">
              {trasladoActivo.tipo === "ida"
                ? "📦 Esta orden tiene un traslado pendiente. No se puede avanzar hasta que llegue al centro de reparación."
                : "📦 Esta orden tiene un traslado de retorno pendiente. No se puede entregar hasta que llegue a la sucursal de retiro."}
            </div>
          )}

          {/* Transiciones genéricas (todos los estados excepto ESPERANDO_APROBACION) */}
          {orden.estado !== "ESPERANDO_APROBACION" && siguientes.length > 0 && !showAsignar && !showPresupuesto && !showEntrega && !showRetiro && (
            <div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
                Cambiar estado
              </div>
              <div className="flex flex-wrap gap-2">
                {siguientes
                  .filter((s) => !estadosBloqueados.includes(s))
                  .map((s) => {
                    const next = ESTADOS[s];
                    return (
                      <button
                        key={s}
                        onClick={() => handleCambiarEstado(s)}
                        disabled={loading}
                        className="px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors hover:opacity-80 disabled:opacity-50"
                        style={{
                          borderColor: next.color,
                          backgroundColor: next.bg,
                          color: next.color,
                        }}
                      >
                        {next.icon} {orden.estado === "INGRESADO" && s === "ESPERANDO_APROBACION" ? "Presupuestar en local" : next.label}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
```

- [ ] **Step 2: Verify the modal renders correctly**

Run the dev server: `npx next dev`
1. Open an order that has no active traslado → transitions show as before
2. Create an order at Nuevo Centro → verify buttons are blocked with the blue alert

- [ ] **Step 3: Commit**

```bash
git add components/DetalleOrdenModal.js
git commit -m "feat: block state transitions when active traslado exists"
```

---

### Task 7: TrasladosBadge Component

**Files:**
- Create: `components/TrasladosBadge.js`

- [ ] **Step 1: Create the badge component**

```javascript
// components/TrasladosBadge.js
"use client";

const TRASLADO_BADGE = {
  pendiente: {
    label: "Pendiente despacho",
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    icon: "📦",
  },
  en_transito: {
    label: "En tránsito",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    icon: "🚚",
  },
};

export function TrasladosBadge({ tipo, estado }) {
  if (!estado || estado === "recibido") return null;

  const config = TRASLADO_BADGE[estado];
  if (!config) return null;

  const suffix = tipo === "retorno" ? " (retorno)" : "";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${config.bg} ${config.border} ${config.text}`}
    >
      {config.icon} {config.label}{suffix}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/TrasladosBadge.js
git commit -m "feat: add TrasladosBadge component"
```

---

### Task 8: TrasladosPanel Component

**Files:**
- Create: `components/TrasladosPanel.js`

- [ ] **Step 1: Create the traslados panel component**

```javascript
// components/TrasladosPanel.js
"use client";

import { useState, useEffect, useCallback } from "react";
import { formatNumeroOrden, formatFechaHora } from "@/lib/constants";

export function TrasladosPanel({ sucursalId, isDueno }) {
  const [traslados, setTraslados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);

  const loadTraslados = useCallback(async () => {
    try {
      const url = sucursalId
        ? `/api/traslados?sucursal_id=${sucursalId}`
        : "/api/traslados";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error cargando traslados");
      const data = await res.json();
      setTraslados(data.traslados || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sucursalId]);

  useEffect(() => {
    loadTraslados();
  }, [loadTraslados]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(loadTraslados, 30000);
    return () => clearInterval(interval);
  }, [loadTraslados]);

  async function handleAction(traslado_id, accion) {
    setActionLoading(traslado_id);
    setError(null);
    try {
      const res = await fetch("/api/traslados", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traslado_id, accion }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error");
      }
      await loadTraslados();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) return null;
  if (traslados.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">🚚</span>
        <h3 className="text-sm font-bold text-slate-900">Traslados Activos</h3>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
          {traslados.length}
        </span>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>
      )}

      <div className="space-y-2">
        {traslados.map((t) => {
          const orden = t.ordenes;
          const cliente = orden?.clientes;
          const tipoLabel = t.tipo === "ida" ? "Ida" : "Retorno";
          const estadoLabel = t.estado === "pendiente" ? "Pendiente despacho" : "En tránsito";
          const estadoColor = t.estado === "pendiente" ? "text-orange-600" : "text-blue-600";
          const estadoIcon = t.estado === "pendiente" ? "📦" : "🚚";

          return (
            <div
              key={t.id}
              className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold font-mono text-slate-900">
                    #{formatNumeroOrden(orden?.numero_orden)}
                  </span>
                  <span className={`text-[10px] font-semibold ${estadoColor}`}>
                    {estadoIcon} {estadoLabel}
                  </span>
                  <span className="text-[10px] text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded">
                    {tipoLabel}
                  </span>
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  {cliente?.nombre} — {orden?.tipo_articulo} {orden?.marca ? `(${orden.marca})` : ""}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Creado: {formatFechaHora(t.created_at)}
                  {t.fecha_salida && ` | Despachado: ${formatFechaHora(t.fecha_salida)}`}
                </div>
              </div>

              <div className="flex-shrink-0">
                {t.estado === "pendiente" && (
                  <button
                    onClick={() => handleAction(t.id, "despachar")}
                    disabled={actionLoading === t.id}
                    className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600 disabled:opacity-50"
                  >
                    {actionLoading === t.id ? "..." : "Despachar"}
                  </button>
                )}
                {t.estado === "en_transito" && (
                  <button
                    onClick={() => handleAction(t.id, "recibir")}
                    disabled={actionLoading === t.id}
                    className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-semibold hover:bg-blue-600 disabled:opacity-50"
                  >
                    {actionLoading === t.id ? "..." : "Recibir"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/TrasladosPanel.js
git commit -m "feat: add TrasladosPanel component for active transfers"
```

---

### Task 9: Integrate into Dashboard

**Files:**
- Modify: `app/page.js`

- [ ] **Step 1: Add imports to app/page.js**

At the top of `app/page.js`, after the existing imports (line 14), add:

```javascript
import { TrasladosBadge } from "@/components/TrasladosBadge"
import { TrasladosPanel } from "@/components/TrasladosPanel"
```

- [ ] **Step 2: Add TrasladosPanel to the dashboard**

In `app/page.js`, after the stats section (after line 167, before the filters), add:

```javascript
        {/* Traslados activos */}
        <TrasladosPanel
          sucursalId={isDueno ? (filtroSucursal === "TODAS" ? undefined : filtroSucursal) : session?.user?.sucursal_id}
          isDueno={isDueno}
        />
```

- [ ] **Step 3: Add TrasladosBadge to table view**

In the table body (around line 288, after the `<Badge estado={o.estado} />` line), add the traslado badge:

```javascript
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge estado={o.estado} />
                          {o.traslado_activo_id && (
                            <TrasladosBadge tipo={o.traslado_activo_tipo} estado={o.traslado_activo_estado} />
                          )}
                        </div>
                      </td>
```

- [ ] **Step 4: Add TrasladosBadge to kanban view**

In the kanban card (around line 432, after the retraso indicator), add:

```javascript
                          {o.traslado_activo_id && (
                            <div className="mt-1">
                              <TrasladosBadge tipo={o.traslado_activo_tipo} estado={o.traslado_activo_estado} />
                            </div>
                          )}
```

- [ ] **Step 5: Verify the dashboard renders correctly**

Run: `npx next dev`
1. Dashboard loads without errors
2. TrasladosPanel shows when there are active transfers
3. Badges appear on orders with active transfers in both table and kanban views

- [ ] **Step 6: Commit**

```bash
git add app/page.js
git commit -m "feat: integrate TrasladosPanel and TrasladosBadge into dashboard"
```

---

### Task 10: Traslados History in Order Detail + Sucursal de Retiro

**Files:**
- Modify: `components/DetalleOrdenModal.js`

- [ ] **Step 1: Add traslados imports and state**

At the top of `DetalleOrdenModal.js`, add import:

```javascript
import { getTrasladosByOrden } from "@/lib/traslados";
import { TrasladosBadge } from "./TrasladosBadge";
```

Inside the component, add state (after line 25):

```javascript
  const [trasladosHistorial, setTrasladosHistorial] = useState([]);
  const [sucursales, setSucursalesState] = useState([]);
  const [editingRetiro, setEditingRetiro] = useState(false);
  const [retiroId, setRetiroId] = useState(orden.sucursal_retiro_id || "");
```

- [ ] **Step 2: Load traslados and sucursales in loadData**

Update the `loadData` function (currently at line 34) to also fetch traslados and sucursales:

```javascript
  async function loadData() {
    try {
      const [h, t, pRes, trasladosData, sucursalesRes] = await Promise.all([
        getHistorial(orden.id),
        getTalleres(),
        fetch("/api/admin/plantillas-email").then(r => r.ok ? r.json() : Promise.resolve({ plantillas: [] })),
        getTrasladosByOrden(orden.id),
        fetch("/api/admin/sucursales").then(r => r.ok ? r.json() : Promise.resolve({ sucursales: [] })),
      ]);
      setHistorial(h);
      setTalleresState(t);
      const map = {};
      (pRes.plantillas || []).forEach(p => { map[p.tipo] = p.cuerpo; });
      setPlantillas(map);
      setTrasladosHistorial(trasladosData);
      setSucursalesState(sucursalesRes.sucursales || []);
    } catch (e) {
      console.error(e);
    }
  }
```

- [ ] **Step 3: Add sucursal de retiro dropdown**

After the "Estado actual" section (after line 310), add sucursal info and retiro selector:

```javascript
          {/* Sucursales info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-3 rounded-lg">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Recepción</div>
              <div className="text-sm font-semibold text-slate-900">
                {orden.sucursal_recepcion_nombre || orden.sucursal_nombre}
              </div>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Retiro</div>
              {!editingRetiro ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {orden.sucursal_retiro_nombre || orden.sucursal_nombre}
                  </span>
                  {orden.estado !== "ENTREGADO" && (
                    <button
                      onClick={() => setEditingRetiro(true)}
                      className="text-[10px] text-indigo-500 hover:text-indigo-700"
                    >
                      Cambiar
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <select
                    value={retiroId}
                    onChange={(e) => setRetiroId(e.target.value)}
                    className="flex-1 px-2 py-1 border rounded text-xs"
                  >
                    {sucursales.filter(s => s.activo).map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                  <button
                    onClick={async () => {
                      try {
                        const { getSupabaseClient } = await import("@/lib/supabase-client");
                        await getSupabaseClient()
                          .from("ordenes")
                          .update({ sucursal_retiro_id: retiroId })
                          .eq("id", orden.id);
                        setEditingRetiro(false);
                        onUpdated();
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                    className="px-2 py-1 bg-indigo-500 text-white rounded text-[10px] font-semibold"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => { setEditingRetiro(false); setRetiroId(orden.sucursal_retiro_id || ""); }}
                    className="px-2 py-1 border rounded text-[10px]"
                  >
                    X
                  </button>
                </div>
              )}
            </div>
          </div>
```

- [ ] **Step 4: Add traslados historial section**

Before the state historial section (before line 546), add:

```javascript
          {/* Traslados historial */}
          {trasladosHistorial.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
                Traslados
              </div>
              <div className="space-y-1.5">
                {trasladosHistorial.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 w-24 flex-shrink-0">{formatFechaHora(t.created_at)}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">
                      {t.tipo === "ida" ? "Ida" : "Retorno"}
                    </span>
                    <TrasladosBadge tipo={t.tipo} estado={t.estado} />
                    {t.estado === "recibido" && t.fecha_recepcion && (
                      <span className="text-slate-400">
                        Recibido: {formatFechaHora(t.fecha_recepcion)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
```

- [ ] **Step 5: Verify the detail modal**

Run: `npx next dev`
1. Open an order detail → see sucursal recepcion/retiro info
2. Click "Cambiar" on retiro → dropdown appears, can change and save
3. If order has traslados → history shows with correct badges

- [ ] **Step 6: Commit**

```bash
git add components/DetalleOrdenModal.js
git commit -m "feat: add traslados history and sucursal de retiro to order detail"
```

---

### Task 11: Update Sucursal Retiro in Data Layer

**Files:**
- Modify: `lib/data.js` (add updateSucursalRetiro function)

- [ ] **Step 1: Add the function to lib/data.js**

At the end of the ÓRDENES section (after `deleteOrden`, around line 133), add:

```javascript
export async function updateSucursalRetiro(orden_id, sucursal_retiro_id) {
  const { data, error } = await getSupabaseClient()
    .from("ordenes")
    .update({ sucursal_retiro_id })
    .eq("id", orden_id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Update DetalleOrdenModal to use it**

In `components/DetalleOrdenModal.js`, replace the inline supabase call in the retiro edit button's onClick handler with:

```javascript
import { cambiarEstado, asignarTaller, registrarPresupuesto, entregarAlCliente, getHistorial, getTalleres, deleteOrden, aprobarPresupuesto, rechazarPresupuesto, updateSucursalRetiro } from "@/lib/data";
```

And replace the onClick handler:

```javascript
                    onClick={async () => {
                      try {
                        await updateSucursalRetiro(orden.id, retiroId);
                        setEditingRetiro(false);
                        onUpdated();
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add lib/data.js components/DetalleOrdenModal.js
git commit -m "feat: add updateSucursalRetiro to data layer, clean up modal import"
```

---

### Task 12: Final Integration Test

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Manual smoke test**

Run: `npx next dev`

Test the complete flow:
1. **Create order at Nuevo Centro** (as a Nuevo Centro employee or admin selecting Nuevo Centro):
   - Order is created with estado INGRESADO
   - TrasladosPanel shows new "ida" traslado as "Pendiente despacho"
   - Order in table/kanban shows orange "Pendiente despacho" badge
   - Order detail shows transition buttons are blocked with blue alert

2. **Dispatch the transfer**:
   - Click "Despachar" in TrasladosPanel
   - Badge changes to "En tránsito"
   - Order detail still shows blocked alert

3. **Receive the transfer** (as Punta Carretas employee):
   - Click "Recibir" in TrasladosPanel
   - Badge disappears
   - Order detail shows normal transition buttons
   - Order's sucursal_id has been updated to Punta Carretas

4. **Progress through repair flow** normally (EN_TALLER → etc → LISTO_PARA_RETIRO):
   - Since sucursal_retiro_id = Nuevo Centro and current location = Punta Carretas, return transfer is auto-created

5. **Dispatch and receive return transfer**:
   - After receiving, order can be marked as ENTREGADO

6. **Change sucursal de retiro** in order detail:
   - Click "Cambiar", select different branch, save

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: integration test fixes for traslados feature"
```
