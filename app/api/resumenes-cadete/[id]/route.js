// app/api/resumenes-cadete/[id]/route.js
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { updateResumen } from "@/lib/cadete"

export async function PATCH(request, { params }) {
  const session = await auth()
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "employee")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const resumen = await updateResumen(id, body)
    return NextResponse.json({ resumen })
  } catch (e) {
    console.error("[/api/resumenes-cadete/[id]] PATCH error:", e)
    return NextResponse.json({ error: "Error al actualizar resumen" }, { status: 500 })
  }
}
