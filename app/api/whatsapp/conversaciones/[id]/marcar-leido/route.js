import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { marcarConversacionLeida } from "@/lib/whatsapp";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    await marcarConversacionLeida(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/whatsapp/conversaciones/:id/marcar-leido] POST error:", e);
    return NextResponse.json({ error: "Error al marcar como leído" }, { status: 500 });
  }
}
