# Soft Delete Implementation Guide

## Overview

This guide explains how to implement soft deletes for the `ordenes` table to support proper authorization checks and maintain audit trails for deleted orders.

## What is Soft Delete?

A soft delete sets a timestamp (`deleted_at`) instead of actually removing the record from the database. This allows:
- Audit trails (who deleted what and when)
- Recovery of accidentally deleted records
- Compliance with data retention policies

**Hard delete** = `DELETE FROM ordenes WHERE id = ?` (record is gone forever)  
**Soft delete** = `UPDATE ordenes SET deleted_at = NOW() WHERE id = ?` (record marked as deleted)

## Database Schema Changes

### Migration File
Location: `/supabase/009_soft_delete_ordenes.sql`

Adds two columns to the `ordenes` table:
- `deleted_at: TIMESTAMPTZ` - When the order was deleted (NULL = not deleted)
- `deleted_by: UUID REFERENCES usuarios(id)` - Who deleted it

This migration must be run on both development and production databases.

## Code Implementation

### 1. Create New API Endpoint

File: `/app/api/ordenes/[id]/delete/route.js`

This endpoint:
- Authenticates the request
- Fetches the order to validate existence
- Checks authorization (role + branch + state)
- Performs soft delete if authorized
- Returns appropriate HTTP status

```javascript
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function POST(request, { params }) {
  // Require authentication
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Fetch order to verify it exists and get details for authorization
  const { data: orden, error: fetchError } = await getSupabaseAdmin()
    .from("ordenes")
    .select("id, estado, sucursal_id")
    .eq("id", id)
    .single();

  if (fetchError || !orden) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Authorization Logic
  // Owner (dueno) can delete any order
  // Employee (empleado) can only delete INGRESADO orders in their own branch
  const isDueno = session.user.role === "dueno";
  const isEmpleadoOwnBranch =
    session.user.role === "empleado" &&
    orden.sucursal_id === session.user.sucursal_id;

  const canDelete =
    isDueno || (isEmpleadoOwnBranch && orden.estado === "INGRESADO");

  if (!canDelete) {
    return NextResponse.json(
      { error: "You do not have permission to delete this order" },
      { status: 403 }
    );
  }

  // Perform soft delete
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

### 2. Update Component

File: `/components/DetalleOrdenModal.js`

Update the `handleDelete()` function to call the new API endpoint instead of the client-side `deleteOrden()` function.

**Before:**
```javascript
async function handleDelete() {
  setLoading(true);
  setError(null);
  try {
    await deleteOrden(orden.id);  // Client-side, no authorization
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

**After:**
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

Also remove the import of `deleteOrden` from line 6:

**Before:**
```javascript
import { cambiarEstado, asignarTaller, registrarPresupuesto, entregarAlCliente, getHistorial, getTalleres, deleteOrden } from "@/lib/data";
```

**After:**
```javascript
import { cambiarEstado, asignarTaller, registrarPresupuesto, entregarAlCliente, getHistorial, getTalleres } from "@/lib/data";
```

### 3. Update lib/data.js

The `deleteOrden()` function should be kept for backwards compatibility but marked as deprecated.

File: `/lib/data.js` (lines 157-162)

```javascript
/**
 * DEPRECATED: Use /api/ordenes/[id]/delete endpoint instead
 * This function is kept only for backwards compatibility during migration.
 * It will be removed in a future version.
 * 
 * The new endpoint includes proper authorization checks and soft deletes.
 */
export async function deleteOrden(orden_id) {
  console.warn(
    "deleteOrden() is deprecated. Use the /api/ordenes/[id]/delete endpoint instead."
  );

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

### 4. Update Views to Exclude Deleted Orders

If you have database views that query ordenes, they should exclude soft-deleted records by default:

```sql
-- Example: When creating views, add this filter
WHERE ordenes.deleted_at IS NULL
```

For example, update the `v_ordenes_dashboard` view to include this condition.

## Testing Checklist

After implementing soft deletes, test these scenarios:

### Test 1: Employee deletes own INGRESADO order
```javascript
// Scenario: Employee user, own branch, INGRESADO order
const response = await fetch(`/api/ordenes/${ordem_id}/delete`, {
  method: "POST",
});
// Expected: 200 OK, order.deleted_at is set
```

### Test 2: Employee tries to delete from other branch
```javascript
// Scenario: Employee user, different branch, INGRESADO order
const response = await fetch(`/api/ordenes/${other_branch_orden}/delete`, {
  method: "POST",
});
// Expected: 403 Forbidden
```

### Test 3: Employee tries to delete non-INGRESADO order
```javascript
// Scenario: Employee user, own branch, LISTO_PARA_RETIRO order
const response = await fetch(`/api/ordenes/${listo_order}/delete`, {
  method: "POST",
});
// Expected: 403 Forbidden
```

### Test 4: Owner can delete any order
```javascript
// Scenario: Owner (dueno) user, any branch, any state
const response = await fetch(`/api/ordenes/${any_orden}/delete`, {
  method: "POST",
});
// Expected: 200 OK
```

### Test 5: Unauthenticated request is rejected
```javascript
// No authentication
const response = await fetch(`/api/ordenes/${orden_id}/delete`, {
  method: "POST",
});
// Expected: 401 Unauthorized
```

### Test 6: Deleted orders don't appear in dashboards
```javascript
// After deleting an order, refresh the dashboard
// Expected: Deleted order no longer visible
// Database: deleted_at timestamp is set, deleted_by shows user ID
```

## Audit Trail Queries

To track who deleted what:

```sql
-- Show all deleted orders
SELECT id, numero_orden, deleted_at, deleted_by, 
       CASE WHEN deleted_by IS NOT NULL THEN 'Deleted' ELSE 'Active' END as status
FROM ordenes
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC;

-- Show deletions by user
SELECT u.username, COUNT(*) as deleted_count
FROM ordenes o
JOIN usuarios u ON o.deleted_by = u.id
WHERE o.deleted_at IS NOT NULL
GROUP BY u.id, u.username
ORDER BY deleted_count DESC;

-- Recover a deleted order (if needed)
UPDATE ordenes
SET deleted_at = NULL, deleted_by = NULL
WHERE id = '...' AND deleted_at IS NOT NULL;
```

## Performance Considerations

1. **Index on deleted_at**: The migration creates an index on `deleted_at` to speed up queries filtering deleted records
2. **Exclude in views**: Database views should use `WHERE deleted_at IS NULL` to avoid returning deleted orders
3. **Regular cleanup** (optional): After retention period, you could archive or hard-delete old soft-deleted records

## Security Benefits

- **Audit Trail**: Exactly who deleted an order and when
- **Authorization Check**: Delete is now server-side, not client-side
- **Reversibility**: Deleted orders can be recovered if necessary
- **Compliance**: Meets requirements for audit logging in regulated industries

## Migration Path

1. Run migration 009 to add columns to database
2. Create the new API endpoint at `/app/api/ordenes/[id]/delete/route.js`
3. Update the component to use the API endpoint
4. Test all scenarios
5. Deploy to production
6. Monitor logs for any issues
7. Eventually remove the deprecated `deleteOrden()` function after all code updated

## Rollback Plan

If you need to rollback:

```sql
-- Remove the soft delete columns (careful!)
ALTER TABLE ordenes
DROP COLUMN deleted_at,
DROP COLUMN deleted_by;
```

Or if you want to keep the columns but disable soft delete:

```javascript
// In the API endpoint, return 403 for all delete attempts
if (!canDelete) {
  return NextResponse.json(
    { error: "Deletion disabled" },
    { status: 403 }
  );
}
```
