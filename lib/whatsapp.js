import { getSupabaseAdmin } from "./supabase-admin";

export async function getConversaciones() {
  const { data, error } = await getSupabaseAdmin()
    .from("whatsapp_conversaciones")
    .select("id, cliente_id, telefono_e164, last_message_at, last_message_preview, clientes(nombre)")
    .order("last_message_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
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

  const { count, error } = await supabase
    .from("whatsapp_mensajes")
    .select("id", { count: "exact", head: true })
    .eq("direccion", "entrante")
    .gt("created_at", estado.last_read_at);
  if (error) throw error;

  return (count ?? 0) > 0;
}

export async function marcarInboxLeido() {
  const { error } = await getSupabaseAdmin()
    .from("whatsapp_inbox_estado")
    .update({ last_read_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}
