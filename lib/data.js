import { getSupabaseClient } from "./supabase-client";

// ============================================================
// NOTIFICATIONS
// ============================================================

async function triggerNotification(type, data) {
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, data }),
    });
  } catch (e) {
    console.error("[Notification] Failed to trigger:", e);
    // Don't throw — notification failure should not break order creation
  }
}

// ============================================================
// ÓRDENES
// ============================================================

export async function getOrdenes({ estado, taller_id, busqueda, incluirEntregados = false }) {
  let query = getSupabaseClient()
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
  const { data, error } = await getSupabaseClient()
    .from("v_ordenes_dashboard")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function crearOrden({ cliente_id, tipo_articulo, marca, modelo, problema_reportado, notas_internas, monto_presupuesto, nombre_articulo }) {
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
      nombre_articulo: nombre_articulo || null,
    })
    .select("*, clientes(nombre, email)")
    .single();

  if (error) throw error;

  // Send confirmation email if client has email
  if (orden.clientes?.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    triggerNotification("ORDEN_CREADA", {
      clienteEmail: orden.clientes.email,
      clienteNombre: orden.clientes.nombre,
      numeroOrden: String(orden.numero_orden).padStart(4, "0"),
      tipoArticulo: tipo_articulo,
      marca: marca || "",
      trackingUrl: `${appUrl}/seguimiento/${orden.tracking_token}`,
    });
  }

  return orden;
}

export async function cambiarEstado(orden_id, nuevo_estado, extras = {}) {
  const updateData = { estado: nuevo_estado, ...extras };

  const { data: orden, error } = await getSupabaseClient()
    .from("ordenes")
    .update(updateData)
    .eq("id", orden_id)
    .select("*, clientes(nombre, email)")
    .single();

  if (error) throw error;

  if (nuevo_estado === "LISTO_PARA_RETIRO" && orden.clientes?.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    triggerNotification("LISTO_PARA_RETIRO", {
      clienteEmail: orden.clientes.email,
      clienteNombre: orden.clientes.nombre,
      numeroOrden: String(orden.numero_orden).padStart(4, "0"),
      tipoArticulo: orden.tipo_articulo,
      marca: orden.marca || "",
      trackingUrl: `${appUrl}/seguimiento/${orden.tracking_token}`,
    });
  }

  return orden;
}

export async function asignarTaller(orden_id, taller_id) {
  return cambiarEstado(orden_id, "EN_TALLER", { taller_id });
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
  const { data, error } = await getSupabaseClient()
    .from("clientes")
    .select("*")
    .or(`nombre.ilike.%${query}%,telefono.ilike.%${query}%`)
    .limit(10);

  if (error) throw error;
  return data;
}

export async function crearCliente({ nombre, telefono, email }) {
  const { data, error } = await getSupabaseClient()
    .from("clientes")
    .insert({ nombre, telefono, email })
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

export async function getStats() {
  const { data, error } = await getSupabaseClient()
    .from("v_ordenes_dashboard")
    .select("estado, nivel_retraso")
    .neq("estado", "ENTREGADO");

  if (error) throw error;

  const stats = {
    activas: data.length,
    conRetraso: data.filter((o) => o.nivel_retraso !== "none").length,
    listasRetiro: data.filter((o) => o.estado === "LISTO_PARA_RETIRO").length,
    enTaller: data.filter((o) =>
      ["EN_TALLER", "EN_REPARACION", "LISTO_EN_TALLER"].includes(o.estado)
    ).length,
    porEstado: {},
  };

  data.forEach((o) => {
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
  const { data, error } = await getSupabaseClient()
    .from("tipos_servicio")
    .insert({ nombre, ciclo_meses: parseInt(ciclo_meses) })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTipoServicio(id, { nombre, ciclo_meses }) {
  const { data, error } = await getSupabaseClient()
    .from("tipos_servicio")
    .update({ nombre, ciclo_meses: parseInt(ciclo_meses) })
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

export async function getReportesStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const supabase = getSupabaseClient();

  // All orders with all needed fields
  const { data: todasLasOrdenes, error } = await supabase
    .from("ordenes")
    .select("id, estado, fecha_ingreso, fecha_entrega, fecha_listo, monto_presupuesto, cliente_id, tipo_articulo, updated_at, presupuesto_aprobado");
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

  // Revenue this month (sum of monto_presupuesto for delivered orders)
  const ingresosMes = ordenesEntregadasEsteMes.reduce(
    (sum, o) => sum + (parseFloat(o.monto_presupuesto) || 0), 0
  );

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

  // Unique clients total
  const clientesUnicos = new Set(todasLasOrdenes.map(o => o.cliente_id)).size;

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

  // Active orders with delay (dias in state >= leve threshold)
  const UMBRALES = {
    INGRESADO:            { leve: 2  },
    EN_TALLER:            { leve: 7  },
    ESPERANDO_APROBACION: { leve: 1  },
    EN_REPARACION:        { leve: 3  },
    LISTO_EN_TALLER:      { leve: 1  },
    LISTO_PARA_RETIRO:    { leve: 3  },
  };
  const ordenesConRetraso = todasLasOrdenes.filter(o => {
    const umbral = UMBRALES[o.estado];
    if (!umbral) return false;
    const dias = (Date.now() - new Date(o.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    return dias >= umbral.leve;
  }).length;

  return {
    ordenesEsteMes: ordenesEsteMes.length,
    ordenesEntregadasEsteMes: ordenesEntregadasEsteMes.length,
    ingresosMes,
    promedioDiasMes,
    clientesUnicos,
    clientesNuevosEsteMes: clientesNuevosData.length,
    porTipo,
    porEstado,
    tasaRechazo,
    ordenesConRetraso,
    talleresStats: talleresStats || [],
    totalOrdenes: todasLasOrdenes.length,
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
  const { error } = await supabase.from("talleres").delete().eq("id", id);
  if (error) throw error;
}
