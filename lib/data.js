import { supabase } from "./supabase";

// ============================================================
// ÓRDENES
// ============================================================

export async function getOrdenes({ estado, taller_id, busqueda, incluirEntregados = false }) {
  let query = supabase
    .from("v_ordenes_dashboard")
    .select("*")
    .order("fecha_ingreso", { ascending: false });

  if (!incluirEntregados) {
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

  if (busqueda) {
    query = query.or(
      `cliente_nombre.ilike.%${busqueda}%,marca.ilike.%${busqueda}%,cliente_telefono.ilike.%${busqueda}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getOrden(id) {
  const { data, error } = await supabase
    .from("v_ordenes_dashboard")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function crearOrden({ cliente_id, tipo_articulo, marca, modelo, problema_reportado, notas_internas }) {
  const { data, error } = await supabase
    .from("ordenes")
    .insert({
      cliente_id,
      tipo_articulo,
      marca,
      modelo,
      problema_reportado,
      notas_internas,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function cambiarEstado(orden_id, nuevo_estado, extras = {}) {
  const updateData = { estado: nuevo_estado, ...extras };

  const { data, error } = await supabase
    .from("ordenes")
    .update(updateData)
    .eq("id", orden_id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function asignarTaller(orden_id, taller_id) {
  return cambiarEstado(orden_id, "ENVIADO_A_TALLER", { taller_id });
}

export async function registrarPresupuesto(orden_id, monto, moneda = "UYU") {
  return cambiarEstado(orden_id, "ESPERANDO_APROBACION", {
    monto_presupuesto: monto,
    moneda,
  });
}

export async function entregarAlCliente(orden_id, monto_final, metodo_pago) {
  return cambiarEstado(orden_id, "ENTREGADO", {
    monto_final,
    metodo_pago,
  });
}

// ============================================================
// CLIENTES
// ============================================================

export async function buscarClientes(query) {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .or(`nombre.ilike.%${query}%,telefono.ilike.%${query}%`)
    .limit(10);

  if (error) throw error;
  return data;
}

export async function crearCliente({ nombre, telefono, email }) {
  const { data, error } = await supabase
    .from("clientes")
    .insert({ nombre, telefono, email })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getCliente(id) {
  const { data, error } = await supabase
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
  const { data, error } = await supabase
    .from("talleres")
    .select("*")
    .eq("activo", true)
    .order("nombre");

  if (error) throw error;
  return data;
}

export async function getTalleresStats() {
  const { data, error } = await supabase
    .from("v_talleres_stats")
    .select("*");

  if (error) throw error;
  return data;
}

// ============================================================
// HISTORIAL
// ============================================================

export async function getHistorial(orden_id) {
  const { data, error } = await supabase
    .from("historial_estados")
    .select("*")
    .eq("orden_id", orden_id)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

// ============================================================
// MOVIMIENTOS CADETE
// ============================================================

export async function getPendientesCadete() {
  const { data, error } = await supabase
    .from("v_cadete_pendientes")
    .select("*");

  if (error) throw error;
  return data;
}

export async function registrarMovimientoCadete({ orden_id, tipo, taller_id, cadete }) {
  const { data, error } = await supabase
    .from("movimientos_cadete")
    .insert({ orden_id, tipo, taller_id, cadete, confirmado: true })
    .select()
    .single();

  if (error) throw error;

  // Auto-cambiar estado según tipo de movimiento
  if (tipo === "RETIRO_TALLER") {
    await cambiarEstado(orden_id, "RETIRADO_POR_CADETE");
  } else if (tipo === "ENTREGA_LOCAL") {
    await cambiarEstado(orden_id, "LISTO_PARA_RETIRO");
  }

  return data;
}

// ============================================================
// STATS
// ============================================================

export async function getStats() {
  const { data, error } = await supabase
    .from("v_ordenes_dashboard")
    .select("estado, nivel_retraso")
    .neq("estado", "ENTREGADO");

  if (error) throw error;

  const stats = {
    activas: data.length,
    conRetraso: data.filter((o) => o.nivel_retraso !== "none").length,
    listasRetiro: data.filter((o) => o.estado === "LISTO_PARA_RETIRO").length,
    enTaller: data.filter((o) =>
      ["ENVIADO_A_TALLER", "EN_REPARACION", "LISTO_EN_TALLER"].includes(o.estado)
    ).length,
    porEstado: {},
  };

  data.forEach((o) => {
    stats.porEstado[o.estado] = (stats.porEstado[o.estado] || 0) + 1;
  });

  return stats;
}
