import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { listarTodosClientes } from "@/lib/data"

// Formatea un valor para una celda CSV: escapa comillas y envuelve entre comillas.
function csvCell(value) {
  const str = value == null ? "" : String(value)
  return `"${str.replace(/"/g, '""')}"`
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const clientes = await listarTodosClientes()

    const encabezados = ["Nombre", "Teléfono", "Email", "Documento", "Fecha de alta"]
    const filas = clientes.map((c) =>
      [c.nombre, c.telefono, c.email, c.documento, c.created_at].map(csvCell).join(",")
    )
    // BOM UTF-8 para que Excel abra los acentos correctamente.
    const csv = "﻿" + [encabezados.map(csvCell).join(","), ...filas].join("\r\n")

    const fecha = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="clientes-${fecha}.csv"`,
      },
    })
  } catch (e) {
    console.error("[/api/clientes/export] GET error:", e)
    return NextResponse.json({ error: e.message || "Error al exportar clientes" }, { status: 500 })
  }
}
