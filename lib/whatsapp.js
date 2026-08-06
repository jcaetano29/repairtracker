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
