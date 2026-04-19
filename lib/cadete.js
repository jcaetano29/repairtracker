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
 * Add an orden-based item to a resumen.
 * @param {string} resumen_id
 * @param {string} orden_id
 * @param {string} subtipo - 'retirar_de_taller' or 'llevar_a_taller'
 * @returns {Promise<Object>}
 */
export async function addItemOrden(resumen_id, orden_id, subtipo) {
  // Check if this order is already assigned in any active resumen with same subtipo
  const { data: existing } = await getSupabaseClient()
    .from("items_resumen_cadete")
    .select("id, resumen_id")
    .eq("orden_id", orden_id)
    .eq("subtipo", subtipo)
    .limit(1)

  if (existing?.length > 0) {
    throw new Error("Esta orden ya esta asignada a un resumen de cadete")
  }

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
 * Check if a resumen has zero items and deactivate it if so.
 * @param {string} resumen_id
 */
export async function deactivateIfEmpty(resumen_id) {
  const { count, error } = await getSupabaseClient()
    .from("items_resumen_cadete")
    .select("id", { count: "exact", head: true })
    .eq("resumen_id", resumen_id)

  if (error) throw error

  if (count === 0) {
    await getSupabaseClient()
      .from("resumenes_cadete")
      .update({ activo: false })
      .eq("id", resumen_id)
  }
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
