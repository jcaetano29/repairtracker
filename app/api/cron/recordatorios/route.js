// app/api/cron/recordatorios/route.js
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendNotification } from "@/lib/notifications";
import { isReminderDue } from "@/lib/notifications/reminder-logic";
import { NextResponse } from "next/server";

export async function GET(request) {
  // Verify secret token to prevent unauthorized calls
  // Vercel sends: Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get("authorization");
  const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch delivered orders that have a service type linked, with client email
  const { data: ordenes, error } = await getSupabaseAdmin()
    .from("ordenes")
    .select(`
      id,
      tipo_articulo,
      fecha_entrega,
      clientes(id, nombre, telefono),
      tipos_servicio(nombre, ciclo_meses)
    `)
    .eq("estado", "ENTREGADO")
    .not("fecha_entrega", "is", null)
    .not("tipo_servicio_id", "is", null);

  if (error) {
    console.error("[Cron] Error fetching orders:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Check which orders already had a reminder sent (ever — only send once)
  const { data: yaEnviados } = await getSupabaseAdmin()
    .from("notificaciones_enviadas")
    .select("orden_id")
    .eq("tipo_notificacion", "RECORDATORIO_MANTENIMIENTO")
    .eq("enviado", true);

  const yaEnviadosSet = new Set(yaEnviados?.map((n) => n.orden_id) || []);

  let sent = 0;
  const errors = [];

  for (const orden of ordenes || []) {
    if (yaEnviadosSet.has(orden.id)) continue;
    if (!orden.clientes?.telefono) continue;
    if (!orden.tipos_servicio?.ciclo_meses) continue;

    if (!isReminderDue(orden.fecha_entrega, orden.tipos_servicio.ciclo_meses)) continue;

    try {
      await sendNotification("RECORDATORIO_MANTENIMIENTO", {
        clienteTelefono: orden.clientes.telefono,
        clienteNombre: orden.clientes.nombre,
        tipoServicio: orden.tipos_servicio.nombre,
        ultimaFecha: new Date(orden.fecha_entrega).toLocaleDateString("es-UY", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
      });

      // Record that we sent it
      await getSupabaseAdmin().from("notificaciones_enviadas").insert({
        orden_id: orden.id,
        cliente_id: orden.clientes.id,
        tipo_notificacion: "RECORDATORIO_MANTENIMIENTO",
        tipo: "RECORDATORIO_MANTENIMIENTO",
        canal: "whatsapp",
        enviado: true,
        fecha_envio: new Date().toISOString(),
      });

      sent++;
    } catch (e) {
      errors.push({ orden_id: orden.id, error: e.message });
    }
  }

  return NextResponse.json({ sent, errors });
}
