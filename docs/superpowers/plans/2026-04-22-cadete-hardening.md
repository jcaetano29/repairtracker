# Cadete Feature Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 issues in the cadete feature: race conditions, missing validations, fragile transactions, and redundant logic.

**Architecture:** All fixes are backend-focused. DB constraint prevents duplicate order assignment. Confirmation endpoint validates state before transitioning and rolls back on failure. Swap reorder uses a Postgres function for atomicity. Frontend filtering removed in favor of backend-only filtering.

**Tech Stack:** Supabase (Postgres), Next.js API routes, JavaScript

---

### Task 1: UNIQUE constraint to prevent duplicate order assignment

Adds a partial unique index on `items_resumen_cadete(orden_id, subtipo)` to prevent the same order being assigned twice with the same subtipo. This eliminates the race condition in `addItemOrden`. The app-level check remains as a user-friendly error, but the DB is the real guard.

**Files:**
- DB migration (via Supabase MCP)
- Modify: `lib/cadete.js:164-199` (handle unique violation gracefully)
- Modify: `app/api/resumenes-cadete/[id]/items/route.js:58-68` (surface duplicate error)

- [ ] **Step 1: Add partial unique index in Supabase**

```sql
CREATE UNIQUE INDEX idx_items_orden_subtipo_unique
ON items_resumen_cadete (orden_id, subtipo)
WHERE orden_id IS NOT NULL;
```

- [ ] **Step 2: Update `addItemOrden` in `lib/cadete.js` to handle unique violation**

Replace lines 164-199 with:

```javascript
export async function addItemOrden(resumen_id, orden_id, subtipo) {
  const { data: lastItem } = await getSupabaseClient()
    .from("items_resumen_cadete")
    .select("orden")
    .eq("resumen_id", resumen_id)
    .order("orden", { ascending: false })
    .limit(1)

  const nextOrden = (lastItem?.[0]?.orden ?? -1) + 1

  const { data, error } = await getSupabaseClient()
    .from("items_resumen_cadete")
    .insert({
      resumen_id,
      tipo: "orden",
      orden_id,
      subtipo,
      orden: nextOrden,
    })
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") {
      throw new Error("Esta orden ya esta asignada a un resumen de cadete")
    }
    throw error
  }
  return data
}
```

- [ ] **Step 3: Update POST handler in items route to surface duplicate error**

In `app/api/resumenes-cadete/[id]/items/route.js`, replace the catch block (lines 65-68):

```javascript
  } catch (e) {
    console.error("[/api/resumenes-cadete/[id]/items] POST error:", e)
    const status = e.message?.includes("ya esta asignada") ? 409 : 500
    return NextResponse.json({ error: e.message || "Error al agregar item" }, { status })
  }
```

- [ ] **Step 4: Verify by testing — try adding the same order twice**

Should get 409 Conflict on the second attempt.

- [ ] **Step 5: Commit**

```bash
git add lib/cadete.js app/api/resumenes-cadete/\[id\]/items/route.js
git commit -m "fix: add unique constraint to prevent duplicate order assignment in cadete"
```

---

### Task 2: Validate order state before confirmation transition

The confirmation endpoint currently changes order state without checking the current state. This could move an already-delivered order back to EN_TALLER. Add state validation using TRANSICIONES from constants.

**Files:**
- Modify: `app/api/resumenes-cadete/[id]/items/confirmar/route.js`

- [ ] **Step 1: Add state validation before `cambiarEstado`**

Replace lines 27-55 in `confirmar/route.js` with:

```javascript
  try {
    // Fetch the item to determine what state change to make
    const { data: item, error: fetchErr } = await getSupabaseClient()
      .from("items_resumen_cadete")
      .select("id, tipo, subtipo, orden_id, traslado_id")
      .eq("id", item_id)
      .single()

    if (fetchErr) throw fetchErr
    if (!item) {
      return NextResponse.json({ error: "Item no encontrado" }, { status: 404 })
    }

    if (item.tipo === "orden" && item.orden_id && item.subtipo) {
      // Fetch current order state
      const { data: orden, error: ordenErr } = await getSupabaseClient()
        .from("ordenes")
        .select("estado")
        .eq("id", item.orden_id)
        .single()

      if (ordenErr) throw ordenErr

      const targetState = item.subtipo === "llevar_a_taller" ? "EN_TALLER" : "LISTO_PARA_RETIRO"
      const expectedStates = item.subtipo === "llevar_a_taller"
        ? ["LISTO_PARA_ENVIO"]
        : ["LISTO_EN_TALLER"]

      if (!expectedStates.includes(orden.estado)) {
        return NextResponse.json({
          error: `No se puede confirmar: la orden esta en estado ${orden.estado}, se esperaba ${expectedStates.join(" o ")}`
        }, { status: 409 })
      }

      if (item.subtipo === "llevar_a_taller") {
        await cambiarEstado(item.orden_id, "EN_TALLER", {
          fecha_envio_taller: new Date().toISOString(),
        })
      } else if (item.subtipo === "retirar_de_taller") {
        await cambiarEstado(item.orden_id, "LISTO_PARA_RETIRO", {
          fecha_listo: new Date().toISOString(),
        })
      }
    }

    // Remove item from resumen
    await deleteItem(item_id)

    // Auto-deactivate resumen if no items left
    const { id: resumenId } = await params
    await deactivateIfEmpty(resumenId)
```

- [ ] **Step 2: Verify — try confirming an order that's already been delivered**

Should get 409 with descriptive error message.

- [ ] **Step 3: Commit**

```bash
git add app/api/resumenes-cadete/\[id\]/items/confirmar/route.js
git commit -m "fix: validate order state before cadete confirmation transition"
```

---

### Task 3: Prevent item deletion if state change fails in confirmation

Currently if `cambiarEstado` fails, the code continues to `deleteItem`, causing data loss. Restructure so `deleteItem` only runs after successful state change.

**Files:**
- Modify: `app/api/resumenes-cadete/[id]/items/confirmar/route.js`

This is already handled by Task 2's implementation — if `cambiarEstado` throws, it propagates to the catch block and `deleteItem` is never reached. The sequential flow (cambiarEstado first, then deleteItem) already ensures this. **No additional changes needed** — Task 2 covers this.

---

### Task 4: Atomic swap reorder using Postgres function

Two separate UPDATEs for swapping item order can leave inconsistent state if the second fails. Create a Postgres function that swaps in a single transaction.

**Files:**
- DB migration (via Supabase MCP)
- Modify: `lib/cadete.js:242-258`

- [ ] **Step 1: Create Postgres function for atomic swap**

```sql
CREATE OR REPLACE FUNCTION swap_item_orden(
  p_item_id_a UUID,
  p_orden_a INT,
  p_item_id_b UUID,
  p_orden_b INT
) RETURNS VOID AS $$
BEGIN
  UPDATE items_resumen_cadete SET orden = p_orden_a WHERE id = p_item_id_a;
  UPDATE items_resumen_cadete SET orden = p_orden_b WHERE id = p_item_id_b;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Update `swapItemOrder` in `lib/cadete.js`**

Replace lines 242-258 with:

```javascript
export async function swapItemOrder(item_id_a, orden_a, item_id_b, orden_b) {
  const { error } = await getSupabaseClient()
    .rpc("swap_item_orden", {
      p_item_id_a: item_id_a,
      p_orden_a: orden_a,
      p_item_id_b: item_id_b,
      p_orden_b: orden_b,
    })

  if (error) throw error
}
```

- [ ] **Step 3: Test reordering items**

Move an item up/down and verify both items swap correctly.

- [ ] **Step 4: Commit**

```bash
git add lib/cadete.js
git commit -m "fix: use atomic Postgres function for cadete item reorder swap"
```

---

### Task 5: Remove redundant frontend filtering (consolidate in backend)

The filtering of "which orders are available" happens in 3 places:
1. Backend: `ordenes-pendientes/route.js` (filters by assigned set)
2. Frontend: `ResumenCadetePanel.js:263-267` (filters by local items)
3. Backend: `addItemOrden` check (now replaced by UNIQUE constraint in Task 1)

After Task 1, the DB constraint is the real guard. The backend endpoint already filters assigned orders. The frontend filtering is redundant — but harmless as a UX optimization (prevents showing items already in the current resumen's list). We keep it as-is since it provides instant UI feedback. **No code changes needed.**

---

### Task 6: Reduce unnecessary full reloads after actions

Currently after every add/delete/confirm, the panel reloads traslados + ordenes pendientes + items + resumenes list. Optimize by only reloading what changed.

**Files:**
- Modify: `components/ResumenCadetePanel.js`

- [ ] **Step 1: Optimize `handleAddTraslado` — only reload items and resumenes count**

Replace lines 159-172:

```javascript
  async function handleAddTraslado(trasladoId) {
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "traslado", traslado_id: trasladoId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      // Remove from local traslados list immediately
      setTraslados((prev) => prev.filter((t) => t.id !== trasladoId))
      await Promise.all([loadItems(selectedResumen.id), loadData()])
    } catch (e) {
      setError(e.message)
    }
  }
```

- [ ] **Step 2: Optimize `handleAddOrden` — remove from local list immediately**

Replace lines 174-187:

```javascript
  async function handleAddOrden(ordenId, subtipo) {
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "orden", orden_id: ordenId, subtipo }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      // Remove from local pending list immediately
      setOrdenesPendientes((prev) => ({
        ...prev,
        [subtipo]: (prev[subtipo] || []).filter((o) => o.id !== ordenId),
      }))
      await Promise.all([loadItems(selectedResumen.id), loadData()])
    } catch (e) {
      setError(e.message)
    }
  }
```

- [ ] **Step 3: Optimize `handleAddAdHoc` — no need to reload ordenes**

Replace lines 189-205:

```javascript
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
      await Promise.all([loadItems(selectedResumen.id), loadData()])
    } catch (e) {
      setError(e.message)
    }
  }
```

- [ ] **Step 4: Optimize `handleDeleteItem` — reload ordenes only for orden-type items**

Replace lines 207-220:

```javascript
  async function handleDeleteItem(itemId) {
    setError(null)
    const deletedItem = items.find((i) => i.item_id === itemId)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const reloads = [loadItems(selectedResumen.id), loadData()]
      if (deletedItem?.tipo === "orden") reloads.push(loadOrdenesPendientes())
      if (deletedItem?.tipo === "traslado") reloads.push(loadTraslados())
      await Promise.all(reloads)
    } catch (e) {
      setError(e.message)
    }
  }
```

- [ ] **Step 5: Optimize `handleConfirmItem` — same pattern as delete**

Replace lines 222-236:

```javascript
  async function handleConfirmItem(itemId) {
    if (!confirm("¿Confirmar que el cadete completo esta tarea? Esto actualizara el estado de la orden.")) return
    setError(null)
    const confirmedItem = items.find((i) => i.item_id === itemId)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const reloads = [loadItems(selectedResumen.id), loadData()]
      if (confirmedItem?.tipo === "orden") reloads.push(loadOrdenesPendientes())
      await Promise.all(reloads)
    } catch (e) {
      setError(e.message)
    }
  }
```

- [ ] **Step 6: Commit**

```bash
git add components/ResumenCadetePanel.js
git commit -m "perf: reduce unnecessary reloads in cadete panel after actions"
```

---

### Task 7: Add error handling for missing `error` checks in data layer

Several Supabase calls in `lib/cadete.js` don't check the `error` return, which could cause silent failures.

**Files:**
- Modify: `lib/cadete.js`

- [ ] **Step 1: Fix `addItemTraslado` — check error on max orden query**

Replace lines 111-119:

```javascript
export async function addItemTraslado(resumen_id, traslado_id) {
  const { data: existing, error: orderErr } = await getSupabaseClient()
    .from("items_resumen_cadete")
    .select("orden")
    .eq("resumen_id", resumen_id)
    .order("orden", { ascending: false })
    .limit(1)

  if (orderErr) throw orderErr
  const nextOrden = (existing?.[0]?.orden ?? -1) + 1
```

- [ ] **Step 2: Fix `addItemAdHoc` — same pattern**

Replace lines 137-145:

```javascript
export async function addItemAdHoc(resumen_id, descripcion) {
  const { data: existing, error: orderErr } = await getSupabaseClient()
    .from("items_resumen_cadete")
    .select("orden")
    .eq("resumen_id", resumen_id)
    .order("orden", { ascending: false })
    .limit(1)

  if (orderErr) throw orderErr
  const nextOrden = (existing?.[0]?.orden ?? -1) + 1
```

- [ ] **Step 3: Commit**

```bash
git add lib/cadete.js
git commit -m "fix: add missing error checks in cadete data layer queries"
```

---

## Summary

| Task | Issue | Fix |
|------|-------|-----|
| 1 | Race condition duplicate orders | UNIQUE index + handle 23505 |
| 2 | No state validation before transition | Check current estado before cambiarEstado |
| 3 | Item deleted if state change fails | Covered by Task 2 (sequential flow) |
| 4 | Fragile swap reorder | Atomic Postgres function |
| 5 | Triplicated filtering | Already safe — DB constraint is guard, frontend is UX |
| 6 | Full reload after every action | Optimistic local updates + selective reloads |
| 7 | Silent Supabase errors | Add missing error checks |
