// app/api/resumenes-cadete/cadetes/route.js
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getCadetes } from "@/lib/cadete"

export async function GET() {
  const session = await auth()
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "employee")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const cadetes = await getCadetes()
    return NextResponse.json({ cadetes })
  } catch (e) {
    console.error("[/api/resumenes-cadete/cadetes] GET error:", e)
    return NextResponse.json({ error: "Error al obtener cadetes" }, { status: 500 })
  }
}
