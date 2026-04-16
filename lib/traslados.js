import { getSupabaseClient } from "./supabase-client";

// ============================================================
// TRASLADOS - Data Layer
// ============================================================

/**
 * Get all active (non-recibido) traslados, optionally filtered by sucursal.
 * Includes nested order and client data.
 *
 * @param {Object} params
 * @param {string} [params.sucursal_id] - Optional. If provided, filter by origin OR destination.
 * @returns {Promise<Array>} Array of traslados with nested ordenes and clientes
 */
export async function getTraslados({ sucursal_id } = {}) {
  let query = getSupabaseClient()
    .from("traslados")
    .select(
      "*, sucursal_origen_rel:sucursales!traslados_sucursal_origen_fkey(id, nombre), sucursal_destino_rel:sucursales!traslados_sucursal_destino_fkey(id, nombre), ordenes!inner(id, numero_orden, tipo_articulo, marca, cliente_id, clientes!inner(id, nombre, telefono))"
    )
    .neq("estado", "recibido");

  if (sucursal_id) {
    // Filter by origin OR destination
    query = query.or(`sucursal_origen.eq.${sucursal_id},sucursal_destino.eq.${sucursal_id}`);
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Get all traslados (active or completed) for a specific order.
 * Used for order history/detail view.
 *
 * @param {string} orden_id - Order ID
 * @returns {Promise<Array>} Array of all traslados for the order
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
 *
 * @param {Object} params
 * @param {string} params.orden_id - Order ID
 * @param {string} params.sucursal_origen - Origin branch UUID
 * @param {string} params.sucursal_destino - Destination branch UUID
 * @param {string} params.tipo - Type: 'ida' or 'retorno'
 * @param {string} [params.creado_por] - User ID of creator (nullable, auto-created traslados may not have this)
 * @returns {Promise<Object>} The created traslado record
 */
export async function crearTraslado({
  orden_id,
  sucursal_origen,
  sucursal_destino,
  tipo,
  creado_por,
}) {
  const { data, error } = await getSupabaseClient()
    .from("traslados")
    .insert({
      orden_id,
      sucursal_origen,
      sucursal_destino,
      tipo,
      creado_por: creado_por || null,
      estado: "pendiente",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a traslado to estado='en_transito' and set fecha_salida.
 * Uses optimistic locking: only updates if still pendiente.
 * Idempotent: if already dispatched, returns current state.
 *
 * @param {string} traslado_id - Traslado ID
 * @returns {Promise<Object>} The updated traslado record
 */
export async function despacharTraslado(traslado_id) {
  const supabase = getSupabaseClient();

  // Optimistic locking: only update if still pendiente
  const { data, error } = await supabase
    .from("traslados")
    .update({
      estado: "en_transito",
      fecha_salida: new Date().toISOString(),
    })
    .eq("id", traslado_id)
    .eq("estado", "pendiente")
    .select("*")
    .single();

  // If no rows updated, fetch current state (already dispatched or received)
  if (error && error.code === "PGRST116") {
    const { data: current, error: fetchErr } = await supabase
      .from("traslados")
      .select("*")
      .eq("id", traslado_id)
      .single();
    if (fetchErr) throw fetchErr;
    return current;
  }

  if (error) throw error;
  return data;
}

/**
 * Update a traslado to estado='recibido', set fecha_recepcion and recibido_por.
 * ALSO update the order's sucursal_id to the traslado's sucursal_destino.
 * Uses optimistic locking: only updates if still en_transito.
 * Idempotent: if already received, returns current state.
 *
 * @param {string} traslado_id - Traslado ID
 * @param {string} recibido_por - User ID of receiver
 * @returns {Promise<Object>} The updated traslado record
 */
export async function recibirTraslado(traslado_id, recibido_por) {
  const supabase = getSupabaseClient();

  // First fetch to get destination (needed to update order)
  const { data: traslado, error: fetchError } = await supabase
    .from("traslados")
    .select("*")
    .eq("id", traslado_id)
    .single();

  if (fetchError) throw fetchError;
  if (traslado.estado !== "en_transito") return traslado; // Not in transit, return as-is

  // Optimistic locking: only update if still en_transito
  const { data: updated, error: updateError } = await supabase
    .from("traslados")
    .update({
      estado: "recibido",
      fecha_recepcion: new Date().toISOString(),
      recibido_por: recibido_por || null,
    })
    .eq("id", traslado_id)
    .eq("estado", "en_transito")
    .select("*")
    .single();

  // If no rows updated, someone else already received it
  if (updateError && updateError.code === "PGRST116") {
    const { data: current } = await supabase
      .from("traslados")
      .select("*")
      .eq("id", traslado_id)
      .single();
    return current || traslado;
  }

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
 * Get all sucursales marked as repair centers.
 *
 * @returns {Promise<Array>} Array of repair center sucursal records
 */
export async function getCentrosReparacion() {
  const { data, error } = await getSupabaseClient()
    .from("sucursales")
    .select("*")
    .eq("es_centro_reparacion", true);

  if (error) throw error;
  return data;
}

/**
 * Get the active (non-recibido) traslado for an order, or null if none exists.
 *
 * @param {string} orden_id - Order ID
 * @returns {Promise<Object|null>} The active traslado or null
 */
export async function getTrasladoActivo(orden_id) {
  const { data, error } = await getSupabaseClient()
    .from("traslados")
    .select("*")
    .eq("orden_id", orden_id)
    .neq("estado", "recibido")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // If PGRST116 error (no rows returned), return null instead of throwing
  if (error?.code === "PGRST116") {
    return null;
  }

  if (error) throw error;
  return data;
}
