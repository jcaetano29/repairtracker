import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getConversaciones } from "@/lib/whatsapp"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const conversaciones = await getConversaciones()
    return NextResponse.json({ conversaciones })
  } catch (e) {
    console.error("[/api/whatsapp/conversaciones] GET error:", e)
    return NextResponse.json({ error: "Error al obtener conversaciones" }, { status: 500 })
  }
}
