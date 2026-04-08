// app/api/cron/recordatorios/route.js
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendNotification } from "@/lib/notifications";
import { isReminderDue } from "@/lib/notifications/reminder-logic";
import { NextResponse } from "next/server";

export async function GET(request) {
  // Verify secret token to prevent unauthorized calls
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all delivered orders with client email + service type info
  const { data: ordenes, error } = await supabaseAdmin
    .from("ordenes")
    .select(`
      id,
      tipo_articulo,
      fecha_entrega,
      clientes(id, nombre, email)
    `)
    .eq("estado", "ENTREGADO")
    .not("fecha_entrega", "is", null)
    .not("clientes.email", "is", null);

  if (error) {
    console.error("[Cron] Error fetching orders:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch service types with their cycles
  const { data: tiposServicio } = await supabaseAdmin
    .from("tipos_servicio")
    .select("nombre, ciclo_meses")
    .eq("activo", true);

  // Build a map: tipo nombre → ciclo_meses
  const cicloMap = {};
  tiposServicio?.forEach((t) => {
    cicloMap[t.nombre.toLowerCase()] = t.ciclo_meses;
  });

  // Check which orders already have a pending reminder sent this month
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  const { data: yaEnviados } = await supabaseAdmin
    .from("notificaciones_enviadas")
    .select("orden_id")
    .eq("tipo_notificacion", "RECORDATORIO_MANTENIMIENTO")
    .gte("created_at", startOfMonth);

  const yaEnviadosSet = new Set(yaEnviados?.map((n) => n.orden_id) || []);

  let sent = 0;
  const errors = [];

  for (const orden of ordenes || []) {
    if (yaEnviadosSet.has(orden.id)) continue; // already sent this month
    if (!orden.clientes?.email) continue;

    // Find matching service cycle by tipo_articulo
    const articulo = orden.tipo_articulo.toLowerCase();
    let cicloMeses = null;

    // Try exact match first, then partial match
    for (const [nombre, ciclo] of Object.entries(cicloMap)) {
      if (articulo.includes(nombre) || nombre.includes(articulo)) {
        cicloMeses = ciclo;
        break;
      }
    }

    if (!cicloMeses) continue; // no matching service type configured

    if (!isReminderDue(orden.fecha_entrega, cicloMeses)) continue;

    try {
      await sendNotification("RECORDATORIO_MANTENIMIENTO", {
        clienteEmail: orden.clientes.email,
        clienteNombre: orden.clientes.nombre,
        tipoServicio: orden.tipo_articulo,
        ultimaFecha: new Date(orden.fecha_entrega).toLocaleDateString("es-UY", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
      });

      // Record that we sent it
      await supabaseAdmin.from("notificaciones_enviadas").insert({
        orden_id: orden.id,
        cliente_id: orden.clientes.id,
        tipo_notificacion: "RECORDATORIO_MANTENIMIENTO",
        tipo: "RECORDATORIO_MANTENIMIENTO",
        canal: "email",
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
