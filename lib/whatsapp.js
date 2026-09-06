import { getSupabaseAdmin } from "./supabase-admin";
import { getConfiguracion } from "./data/configuracion";
import { recordatorioRetiroDisponible } from "./notifications/retiro-recordatorio";

export async function getConversaciones() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_conversaciones")
    .select(
      "id, cliente_id, telefono_e164, last_message_at, last_message_preview, last_incoming_message_at, last_read_at, clientes(nombre, email)"
    )
    .order("last_message_at", { ascending: false });

  if (error) throw error;
  const conversaciones = data ?? [];

  // Para cada cliente con conversación, buscamos su orden más antigua en
  // LISTO_PARA_RETIRO y decidimos si amerita el recordatorio de retiro.
  const clienteIds = [...new Set(conversaciones.map((c) => c.cliente_id).filter(Boolean))];
  const ordenPorCliente = new Map();
  let umbrales = {};

  if (clienteIds.length) {
    const [{ data: ordenes }, config] = await Promise.all([
      supabase
        .from("v_ordenes_dashboard")
        .select("numero_orden, tipo_articulo, cliente_id, updated_at, dias_en_estado")
        .eq("estado", "LISTO_PARA_RETIRO")
        .in("cliente_id", clienteIds),
      getConfiguracion(),
    ]);
    umbrales = config ?? {};
    for (const o of ordenes ?? []) {
      const prev = ordenPorCliente.get(o.cliente_id);
      // La más antigua = mayor cantidad de días en el estado.
      if (!prev || o.dias_en_estado > prev.dias_en_estado) ordenPorCliente.set(o.cliente_id, o);
    }
  }

  return conversaciones.map((c) => {
    const orden = ordenPorCliente.get(c.cliente_id) || null;
    const disponible = orden
      ? recordatorioRetiroDisponible(
          {
            estado: "LISTO_PARA_RETIRO",
            diasEnEstado: orden.dias_en_estado,
            updatedAt: orden.updated_at,
            lastIncomingMessageAt: c.last_incoming_message_at,
          },
          umbrales
        )
      : false;

    return {
      ...c,
      unread:
        !!c.last_incoming_message_at &&
        (!c.last_read_at || new Date(c.last_incoming_message_at) > new Date(c.last_read_at)),
      retiroPendiente: orden
        ? { numeroOrden: orden.numero_orden, tipoArticulo: orden.tipo_articulo }
        : null,
      recordatorioDisponible: disponible,
    };
  });
}

/**
 * Revalida en el servidor si una conversación amerita el recordatorio de retiro
 * y devuelve los datos de la orden elegible (la más antigua en LISTO_PARA_RETIRO),
 * o null si no corresponde enviarlo.
 */
export async function getOrdenRetiroPendiente(conversacionId) {
  const supabase = getSupabaseAdmin();

  const { data: conv, error } = await supabase
    .from("whatsapp_conversaciones")
    .select("id, cliente_id, last_incoming_message_at")
    .eq("id", conversacionId)
    .single();
  if (error || !conv) return null;

  const [{ data: ordenes }, umbrales] = await Promise.all([
    supabase
      .from("v_ordenes_dashboard")
      .select(
        "id, numero_orden, tipo_articulo, cliente_id, cliente_telefono, cliente_nombre, updated_at, dias_en_estado"
      )
      .eq("estado", "LISTO_PARA_RETIRO")
      .eq("cliente_id", conv.cliente_id)
      .order("dias_en_estado", { ascending: false }),
    getConfiguracion(),
  ]);

  const orden = (ordenes ?? [])[0];
  if (!orden) return null;

  const disponible = recordatorioRetiroDisponible(
    {
      estado: "LISTO_PARA_RETIRO",
      diasEnEstado: orden.dias_en_estado,
      updatedAt: orden.updated_at,
      lastIncomingMessageAt: conv.last_incoming_message_at,
    },
    umbrales ?? {}
  );
  if (!disponible) return null;

  return {
    ordenId: orden.id,
    clienteId: conv.cliente_id,
    numeroOrden: orden.numero_orden,
    tipoArticulo: orden.tipo_articulo,
    clienteNombre: orden.cliente_nombre,
    clienteTelefono: orden.cliente_telefono,
  };
}

export async function getMensajes(conversacionId) {
  const { data, error } = await getSupabaseAdmin()
    .from("whatsapp_mensajes")
    .select("id, direccion, tipo, body, created_at")
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function hayMensajesSinLeer() {
  const supabase = getSupabaseAdmin();

  const { data: estado, error: estadoError } = await supabase
    .from("whatsapp_inbox_estado")
    .select("last_read_at")
    .eq("id", 1)
    .single();
  if (estadoError) throw estadoError;

  const { data, error } = await supabase
    .from("whatsapp_mensajes")
    .select("id")
    .eq("direccion", "entrante")
    .gt("created_at", estado.last_read_at)
    .limit(1);
  if (error) throw error;

  return data.length > 0;
}

export async function marcarInboxLeido() {
  const { error } = await getSupabaseAdmin()
    .from("whatsapp_inbox_estado")
    .update({ last_read_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}

export async function marcarConversacionLeida(conversacionId) {
  const { error } = await getSupabaseAdmin()
    .from("whatsapp_conversaciones")
    .update({ last_read_at: new Date().toISOString() })
    .eq("id", conversacionId);
  if (error) throw error;
}
