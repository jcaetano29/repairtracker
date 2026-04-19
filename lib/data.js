import { getSupabaseClient } from "./supabase-client";
import { getCentrosReparacion, crearTraslado, getTrasladoActivo } from "./traslados";

// ============================================================
// ÓRDENES
// ============================================================

export async function getOrdenes({ estado, taller_id, busqueda, incluirEntregados = false, sucursal_id, page = 1, limit = 20 }) {
  let query = getSupabaseClient()
    .from("v_ordenes_dashboard")
    .select("*", { count: "exact" })
    .order("fecha_ingreso", { ascending: false });

  // Exclude terminal/non-operational states by default unless explicitly filtering for them
  if (!incluirEntregados && estado !== "ENTREGADO") {
    query = query.neq("estado", "ENTREGADO");
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
    // Escape LIKE wildcards to prevent pattern injection
    const sanitized = busqueda.replace(/[%_]/g, "");
    if (sanitized.trim()) {
      query = query.or(
        `cliente_nombre.ilike.%${sanitized}%,marca.ilike.%${sanitized}%,cliente_telefono.ilike.%${sanitized}%`
      );
    }
  }

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, count, error } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

export async function getOrden(id) {
  const { data, error } = await getSupabaseClient()
    .from("v_ordenes_dashboard")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function crearOrden({ cliente_id, tipo_articulo, marca, modelo, problema_reportado, notas_internas, monto_presupuesto, moneda, nombre_articulo, tipo_servicio_id, sucursal_id, material, material_otro, peso_gramos, monto_presupuesto_taller, en_garantia, forzar_traslado_a, fecha_entrega_estimada }) {
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
      monto_presupuesto_taller: monto_presupuesto_taller || null,
      moneda: moneda || "UYU",
      nombre_articulo: nombre_articulo || null,
      tipo_servicio_id: tipo_servicio_id || null,
      sucursal_id,
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

  // Auto-create ida transfer if sucursal is not a repair center, or if forced
  try {
    const trasladoDestino = forzar_traslado_a || null;
    if (trasladoDestino) {
      await crearTraslado({
        orden_id: orden.id,
        sucursal_origen: sucursal_id,
        sucursal_destino: trasladoDestino,
        tipo: "ida",
      });
    } else {
      const centros = await getCentrosReparacion();
      const esCentro = centros.some((c) => c.id === sucursal_id);
      if (!esCentro && centros.length > 0) {
        const existing = await getTrasladoActivo(orden.id);
        if (!existing) {
          await crearTraslado({
            orden_id: orden.id,
            sucursal_origen: sucursal_id,
            sucursal_destino: centros[0].id,
            tipo: "ida",
          });
        }
      }
    }
  } catch (e) {
    console.error("[Traslado] Error creating auto-transfer:", e);
  }

  return orden;
}

export async function cambiarEstado(orden_id, nuevo_estado, extras = {}) {
  // Check for active transfers that block state changes (Fix 7)
  try {
    const trasladoActivo = await getTrasladoActivo(orden_id);
    if (trasladoActivo) {
      if (trasladoActivo.tipo === "ida" && trasladoActivo.estado !== "recibido") {
        throw new Error("No se puede cambiar el estado mientras hay un traslado de ida pendiente");
      }
      if (trasladoActivo.tipo === "retorno" && trasladoActivo.estado !== "recibido" && nuevo_estado === "ENTREGADO") {
        throw new Error("No se puede entregar mientras hay un traslado de retorno pendiente");
      }
    }
  } catch (e) {
    if (e.message && (e.message.includes("traslado") || e.message.includes("No se puede"))) throw e;
    // Only swallow module import errors, not database errors
    if (e.code !== "MODULE_NOT_FOUND" && e.code !== "ERR_MODULE_NOT_FOUND") throw e;
  }

  const updateData = { estado: nuevo_estado, ...extras };

  const { data: orden, error } = await getSupabaseClient()
    .from("ordenes")
    .update(updateData)
    .eq("id", orden_id)
    .select("*")
    .single();

  if (error) throw error;

  return orden;
}

export async function asignarTaller(orden_id, taller_id) {
  return cambiarEstado(orden_id, "LISTO_PARA_ENVIO", { taller_id });
}

export async function registrarPresupuesto(orden_id, monto, moneda = "UYU", monto_taller = null) {
  return cambiarEstado(orden_id, "ESPERANDO_APROBACION", {
    monto_presupuesto: monto,
    monto_presupuesto_taller: monto_taller,
    moneda,
  });
}

export async function aprobarPresupuesto(orden_id) {
  return cambiarEstado(orden_id, "EN_REPARACION", { presupuesto_aprobado: true });
}

export async function rechazarPresupuesto(orden_id) {
  return cambiarEstado(orden_id, "RECHAZADO", { presupuesto_aprobado: false });
}

export async function entregarAlCliente(orden_id, monto_final, metodo_pago) {
  return cambiarEstado(orden_id, "ENTREGADO", {
    monto_final,
    metodo_pago,
  });
}

export async function deleteOrden(orden_id) {
  // Check for active transfers
  try {
    const trasladoActivo = await getTrasladoActivo(orden_id);
    if (trasladoActivo) {
      throw new Error("No se puede eliminar una orden con un traslado activo");
    }
  } catch (e) {
    if (e.message && (e.message.includes("traslado") || e.message.includes("No se puede"))) throw e;
    // Only swallow module import errors, not database errors
    if (e.code !== "MODULE_NOT_FOUND" && e.code !== "ERR_MODULE_NOT_FOUND") throw e;
  }

  // Delete historial first (FK constraint)
  const { error: historialError } = await getSupabaseClient().from("historial_estados").delete().eq("orden_id", orden_id);
  if (historialError) throw historialError;
  const { error } = await getSupabaseClient().from("ordenes").delete().eq("id", orden_id);
  if (error) throw error;
}

export async function updateSucursalRetiro(orden_id, sucursal_retiro_id) {
  const orden = await getOrden(orden_id);

  // Validate ENTREGADO orders cannot have pickup branch changed (Fix 10)
  if (orden.estado === "ENTREGADO") {
    throw new Error("No se puede cambiar la sucursal de retiro de una orden entregada");
  }

  const { data, error } = await getSupabaseClient()
    .from("ordenes")
    .update({ sucursal_retiro_id })
    .eq("id", orden_id)
    .select("*")
    .single();

  if (error) throw error;

  // If order is LISTO_PARA_RETIRO, handle retorno transfer (Fix 5)
  if (orden.estado === "LISTO_PARA_RETIRO") {
    try {
      const existing = await getTrasladoActivo(orden_id);

      // Cancel existing retorno if any
      if (existing && existing.tipo === "retorno") {
        const { error: cancelError } = await getSupabaseClient()
          .from("traslados")
          .update({ estado: "recibido", fecha_recepcion: new Date().toISOString() })
          .eq("id", existing.id);
        if (cancelError) throw cancelError;
      }

      // Create new retorno if needed
      if (sucursal_retiro_id !== orden.sucursal_id) {
        await crearTraslado({
          orden_id,
          sucursal_origen: orden.sucursal_id,
          sucursal_destino: sucursal_retiro_id,
          tipo: "retorno",
        });
      }
    } catch (e) {
      console.error("[Traslado] Error handling retorno on retiro change:", e);
    }
  }

  return data;
}

// ============================================================
// CLIENTES
// ============================================================

export async function buscarClientes(query) {
  // Escape LIKE wildcards to prevent pattern injection
  const sanitized = query.replace(/[%_]/g, "");
  if (!sanitized.trim()) return [];

  // Búsqueda exacta por documento primero
  const { data: exactMatch, error: exactError } = await getSupabaseClient()
    .from("clientes")
    .select("*")
    .eq("documento", sanitized.trim());

  if (exactError) throw exactError;
  if (exactMatch && exactMatch.length > 0) return exactMatch;

  // Búsqueda fuzzy por nombre o teléfono
  const { data, error } = await getSupabaseClient()
    .from("clientes")
    .select("*")
    .or(`nombre.ilike.%${sanitized}%,telefono.ilike.%${sanitized}%`)
    .limit(10);

  if (error) throw error;
  return data;
}

export async function crearCliente({ nombre, telefono, email, documento }) {
  const { data, error } = await getSupabaseClient()
    .from("clientes")
    .insert({ nombre, telefono, email, documento })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getCliente(id) {
  const { data, error } = await getSupabaseClient()
    .from("clientes")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// TALLERES
// ============================================================

export async function getTalleres() {
  const { data, error } = await getSupabaseClient()
    .from("talleres")
    .select("*")
    .eq("activo", true)
    .order("nombre");

  if (error) throw error;
  return data;
}

export async function getTalleresStats() {
  const { data, error } = await getSupabaseClient()
    .from("v_talleres_stats")
    .select("*");

  if (error) throw error;
  return data;
}

// ============================================================
// HISTORIAL
// ============================================================

export async function getHistorial(orden_id) {
  const { data, error } = await getSupabaseClient()
    .from("historial_estados")
    .select("*")
    .eq("orden_id", orden_id)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

// ============================================================
// STATS
// ============================================================

export async function getStats(umbrales, { sucursal_id } = {}) {
  let query = getSupabaseClient()
    .from("v_ordenes_dashboard")
    .select("estado, dias_en_estado")
    .neq("estado", "ENTREGADO");

  if (sucursal_id) {
    query = query.eq("sucursal_id", sucursal_id);
  }

  const { data, error } = await query;

  if (error) throw error;

  // Import getNivelRetraso for calculating delay levels
  const { getNivelRetraso } = await import("./constants");

  const stats = {
    activas: data.length,
    conRetraso: 0,
    listasRetiro: data.filter((o) => o.estado === "LISTO_PARA_RETIRO").length,
    enTaller: data.filter((o) =>
      ["EN_TALLER", "EN_REPARACION", "LISTO_EN_TALLER"].includes(o.estado)
    ).length,
    porEstado: {},
  };

  // Calculate conRetraso using getNivelRetraso with umbrales parameter
  data.forEach((o) => {
    const nivelRetraso = getNivelRetraso(o.estado, o.dias_en_estado, umbrales);
    if (nivelRetraso !== "none") {
      stats.conRetraso++;
    }
    stats.porEstado[o.estado] = (stats.porEstado[o.estado] || 0) + 1;
  });

  return stats;
}

// ============================================================
// TIPOS DE SERVICIO
// ============================================================

export async function getTiposServicio() {
  const { data, error } = await getSupabaseClient()
    .from("tipos_servicio")
    .select("*")
    .order("nombre");
  if (error) throw error;
  return data;
}

export async function crearTipoServicio({ nombre, ciclo_meses }) {
  const months = parseInt(ciclo_meses, 10);
  if (isNaN(months) || months <= 0) {
    throw new Error("ciclo_meses debe ser un número positivo");
  }

  const { data, error } = await getSupabaseClient()
    .from("tipos_servicio")
    .insert({ nombre, ciclo_meses: months })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTipoServicio(id, { nombre, ciclo_meses }) {
  const months = parseInt(ciclo_meses, 10);
  if (isNaN(months) || months <= 0) {
    throw new Error("ciclo_meses debe ser un número positivo");
  }

  const { data, error } = await getSupabaseClient()
    .from("tipos_servicio")
    .update({ nombre, ciclo_meses: months })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTipoServicio(id) {
  const { error } = await getSupabaseClient()
    .from("tipos_servicio")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ============================================================
// REPORTES
// ============================================================

export async function getReportesStats({ sucursal_id = null } = {}) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const supabase = getSupabaseClient();

  // All orders with all needed fields
  let ordenesQuery = supabase
    .from("ordenes")
    .select("id, estado, fecha_ingreso, fecha_entrega, fecha_listo, monto_presupuesto, moneda, cliente_id, tipo_articulo, updated_at, presupuesto_aprobado, sucursal_id");

  if (sucursal_id) {
    ordenesQuery = ordenesQuery.eq("sucursal_id", sucursal_id);
  }

  const { data: todasLasOrdenes, error } = await ordenesQuery;
  if (error) throw error;

  // New clients this month — by clientes.created_at (not by order activity)
  const { data: clientesNuevosData, error: errorClientes } = await supabase
    .from("clientes")
    .select("id")
    .gte("created_at", startOfMonth);
  if (errorClientes) throw errorClientes;

  // Taller stats from view
  const { data: talleresStats } = await supabase
    .from("v_talleres_stats")
    .select("id, nombre, ordenes_activas, ordenes_completadas, promedio_dias_reparacion")
    .order("ordenes_completadas", { ascending: false });

  const ordenesEsteMes = todasLasOrdenes.filter(o => o.fecha_ingreso >= startOfMonth);
  const ordenesEntregadasEsteMes = todasLasOrdenes.filter(
    o => o.estado === "ENTREGADO" && o.fecha_entrega >= startOfMonth
  );

  // Revenue this month by currency
  const ingresosMes = { UYU: 0, USD: 0 };
  ordenesEntregadasEsteMes.forEach(o => {
    const m = o.moneda === "USD" ? "USD" : "UYU";
    ingresosMes[m] += parseFloat(o.monto_presupuesto) || 0;
  });

  // Average resolution time THIS MONTH (fecha_listo - fecha_ingreso)
  const ordenesTiempoMes = todasLasOrdenes.filter(
    o => o.fecha_listo && o.fecha_ingreso && o.fecha_listo >= startOfMonth
  );
  const promedioDiasMes =
    ordenesTiempoMes.length > 0
      ? Math.round(
          ordenesTiempoMes.reduce((sum, o) => {
            const diff = new Date(o.fecha_listo) - new Date(o.fecha_ingreso);
            return sum + diff / (1000 * 60 * 60 * 24);
          }, 0) / ordenesTiempoMes.length
        )
      : null;

  // Total clients in the database (not just those with orders)
  const { count: clientesUnicos } = await supabase
    .from("clientes")
    .select("id", { count: "exact", head: true });


  // Orders by state (all states)
  const porEstado = {};
  todasLasOrdenes.forEach(o => {
    porEstado[o.estado] = (porEstado[o.estado] || 0) + 1;
  });

  // Breakdown by tipo_articulo
  const porTipo = {};
  todasLasOrdenes.forEach(o => {
    porTipo[o.tipo_articulo] = (porTipo[o.tipo_articulo] || 0) + 1;
  });

  // Rejection rate: among orders that had a budget decision (presupuesto_aprobado is not null)
  const ordenesConDecision = todasLasOrdenes.filter(o => o.presupuesto_aprobado !== null);
  const ordenesRechazadas = todasLasOrdenes.filter(o => o.presupuesto_aprobado === false).length;
  const tasaRechazo =
    ordenesConDecision.length > 0
      ? Math.round((ordenesRechazadas / ordenesConDecision.length) * 100)
      : null;

  // Active orders with delay — use dynamic thresholds from configuracion table
  const { getConfiguracion } = await import("./data/configuracion");
  const umbralesConfig = await getConfiguracion();
  const { getNivelRetraso } = await import("./constants");

  const ordenesConRetraso = todasLasOrdenes.filter(o => {
    if (o.estado === "ENTREGADO") return false;
    // Use Math.floor to match SQL EXTRACT(DAY FROM interval)::INT behavior
    const dias = Math.floor((Date.now() - new Date(o.updated_at).getTime()) / (1000 * 60 * 60 * 24));
    return getNivelRetraso(o.estado, dias, umbralesConfig) !== "none";
  }).length;

  // Historical revenue and ticket by currency
  const ingresosHistoricos = { UYU: 0, USD: 0 };
  const countByMoneda = { UYU: 0, USD: 0 };
  todasLasOrdenes
    .filter(o => o.estado === "ENTREGADO")
    .forEach(o => {
      const m = o.moneda === "USD" ? "USD" : "UYU";
      ingresosHistoricos[m] += parseFloat(o.monto_presupuesto) || 0;
      if (o.monto_presupuesto) countByMoneda[m]++;
    });
  const ticketPromedio = {
    UYU: countByMoneda.UYU > 0 ? Math.round(ingresosHistoricos.UYU / countByMoneda.UYU) : null,
    USD: countByMoneda.USD > 0 ? Math.round(ingresosHistoricos.USD / countByMoneda.USD) : null,
  };

  return {
    ordenesEsteMes: ordenesEsteMes.length,
    ordenesEntregadasEsteMes: ordenesEntregadasEsteMes.length,
    ingresosMes,
    promedioDiasMes,
    clientesUnicos: clientesUnicos ?? 0,
    clientesNuevosEsteMes: clientesNuevosData.length,
    porTipo,
    porEstado,
    tasaRechazo,
    totalRechazadas: ordenesRechazadas,
    ordenesConRetraso,
    talleresStats: talleresStats || [],
    totalOrdenes: todasLasOrdenes.length,
    ingresosHistoricos,
    ticketPromedio,
  };
}

// ─── Talleres ──────────────────────────────────────────────────────────────

export async function crearTaller({ nombre, telefono, email, direccion }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("talleres")
    .insert({ nombre, telefono, email, direccion })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTaller(id, { nombre, telefono, email, direccion }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("talleres")
    .update({ nombre, telefono, email, direccion })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTaller(id) {
  const supabase = getSupabaseClient();

  // Desasociar órdenes de este taller antes de eliminar
  const { error: unlinkError } = await supabase
    .from("ordenes")
    .update({ taller_id: null })
    .eq("taller_id", id);
  if (unlinkError) throw unlinkError;

  const { error } = await supabase.from("talleres").delete().eq("id", id);
  if (error) throw error;
}

// ─── Sucursales ─────────────────────────────────────────────────────────────

export async function getSucursales() {
  const { data, error } = await getSupabaseClient()
    .from("sucursales")
    .select("id, nombre, activo, created_at")
    .order("nombre")
  if (error) throw error
  return data
}

// ============================================================
// MARCAS
// ============================================================

export async function getMarcas({ soloActivas = true } = {}) {
  let query = getSupabaseClient()
    .from("marcas")
    .select("*")
    .order("nombre");

  if (soloActivas) {
    query = query.eq("activo", true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function crearMarca({ nombre }) {
  const { data, error } = await getSupabaseClient()
    .from("marcas")
    .insert({ nombre })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMarca(id, { nombre, activo }) {
  const updates = {};
  if (nombre !== undefined) updates.nombre = nombre;
  if (activo !== undefined) updates.activo = activo;

  const { data, error } = await getSupabaseClient()
    .from("marcas")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMarca(id) {
  const { error } = await getSupabaseClient()
    .from("marcas")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
