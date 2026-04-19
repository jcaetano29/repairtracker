// app/api/cadete/resumenes/route.js
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getResumenesCadete } from "@/lib/cadete"

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "cadete") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const resumenes = await getResumenesCadete(session.user.id)
    return NextResponse.json({ resumenes })
  } catch (e) {
    console.error("[/api/cadete/resumenes] GET error:", e)
    return NextResponse.json({ error: "Error al obtener resumenes" }, { status: 500 })
  }
}
