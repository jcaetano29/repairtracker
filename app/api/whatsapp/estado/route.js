import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { hayMensajesSinLeer } from "@/lib/whatsapp";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const hayNuevos = await hayMensajesSinLeer();
    return NextResponse.json({ hayNuevos });
  } catch (e) {
    console.error("[/api/whatsapp/estado] GET error:", e);
    return NextResponse.json({ error: "Error al obtener estado" }, { status: 500 });
  }
}
