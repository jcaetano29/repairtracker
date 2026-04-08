import { supabase } from "./supabase";

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
  const { data: orden, error } = await supabase
    .from("ordenes")
    .insert({
      cliente_id,
      tipo_articulo,
      marca,
      modelo,
      problema_reportado,
      notas_internas,
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

  const { data: orden, error } = await supabase
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
