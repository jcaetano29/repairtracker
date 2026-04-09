# START HERE: Security Fixes Implementation Guide

## Current Status
✅ **Security Review Complete** (160b8ce)  
⏭️ **Remediation Phase: NOT STARTED**  
⛔ **Deployment Blocker: YES** - Critical issues found

---

## What You Need to Do

This application has **2 CRITICAL security issues** that must be fixed before deployment:

1. **Delete Authorization Bypass** — Employees can delete any order
2. **Query Injection in Search** — Filter bypass via malicious search parameters

And **5 HIGH issues** that should be fixed before production.

**Estimated time to fix both critical issues:** 4-6 hours

---

## Step 1: Create Security Branch

```bash
git checkout -b security/fix-critical-issues
```

All security fixes go on this branch, separate from main.

---

## Step 2: Fix Issue #1 — Delete Authorization (2-3 hours)

### File to Create
Create `/app/api/ordenes/[id]/delete/route.js`:

```javascript
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function POST(request, { params }) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Fetch order to check authorization
  const { data: orden, error: fetchError } = await getSupabaseAdmin()
    .from("ordenes")
    .select("id, estado, sucursal_id")
    .eq("id", id)
    .single();

  if (fetchError || !orden) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Authorization: dueno can delete any order, empleado only INGRESADO in own branch
  const isDueno = session.user.role === "dueno";
  const isEmpleadoOwnBranch =
    session.user.role === "empleado" &&
    orden.sucursal_id === session.user.sucursal_id;

  const canDelete =
    isDueno || (isEmpleadoOwnBranch && orden.estado === "INGRESADO");

  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft delete: set deleted_at and deleted_by
  const { error: deleteError } = await getSupabaseAdmin()
    .from("ordenes")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: session.user.id,
    })
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
```

### Update Component
In `components/DetalleOrdenModal.js`, change the `handleDelete` function (lines 109-122):

```javascript
async function handleDelete() {
  setLoading(true);
  setError(null);
  try {
    const response = await fetch(`/api/ordenes/${orden.id}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to delete order");
    }

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

### Update lib/data.js
Modify `deleteOrden()` function (lines 157-162) to NOT be called directly from the component anymore. Mark it as deprecated or remove it:

```javascript
// DEPRECATED: Use /api/ordenes/[id]/delete endpoint instead
// This function is kept only for backwards compatibility during migration
export async function deleteOrden(orden_id) {
  // Delete historial first (FK constraint)
  await getSupabaseClient()
    .from("historial_estados")
    .delete()
    .eq("orden_id", orden_id);
  const { error } = await getSupabaseClient()
    .from("ordenes")
    .delete()
    .eq("id", orden_id);
  if (error) throw error;
}
```

### Test the Fix
1. As an employee, try to delete your own INGRESADO order → **Should succeed** ✓
2. As an employee, try to delete an order from another branch → **Should get 403** ✓
3. As an employee, try to delete a non-INGRESADO order → **Should get 403** ✓
4. As owner (dueno), delete any order → **Should succeed** ✓

### Commit
```bash
git add app/api/ordenes/[id]/delete/route.js components/DetalleOrdenModal.js lib/data.js
git commit -m "security: implement delete authorization with role and branch checks

This commit adds a new POST endpoint at /api/ordenes/[id]/delete that
validates the user has permission to delete an order before proceeding.

Authorization rules:
- Owner (dueno): Can delete any order
- Employee (empleado): Can only delete INGRESADO orders in their own branch

Uses soft delete pattern (deleted_at, deleted_by columns) for audit trail.

Impact: Orders can no longer be deleted without proper authorization
Risk Level: CRITICAL (now fixed)
Fixes: Missing authorization on delete operations"
```

---

## Step 3: Fix Issue #2 — Query Injection in Search (2-3 hours)

### Problem
The search functionality uses string interpolation directly in Supabase filter strings:
```javascript
// VULNERABLE
.or(`cliente_nombre.ilike.%${busqueda}%,marca.ilike.%${busqueda}%,...`)
```

An attacker could search for `test%neq.%` to bypass filters.

### Solution
Move search filtering to application layer (after data is fetched). This is safe because:
1. Server-side security filters (estado, sucursal_id) are applied first
2. Malicious search cannot bypass those base filters
3. Search is non-critical UI functionality, not a security boundary

### Update File: `lib/data.js`

Find the `getOrdenes()` function (around line 24) and replace the entire function:

```javascript
export async function getOrdenes({
  estado,
  taller_id,
  busqueda,
  incluirEntregados = false,
  sucursal_id,
}) {
  let query = getSupabaseClient()
    .from("v_ordenes_dashboard")
    .select("*")
    .order("fecha_ingreso", { ascending: false });

  // Apply secure filters on server (before search)
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

  const { data, error } = await query;
  if (error) throw error;

  // CLIENT-SIDE FILTERING for search (safe from injection)
  // This filters already-retrieved data, so malicious input cannot bypass server filters
  if (busqueda && busqueda.trim()) {
    const searchLower = busqueda.trim().toLowerCase();
    return data.filter((orden) =>
      orden.cliente_nombre?.toLowerCase().includes(searchLower) ||
      orden.marca?.toLowerCase().includes(searchLower) ||
      orden.cliente_telefono?.toLowerCase().includes(searchLower)
    );
  }

  return data;
}
```

### Update File: `lib/data.js`

Find the `buscarClientes()` function (around line 168) and replace it:

```javascript
export async function buscarClientes(query) {
  const { data, error } = await getSupabaseClient()
    .from("clientes")
    .select("*")
    .limit(100);

  if (error) throw error;

  // CLIENT-SIDE FILTERING (safe from injection)
  if (!query || query.trim().length < 2) return [];

  const searchLower = query.trim().toLowerCase();
  return data
    .filter(
      (c) =>
        c.nombre?.toLowerCase().includes(searchLower) ||
        c.telefono?.toLowerCase().includes(searchLower)
    )
    .slice(0, 10);
}
```

### Test the Fix
```bash
# Test 1: Normal search still works
# Search for "Juan" → Should find all orders with "Juan" in name

# Test 2: Special characters don't break it
# Search for "test%neq.%" → Should return empty (no matches), NOT bypass filters

# Test 3: Injection attempt
# Search for "%ilike." → Should return empty (no matches), NOT bypass filters
```

### Commit
```bash
git add lib/data.js
git commit -m "security: fix query injection in search filters

This commit moves search filtering from Supabase query layer to application
layer. Previously, malicious search input could bypass filters via PostgREST
injection. Now search is applied client-side after secure server-side
filters are applied.

Why this is safe:
- Server-side filters (estado, sucursal_id) applied first
- Malicious search cannot bypass those base security filters
- Search is UI-only, not a security boundary

Impact: Search parameter cannot be used to bypass data access controls
Risk Level: CRITICAL (now fixed)
Fixes: Supabase query injection in search"
```

---

## Step 4: Fix HIGH Issues (6-8 hours)

Once the two CRITICAL issues are complete, fix these HIGH issues:

### Issue #3: Weak Password Requirements (30 minutes)
File: `/app/api/admin/usuarios/route.js` (lines 49-50)
- Update to require 12 characters minimum
- Add complexity requirement (uppercase + lowercase + number + special char)
- See `SECURITY_REMEDIATION_PRIORITY.md` lines 186-207

### Issue #4: Stats Endpoint Data Leak (1 hour)
File: `/lib/data.js` (getStats function)
- Add `sucursal_id` filtering to prevent employees from seeing other branches' metrics
- See `SECURITY_REMEDIATION_PRIORITY.md` lines 211-244

### Issue #5: Notification Endpoint Validation (1 hour)
File: `/app/api/notify/route.js`
- Add input validation (type whitelist, required fields)
- See `SECURITY_REMEDIATION_PRIORITY.md` for full implementation

### Issue #6: Cron Endpoint Secret Verification (1 hour)
File: `/app/api/cron/recordatorios/route.js` (lines 7-15)
- Replace simple string comparison with HMAC signature verification
- See `SECURITY_REMEDIATION_PRIORITY.md` for full implementation

### Issue #7: Remove AUTH_SECRET from Repository (30 minutes)
File: `.env.local`
- Generate new secret: `openssl rand -base64 32`
- Remove from git: `git rm --cached .env.local`
- Set new secret in Vercel environment
- See `DEVELOPER_SECURITY_CHECKLIST.md` lines 148-170

---

## Testing & Verification

After completing each fix:

```bash
# Build check
npm run build

# Local testing
npm run dev

# Lint check
npm run lint
```

---

## Complete Workflow Summary

```
Step 1: Create branch
  git checkout -b security/fix-critical-issues

Step 2: Fix Delete Authorization
  - Create /app/api/ordenes/[id]/delete/route.js
  - Update DetalleOrdenModal.js
  - Test all scenarios
  - Commit

Step 3: Fix Query Injection in Search
  - Update getOrdenes() function
  - Update buscarClientes() function
  - Test search still works
  - Commit

Step 4: Fix 5 HIGH Issues
  - Password requirements
  - Stats filtering
  - Notification validation
  - Cron signature verification
  - Remove AUTH_SECRET

Step 5: Create Pull Request
  - Compare branch with main
  - Write comprehensive PR description
  - Request code review
  - Merge after approval

Step 6: Deploy with Confidence
  - All CRITICAL issues fixed ✓
  - All HIGH issues fixed ✓
  - Tests passing ✓
  - Security headers added ✓
```

---

## Document References

- `SECURITY_REVIEW.md` — Detailed analysis of all vulnerabilities
- `SECURITY_REMEDIATION_PRIORITY.md` — Implementation code for all issues
- `DEVELOPER_SECURITY_CHECKLIST.md` — Detailed step-by-step checklist
- `SECURITY_ISSUES_SUMMARY.txt` — Executive summary

---

## Questions?

Refer to the appropriate security document for detailed implementation details.

**Next Action:** Create the security branch and start with Issue #1