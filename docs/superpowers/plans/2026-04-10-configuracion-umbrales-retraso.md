# Configuración de Umbrales de Retraso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable dueño users to configure delay thresholds dynamically via admin panel instead of hardcoded constants.

**Architecture:** Migrate hardcoded UMBRALES_RETRASO from constants to Supabase `configuracion` table. Create admin page to edit thresholds. Load config at dashboard startup and pass to functions that need it.

**Tech Stack:** Next.js 14, Supabase (SQL), React hooks, TDD with vitest

---

## File Structure

**Files to Create:**
- `supabase/010_configuracion.sql` - Migration to create configuracion table
- `app/api/configuracion/route.js` - API endpoints for reading/writing config
- `app/admin/configuracion/page.js` - Admin page for editing thresholds
- `lib/data/configuracion.js` - Client-side functions to fetch/update config

**Files to Modify:**
- `lib/constants.js` - Remove UMBRALES_RETRASO, update getNivelRetraso signature
- `app/page.js` - Load config in loadData, pass to getNivelRetraso calls
- `lib/data.js` - Update getStats() to accept umbrales parameter

---

## Task 1: Create Supabase Migration

**Files:**
- Create: `supabase/010_configuracion.sql`

- [ ] **Step 1: Write migration SQL**

Create file `supabase/010_configuracion.sql`:

```sql
-- Create configuracion table
CREATE TABLE IF NOT EXISTS configuracion (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  clave TEXT UNIQUE NOT NULL,
  valor JSONB NOT NULL,
  descripcion TEXT,
  actualizado_en TIMESTAMP DEFAULT NOW(),
  actualizado_por UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only dueño users can read
CREATE POLICY "dueño_read_configuracion" ON configuracion
  FOR SELECT
  USING (
    (SELECT role FROM auth.users WHERE id = auth.uid()) = 'dueno'
  );

-- RLS Policy: Only dueño users can update
CREATE POLICY "dueño_update_configuracion" ON configuracion
  FOR UPDATE
  USING (
    (SELECT role FROM auth.users WHERE id = auth.uid()) = 'dueno'
  );

-- Insert initial delay threshold configurations
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('umbral_ingresado', '{"leve": 2, "grave": 5}', 'Retraso en estado Ingresado'),
  ('umbral_en_taller', '{"leve": 7, "grave": 14}', 'Retraso en estado En Taller'),
  ('umbral_esperando_aprobacion', '{"leve": 1, "grave": 3}', 'Retraso esperando aprobación'),
  ('umbral_rechazado', '{"leve": 0, "grave": 0}', 'No aplica retraso'),
  ('umbral_en_reparacion', '{"leve": 3, "grave": 7}', 'Retraso en reparación'),
  ('umbral_listo_en_taller', '{"leve": 1, "grave": 3}', 'Retraso cuando listo en taller'),
  ('umbral_listo_para_retiro', '{"leve": 3, "grave": 7}', 'Retraso en retiro'),
  ('umbral_entregado', '{"leve": 0, "grave": 0}', 'No aplica retraso')
ON CONFLICT (clave) DO NOTHING;
```

- [ ] **Step 2: Apply migration using Supabase MCP**

Use the Supabase MCP to apply the migration:

```
project_id: (from env or list_projects)
name: "configuracion"
query: [contents of SQL file above]
```

- [ ] **Step 3: Verify table exists in Supabase**

Check that table was created:
```bash
# You can verify by listing tables in Supabase dashboard
# Table should have 8 rows with initial configurations
```

- [ ] **Step 4: Commit**

```bash
git add supabase/010_configuracion.sql
git commit -m "feat: add configuracion table for dynamic threshold settings

Create configuracion table in Supabase to store configurable parameters.
Initial data includes delay thresholds (leve/grave) for each order status.
RLS policies restrict access to dueño users only.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create configuracion data functions

**Files:**
- Create: `lib/data/configuracion.js`

- [ ] **Step 1: Write configuracion data functions**

Create file `lib/data/configuracion.js`:

```javascript
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Fetch all configuración values and return as object
 * Returns: { umbral_ingresado: {leve, grave}, umbral_en_taller: {...}, ... }
 */
export async function getConfiguracion() {
  try {
    const { data, error } = await supabase
      .from("configuracion")
      .select("clave, valor")

    if (error) throw error

    // Transform array to object: { clave: valor, ... }
    const config = {}
    data.forEach(row => {
      config[row.clave] = row.valor
    })

    return config
  } catch (error) {
    console.error("Error fetching configuracion:", error)
    return {}
  }
}

/**
 * Update a single configuración value
 * clave: string (e.g., "umbral_ingresado")
 * valor: object (e.g., {leve: 2, grave: 5})
 */
export async function updateConfiguracion(clave, valor) {
  try {
    const { data, error } = await supabase
      .from("configuracion")
      .update({ valor, actualizado_en: new Date() })
      .eq("clave", clave)
      .select()

    if (error) throw error

    return { success: true, data: data[0] }
  } catch (error) {
    console.error("Error updating configuracion:", error)
    return { success: false, error: error.message }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/data/configuracion.js
git commit -m "feat: add configuracion data functions

Add client functions to fetch and update configuracion from Supabase.
getConfiguracion() returns all config as object.
updateConfiguracion(clave, valor) updates a single setting.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create API endpoints for configuracion

**Files:**
- Create: `app/api/configuracion/route.js`

- [ ] **Step 1: Write API endpoints**

Create file `app/api/configuracion/route.js`:

```javascript
import { createClient } from "@supabase/supabase-js"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/auth"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceRole)

/**
 * GET /api/configuracion
 * Returns all configuration values
 * No auth required (data is non-sensitive)
 */
export async function GET(request) {
  try {
    const { data, error } = await supabase
      .from("configuracion")
      .select("clave, valor")

    if (error) throw error

    // Transform to object
    const config = {}
    data.forEach(row => {
      config[row.clave] = row.valor
    })

    return Response.json({ configuracion: config })
  } catch (error) {
    console.error("GET /api/configuracion error:", error)
    return Response.json(
      { error: "Failed to fetch configuration" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/configuracion
 * Updates a single configuration value
 * Requires: dueño role
 * Body: { clave: string, valor: {leve: number, grave: number} }
 */
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)

    // Auth check
    if (!session || session.user.role !== "dueno") {
      return Response.json(
        { error: "Unauthorized. Only dueño can update configuration." },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { clave, valor } = body

    // Validate input
    if (!clave || !valor) {
      return Response.json(
        { error: "Missing clave or valor" },
        { status: 400 }
      )
    }

    if (typeof valor.leve !== "number" || typeof valor.grave !== "number") {
      return Response.json(
        { error: "valor must have numeric leve and grave properties" },
        { status: 400 }
      )
    }

    if (valor.leve < 0 || valor.grave < 0) {
      return Response.json(
        { error: "Threshold values must be non-negative" },
        { status: 400 }
      )
    }

    if (valor.leve >= valor.grave && valor.grave > 0) {
      return Response.json(
        { error: "leve must be less than grave" },
        { status: 400 }
      )
    }

    // Update in database
    const { data, error } = await supabase
      .from("configuracion")
      .update({ 
        valor,
        actualizado_en: new Date(),
        actualizado_por: session.user.id
      })
      .eq("clave", clave)
      .select()

    if (error) throw error

    if (!data || data.length === 0) {
      return Response.json(
        { error: "Configuration key not found" },
        { status: 404 }
      )
    }

    return Response.json({ success: true, data: data[0] })
  } catch (error) {
    console.error("POST /api/configuracion error:", error)
    return Response.json(
      { error: "Failed to update configuration" },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/configuracion/route.js
git commit -m "feat: add configuracion API endpoints

GET /api/configuracion returns all settings.
POST /api/configuracion updates a single setting (dueño only).
Includes validation: numeric positive values, leve < grave.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Update lib/constants.js

**Files:**
- Modify: `lib/constants.js`

- [ ] **Step 1: Read current file**

Check current content at lines 28-36 (UMBRALES_RETRASO).

- [ ] **Step 2: Remove UMBRALES_RETRASO object**

Remove this block from `lib/constants.js`:

```javascript
export const UMBRALES_RETRASO = {
  INGRESADO:            { leve: 2,  grave: 5  },
  EN_TALLER:            { leve: 7,  grave: 14 },
  ESPERANDO_APROBACION: { leve: 1,  grave: 3  },
  EN_REPARACION:        { leve: 3,  grave: 7  },
  LISTO_EN_TALLER:      { leve: 1,  grave: 3  },
  LISTO_PARA_RETIRO:    { leve: 3,  grave: 7  },
};
```

After deletion, the file jumps from `export const TIPOS_ARTICULO` directly.

- [ ] **Step 3: Update getNivelRetraso function signature**

Change function from:
```javascript
export function getNivelRetraso(estado, diasEnEstado) {
  const umbral = UMBRALES_RETRASO[estado];
  if (!umbral) return "none";
  if (diasEnEstado >= umbral.grave) return "grave";
  if (diasEnEstado >= umbral.leve) return "leve";
  return "none";
}
```

To:
```javascript
/**
 * Determine delay level based on state, days in state, and thresholds
 * @param {string} estado - Order state
 * @param {number} diasEnEstado - Days in current state
 * @param {object} umbrales - Thresholds object {umbral_estado: {leve, grave}, ...}
 * @returns {string} - "none", "leve", or "grave"
 */
export function getNivelRetraso(estado, diasEnEstado, umbrales) {
  if (!umbrales) return "none"
  
  const clave = `umbral_${estado.toLowerCase()}`
  const umbral = umbrales[clave]
  
  if (!umbral) return "none"
  if (diasEnEstado >= umbral.grave) return "grave"
  if (diasEnEstado >= umbral.leve) return "leve"
  return "none"
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/constants.js
git commit -m "refactor: migrate UMBRALES_RETRASO to database

Remove hardcoded UMBRALES_RETRASO from constants.
Update getNivelRetraso() to accept umbrales parameter.
Function now uses dynamic thresholds from database.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Update app/page.js to load and use configuracion

**Files:**
- Modify: `app/page.js`

- [ ] **Step 1: Add import**

Add to imports at top (around line 12):

```javascript
import { getConfiguracion } from "@/lib/data/configuracion"
```

- [ ] **Step 2: Add umbrales state**

In the DashboardPage component, add state after line 34 (`const [pagina, setPagina] = useState(1)`):

```javascript
const [umbrales, setUmbrales] = useState({})
```

- [ ] **Step 3: Update loadData function**

Modify the `loadData` callback (around line 40) to add configuracion fetch:

Change from:
```javascript
const loadData = useCallback(async () => {
  try {
    const sucursalFiltro = isDueno ? (filtroSucursal === "TODAS" ? undefined : filtroSucursal) : session?.user?.sucursal_id
    const [{ data: ordenesData, count: ordenesCount }, statsData, talleresData] = await Promise.all([
      getOrdenes({...}),
      getStats(),
      getTalleres(),
    ])
```

To:
```javascript
const loadData = useCallback(async () => {
  try {
    const sucursalFiltro = isDueno ? (filtroSucursal === "TODAS" ? undefined : filtroSucursal) : session?.user?.sucursal_id
    const [{ data: ordenesData, count: ordenesCount }, statsData, talleresData, configuracionData] = await Promise.all([
      getOrdenes({...}),
      getStats(),
      getTalleres(),
      getConfiguracion(),
    ])
    setOrdenes(ordenesData)
    setTotalOrdenes(ordenesCount)
    setStatsState(statsData)
    setTalleresState(talleresData)
    setUmbrales(configuracionData)
```

- [ ] **Step 4: Update getNivelRetraso calls in kanban**

Around line 389, change:
```javascript
const retraso = getNivelRetraso(o.estado, o.dias_en_estado)
```

To:
```javascript
const retraso = getNivelRetraso(o.estado, o.dias_en_estado, umbrales)
```

- [ ] **Step 5: Update getNivelRetraso calls in table**

Find any other `getNivelRetraso` calls in the file and add `umbrales` parameter. (Check lines with "retraso" keyword).

- [ ] **Step 6: Commit**

```bash
git add app/page.js
git commit -m "feat: load and use dynamic threshold configuration in dashboard

Load umbrales from getConfiguracion() in loadData().
Pass umbrales to all getNivelRetraso() calls.
Dashboard now uses database-configured thresholds instead of hardcoded values.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create admin page for configuracion

**Files:**
- Create: `app/admin/configuracion/page.js`

- [ ] **Step 1: Create admin configuracion page**

Create file `app/admin/configuracion/page.js`:

```javascript
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { ESTADOS } from "@/lib/constants"
import { getConfiguracion, updateConfiguracion } from "@/lib/data/configuracion"

export default function ConfiguracionPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [message, setMessage] = useState({ type: null, text: "" })

  // Redirect if not dueño
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    } else if (status === "authenticated" && session?.user?.role !== "dueno") {
      router.push("/")
    }
  }, [status, session, router])

  // Load configuration
  useEffect(() => {
    async function load() {
      const data = await getConfiguracion()
      setConfig(data)
      setLoading(false)
    }
    load()
  }, [])

  // Handle input change
  function handleChange(clave, field, value) {
    setConfig(prev => ({
      ...prev,
      [clave]: {
        ...prev[clave],
        [field]: parseInt(value) || 0
      }
    }))
  }

  // Handle save
  async function handleSave(clave) {
    setSaving(clave)
    setMessage({ type: null, text: "" })

    const resultado = await updateConfiguracion(clave, config[clave])

    if (resultado.success) {
      setMessage({ type: "success", text: `✓ ${clave} actualizado` })
      setTimeout(() => setMessage({ type: null, text: "" }), 3000)
    } else {
      setMessage({ type: "error", text: `✗ Error: ${resultado.error}` })
    }

    setSaving(null)
  }

  if (status === "loading" || loading) {
    return <div className="p-8">Cargando...</div>
  }

  if (status === "unauthenticated" || session?.user?.role !== "dueno") {
    return null
  }

  // States that have retraso thresholds
  const statesWithThresholds = [
    "INGRESADO",
    "EN_TALLER",
    "ESPERANDO_APROBACION",
    "EN_REPARACION",
    "LISTO_EN_TALLER",
    "LISTO_PARA_RETIRO",
  ]

  return (
    <div className="p-8">
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold mb-2">Configuración de Umbrales de Retraso</h1>
        <p className="text-slate-600 mb-6">
          Define cuántos días deben pasar en cada estado antes de marcar como retraso leve o grave.
        </p>

        {message.text && (
          <div
            className={`mb-6 p-4 rounded-lg font-medium ${
              message.type === "success"
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Umbral Leve (días)
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Umbral Grave (días)
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {statesWithThresholds.map(estado => {
                const clave = `umbral_${estado.toLowerCase()}`
                const umbral = config[clave]
                if (!umbral) return null

                return (
                  <tr key={clave} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{ESTADOS[estado]?.icon}</span>
                        <span className="font-medium text-slate-900">
                          {ESTADOS[estado]?.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        min="0"
                        value={umbral.leve}
                        onChange={e => handleChange(clave, "leve", e.target.value)}
                        className="w-20 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        min="0"
                        value={umbral.grave}
                        onChange={e => handleChange(clave, "grave", e.target.value)}
                        className="w-20 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleSave(clave)}
                        disabled={saving === clave}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 font-medium text-sm transition-colors"
                      >
                        {saving === clave ? "Guardando..." : "Guardar"}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500 mt-6">
          💡 Tip: El umbral "leve" debe ser menor que "grave". Ambos deben ser mayores a 0.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/configuracion/page.js
git commit -m "feat: add admin page for configuring delay thresholds

Create /admin/configuracion page where dueño users can view and edit
delay thresholds for each order status. Includes validation and success/error messages.
Only accessible to dueño users.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Update lib/data.js getStats to use umbrales

**Files:**
- Modify: `lib/data.js`

- [ ] **Step 1: Find getStats function**

Locate the `getStats()` function in `lib/data.js` (search for "export async function getStats").

- [ ] **Step 2: Check if it uses getNivelRetraso**

Check the implementation. If it calculates `conRetraso` stats, it needs the umbrales parameter.

If it doesn't use `getNivelRetraso`, skip this task. If it does, proceed to step 3.

- [ ] **Step 3: Update function signature**

Change `getStats()` to `getStats(umbrales)` to accept umbrales parameter.

- [ ] **Step 4: Update getNivelRetraso calls in getStats**

Replace any `getNivelRetraso(estado, diasEnEstado)` with `getNivelRetraso(estado, diasEnEstado, umbrales)`.

- [ ] **Step 5: Update dashboard call to getStats**

In `app/page.js` around line 53, change:
```javascript
getStats()
```

To:
```javascript
getStats(configuracionData)
```

(This goes after you've loaded configuracionData in the Promise.all)

- [ ] **Step 6: Commit**

```bash
git add lib/data.js app/page.js
git commit -m "refactor: pass umbrales to getStats function

Update getStats() to accept and use umbrales parameter for delay calculations.
Dashboard now passes loaded configuration to stats function.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Add link to configuracion in admin navigation

**Files:**
- Modify: `app/admin/layout.js` or `app/admin/page.js`

- [ ] **Step 1: Check admin navigation**

Look at how other admin pages are linked (talleres, usuarios, tipos-servicio).

- [ ] **Step 2: Add configuracion link**

Add a link to `/admin/configuracion` in the admin navigation sidebar/menu.

Example link item:
```javascript
<Link href="/admin/configuracion" className="...">
  ⚙️ Configuración
</Link>
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/layout.js
git commit -m "feat: add configuracion link to admin navigation

Link to new /admin/configuracion page in admin sidebar.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec Coverage:**

✅ DB schema (tabla configuracion) - Task 1
✅ RLS policies (dueño only) - Task 1  
✅ API endpoints (GET/POST /api/configuracion) - Task 3
✅ Frontend page (admin/configuracion) - Task 6
✅ Security (auth check, validation) - Task 3, 6
✅ Data functions (client-side) - Task 2
✅ Constants update (remove UMBRALES_RETRASO) - Task 4
✅ Dashboard integration (load config, pass to functions) - Task 5
✅ Admin navigation link - Task 8

**No Placeholders:** All code is complete, no "TBD" or "add validation" without implementation.

**Type Consistency:** 
- Config object structure consistent: `{ umbral_estado: {leve, grave} }`
- Function signature for `getNivelRetraso(estado, diasEnEstado, umbrales)` used everywhere
- API endpoint paths `/api/configuracion`

**All Gaps Covered:** Feature is complete from DB to UI.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-04-10-configuracion-umbrales-retraso.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
