import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { marcarInboxLeido } from "@/lib/whatsapp";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    await marcarInboxLeido();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/whatsapp/estado/marcar-leido] POST error:", e);
    return NextResponse.json({ error: "Error al marcar como leído" }, { status: 500 });
  }
}
