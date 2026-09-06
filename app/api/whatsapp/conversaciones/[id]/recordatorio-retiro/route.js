import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getOrdenRetiroPendiente } from "@/lib/whatsapp";
import { sendNotification } from "@/lib/notifications";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { formatNumeroOrden } from "@/lib/constants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/whatsapp/conversaciones/:id/recordatorio-retiro
// Reenvía manualmente el aviso de "listo para retirar" a un cliente que ya fue
// avisado, no vino a buscar el artículo y no respondió. La elegibilidad se
// revalida en el servidor (no se confía en el cliente).
export async function POST(_request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    const orden = await getOrdenRetiroPendiente(id);
    if (!orden) {
      return NextResponse.json(
        { error: "No hay una orden lista para retirar sin respuesta para este cliente" },
        { status: 409 }
      );
    }

    await sendNotification("RECORDATORIO_RETIRO", {
      clienteTelefono: orden.clienteTelefono,
      clienteNombre: orden.clienteNombre,
      numeroOrden: formatNumeroOrden(orden.numeroOrden),
      tipoArticulo: orden.tipoArticulo,
    });

    // Auditoría del envío. No bloquea reenvíos: el operador decide cuándo
    // volver a mandarlo. Mismo shape que el cron de recordatorios.
    const { error: insertError } = await getSupabaseAdmin().from("notificaciones_enviadas").insert({
      orden_id: orden.ordenId,
      cliente_id: orden.clienteId,
      tipo_notificacion: "RECORDATORIO_RETIRO",
      tipo: "RECORDATORIO_RETIRO",
      canal: "whatsapp",
      enviado: true,
      fecha_envio: new Date().toISOString(),
    });
    if (insertError) {
      console.error("[/api/whatsapp/.../recordatorio-retiro] Error registrando notificación:", insertError);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/whatsapp/.../recordatorio-retiro] POST error:", e);
    return NextResponse.json({ error: "Error al enviar el recordatorio" }, { status: 500 });
  }
}
