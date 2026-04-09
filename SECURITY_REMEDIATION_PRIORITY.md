# Security Remediation - Priority & Implementation Guide

## Phase 1: CRITICAL (Do Not Deploy Without These)
**Estimated Time:** 4-6 hours  
**Blocker for Production:** YES

### Issue #1: Missing Authorization on Delete Operations
**Status:** MUST FIX FIRST  
**Effort:** 2-3 hours

**Current Problem:**
- Delete operations only checked on client-side
- `deleteOrden()` in lib/data.js has NO authorization
- Employee can delete any order or orders from other branches

**Quick Win Implementation:**
```javascript
// Create: app/api/ordenes/[id]/delete/route.js
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function POST(request, { params }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  
  // Get order details
  const { data: orden } = await getSupabaseAdmin()
    .from("ordenes")
    .select("id, estado, sucursal_id")
    .eq("id", id)
    .single();

  if (!orden) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Authorization check
  const isDueno = session.user.role === "dueno";
  const canDelete = isDueno || 
    (session.user.role === "empleado" && 
     orden.estado === "INGRESADO" && 
     orden.sucursal_id === session.user.sucursal_id);

  if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Perform soft delete
  const { error } = await getSupabaseAdmin()
    .from("ordenes")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: session.user.id,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

**Update Component:**
```javascript
// In components/DetalleOrdenModal.js handleDelete:
async function handleDelete() {
  setLoading(true);
  setError(null);
  try {
    const response = await fetch(`/api/ordenes/${orden.id}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error(await response.text());
    onUpdated();
    onClose();
  } catch (e) {
    setError(e.message);
    setShowConfirmDelete(false);
  } finally {
    setLoading(false);
  }
}
```

**Verification:**
```bash
# Test 1: Employee tries to delete order from other branch
curl -X POST http://localhost:3000/api/ordenes/other-branch-order-id/delete \
  -H "Authorization: Bearer $TOKEN" \
  # Expected: 403 Forbidden

# Test 2: Employee tries to delete order in LISTO_PARA_RETIRO state
# Expected: 403 Forbidden
```

---

### Issue #2: Supabase Query Injection in Search
**Status:** MUST FIX SECOND  
**Effort:** 2-3 hours

**Current Problem:**
```javascript
// VULNERABLE
.or(`cliente_nombre.ilike.%${busqueda}%,marca.ilike.%${busqueda}%,...`)
```

**Quick Win Fix - Application-Level Filtering:**
```javascript
// Replace in lib/data.js
export async function getOrdenes({ estado, taller_id, busqueda, incluirEntregados = false, sucursal_id }) {
  let query = getSupabaseClient()
    .from("v_ordenes_dashboard")
    .select("*")
    .order("fecha_ingreso", { ascending: false });

  // Exclude terminal states
  if (!incluirEntregados && estado !== "ENTREGADO") {
    query = query.neq("estado", "ENTREGADO");
  }
  if (estado !== "RECHAZADO") {
    query = query.neq("estado", "RECHAZADO");
  }

  // Status filter
  if (estado && estado !== "TODOS") {
    query = query.eq("estado", estado);
  }

  // Taller filter
  if (taller_id && taller_id !== "TODOS") {
    if (taller_id === "LOCAL") {
      query = query.is("taller_id", null);
    } else {
      query = query.eq("taller_id", taller_id);
    }
  }

  // Sucursal filter
  if (sucursal_id && sucursal_id !== "TODAS") {
    query = query.eq("sucursal_id", sucursal_id);
  }

  const { data, error } = await query;
  if (error) throw error;

  // CLIENT-SIDE FILTERING for search (safe from injection)
  if (busqueda && busqueda.trim()) {
    const searchLower = busqueda.trim().toLowerCase();
    return data.filter(orden =>
      orden.cliente_nombre?.toLowerCase().includes(searchLower) ||
      orden.marca?.toLowerCase().includes(searchLower) ||
      orden.cliente_telefono?.toLowerCase().includes(searchLower)
    );
  }

  return data;
}

// Also fix buscarClientes
export async function buscarClientes(query) {
  const { data, error } = await getSupabaseClient()
    .from("clientes")
    .select("*")
    .limit(100);

  if (error) throw error;

  if (!query || query.trim().length < 2) return [];

  const searchLower = query.trim().toLowerCase();
  return data.filter(c =>
    c.nombre?.toLowerCase().includes(searchLower) ||
    c.telefono?.toLowerCase().includes(searchLower)
  ).slice(0, 10);
}
```

**Note:** This moves filtering to application layer which is safe. If performance becomes an issue, consider implementing full-text search on PostgreSQL side later.

---

## Phase 2: HIGH (Fix Before Production Go-Live)
**Estimated Time:** 6-8 hours  
**Blocker for Production:** YES

### Issue #3: Weak Password Requirements
**Time:** 30 minutes
**File:** `app/api/admin/usuarios/route.js`

```javascript
// Replace line 49-50
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;

if (password.length < PASSWORD_MIN_LENGTH) {
  return NextResponse.json(
    { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` },
    { status: 400 }
  );
}
if (!PASSWORD_REGEX.test(password)) {
  return NextResponse.json(
    { error: "Password must contain uppercase, lowercase, number, and special character (@$!%*?&)" },
    { status: 400 }
  );
}
```

---

### Issue #4: Stats Endpoint Returns All Company Data
**Time:** 1 hour
**File:** `lib/data.js`

```javascript
// Update getStats signature
export async function getStats(sucursal_id = null) {
  let query = getSupabaseClient()
    .from("v_ordenes_dashboard")
    .select("estado, nivel_retraso")
    .neq("estado", "ENTREGADO");

  // Add filtering
  if (sucursal_id) {
    query = query.eq("sucursal_id", sucursal_id);
  }

  const { data, error } = await query;
  if (error) throw error;
  
  // ... rest of function unchanged
}

// Update app/page.js
const sucursalFiltro = isDueno ? undefined : session?.user?.sucursal_id;
const [ordenesData, statsData, talleresData] = await Promise.all([
  getOrdenes({
    estado: filtroEstado,
    taller_id: filtroTaller,
    busqueda: debouncedBusqueda || undefined,
    incluirEntregados: filtroEstado === "ENTREGADO",
    sucursal_id: sucursalFiltro,
  }),
  getStats(sucursalFiltro), // Pass sucursal_id here
  getTalleres(),
])
```

---

### Issue #5: Notification Endpoint Input Validation
**Time:** 1 hour
**File:** `app/api/notify/route.js`

```javascript
import { auth } from "@/auth";
import { sendNotification } from "@/lib/notifications";
import { NextResponse } from "next/server";

const ALLOWED_TYPES = ["ORDEN_CREADA", "LISTO_PARA_RETIRO", "RECORDATORIO_MANTENIMIENTO"];
const REQUIRED_FIELDS = {
  ORDEN_CREADA: ["clienteEmail", "clienteNombre", "numeroOrden", "tipoArticulo", "trackingUrl"],
  LISTO_PARA_RETIRO: ["clienteEmail", "clienteNombre", "numeroOrden"],
  RECORDATORIO_MANTENIMIENTO: ["clienteEmail", "clienteNombre", "tipoServicio"],
};

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, data } = body;

  // Validate type
  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid notification type" }, { status: 400 });
  }

  // Validate required fields
  const required = REQUIRED_FIELDS[type] || [];
  for (const field of required) {
    if (!data?.[field]) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  // Validate email
  if (!isValidEmail(data.clienteEmail)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  // Validate string lengths
  if (data.clienteNombre?.length > 200 || !data.clienteNombre?.trim()) {
    return NextResponse.json({ error: "Invalid client name" }, { status: 400 });
  }

  try {
    await sendNotification(type, data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[/api/notify]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

### Issue #6: Cron Endpoint Weak Security
**Time:** 1 hour
**File:** `app/api/cron/recordatorios/route.js`

```javascript
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendNotification } from "@/lib/notifications";
import { isReminderDue } from "@/lib/notifications/reminder-logic";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(request) {
  // Verify Vercel signature
  const vercelSignature = request.headers.get("x-vercel-cron-signature");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[Cron] CRON_SECRET not configured");
    return NextResponse.json({ error: "Configuration error" }, { status: 500 });
  }

  if (!vercelSignature) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify signature using crypto
  const url = new URL(request.url);
  const message = request.url.split("?")[0]; // Base URL
  const expectedSignature = crypto
    .createHmac("sha256", cronSecret)
    .update(message)
    .digest("hex");

  if (vercelSignature !== expectedSignature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Rest of cron logic unchanged...
  // Fetch delivered orders...
  // ... (keep existing code)
}
```

---

### Issue #7: Session Secret in Repository
**Time:** 30 minutes

```bash
# 1. Remove .env.local from git history
git rm --cached .env.local
git commit -m "chore: remove .env.local from git tracking"

# 2. Generate new AUTH_SECRET
openssl rand -base64 32
# Output: (copy this value)

# 3. Update .env.local locally ONLY (don't commit)
AUTH_SECRET=<new-generated-secret>

# 4. Set in production (Vercel dashboard or via CLI)
vercel env add AUTH_SECRET
# Paste the generated secret when prompted
```

---

## Phase 3: MEDIUM (Fix in Next Sprint)
**Estimated Time:** 4 hours

### Issue #8: Missing Security Headers
**Time:** 1 hour
**File:** `next.config.js`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "X-XSS-Protection",
          value: "1; mode=block",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],
};

module.exports = nextConfig;
```

---

### Issue #9: Insufficient Input Validation
**Time:** 2 hours
**Create:** `app/api/ordenes/route.js`

```javascript
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

const VALID_TIPOS_ARTICULO = ["Reloj", "Joya", "Otro"];
const MAX_STRING_LENGTH = 500;
const MAX_MONTO = 999999;

export async function POST(request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    cliente_id,
    tipo_articulo,
    marca,
    modelo,
    problema_reportado,
    notas_internas,
    monto_presupuesto,
    nombre_articulo,
    tipo_servicio_id,
  } = body;

  // Validate cliente_id
  if (!cliente_id || typeof cliente_id !== "string") {
    return NextResponse.json({ error: "Invalid cliente_id" }, { status: 400 });
  }

  // Validate tipo_articulo
  if (!VALID_TIPOS_ARTICULO.includes(tipo_articulo)) {
    return NextResponse.json({ error: "Invalid tipo_articulo" }, { status: 400 });
  }

  // Validate problema_reportado (required)
  if (!problema_reportado?.trim() || problema_reportado.length > MAX_STRING_LENGTH) {
    return NextResponse.json({ error: "Invalid problema_reportado" }, { status: 400 });
  }

  // Validate optional string fields
  if (marca && (typeof marca !== "string" || marca.length > 100)) {
    return NextResponse.json({ error: "Invalid marca" }, { status: 400 });
  }
  if (modelo && (typeof modelo !== "string" || modelo.length > 100)) {
    return NextResponse.json({ error: "Invalid modelo" }, { status: 400 });
  }
  if (notas_internas && (typeof notas_internas !== "string" || notas_internas.length > MAX_STRING_LENGTH)) {
    return NextResponse.json({ error: "Invalid notas_internas" }, { status: 400 });
  }

  // Validate monto_presupuesto
  if (monto_presupuesto !== null && monto_presupuesto !== undefined) {
    const monto = parseFloat(monto_presupuesto);
    if (isNaN(monto) || monto < 0 || monto > MAX_MONTO) {
      return NextResponse.json({ error: "Invalid monto_presupuesto" }, { status: 400 });
    }
  }

  // Validate nombre_articulo (required if tipo_articulo === "Otro")
  if (tipo_articulo === "Otro" && (!nombre_articulo?.trim() || nombre_articulo.length > 100)) {
    return NextResponse.json({ error: "Invalid nombre_articulo" }, { status: 400 });
  }

  // Call existing data function or Supabase
  const { data: orden, error } = await getSupabaseAdmin()
    .from("ordenes")
    .insert({
      cliente_id,
      tipo_articulo,
      marca: marca || null,
      modelo: modelo || null,
      problema_reportado,
      notas_internas: notas_internas || null,
      monto_presupuesto: monto_presupuesto || null,
      nombre_articulo: nombre_articulo || null,
      tipo_servicio_id: tipo_servicio_id || null,
      sucursal_id: session.user.sucursal_id,
    })
    .select("*, clientes(nombre, email)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, orden });
}
```

---

### Issue #10: Update Dependencies
**Time:** 1 hour

```bash
# Check for vulnerabilities
npm audit

# Fix available vulnerabilities
npm audit fix

# For Next.js upgrade (breaking change)
npm install next@latest
npm run build  # Test the build
```

---

## Testing Checklist

After implementing fixes, verify:

- [ ] DELETE endpoint requires authentication
- [ ] Employee cannot delete orders from other branches
- [ ] Employee cannot delete non-INGRESADO orders
- [ ] Owner (dueno) can delete any order in any state
- [ ] Search queries don't break with special characters
- [ ] Password validation rejects weak passwords (< 12 chars, no complexity)
- [ ] Stats shown to employees only include their branch
- [ ] Notification endpoint rejects invalid email addresses
- [ ] Cron endpoint rejects requests without valid signature
- [ ] No .env.local secrets in git history
- [ ] Security headers present in HTTP responses
- [ ] Order creation rejects invalid data

---

## Deployment Checklist

Before merging to main:
1. All CRITICAL issues resolved and tested
2. All HIGH issues resolved and tested
3. Code review completed by another team member
4. Security headers verified in production
5. HTTPS enforced
6. AUTH_SECRET rotated and set in production
7. .env.local removed from git
8. npm audit shows no high-severity issues

---

## References

- OWASP Top 10: https://owasp.org/Top10/
- Next.js Security: https://nextjs.org/docs/basic-features/security
- NextAuth.js: https://next-auth.js.org/
- Supabase Security: https://supabase.com/docs/guides/security
