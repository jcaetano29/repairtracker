import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getCliente, actualizarCliente, ClienteDuplicadoError } from "@/lib/data"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request, { params }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 })

  try {
    const cliente = await getCliente(id)
    return NextResponse.json({ cliente })
  } catch (e) {
    console.error("[/api/clientes/:id] GET error:", e)
    return NextResponse.json({ error: e.message || "Error al obtener cliente" }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  // El cadete no puede editar clientes (el middleware ya lo bloquea, defensa en profundidad).
  if (session.user.role === "cadete") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { nombre, telefono, email, documento } = body
  if (!nombre?.trim() || !telefono?.trim() || !documento?.trim()) {
    return NextResponse.json({ error: "nombre, telefono y documento son requeridos" }, { status: 400 })
  }

  try {
    const cliente = await actualizarCliente(id, {
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      email: email?.trim() || null,
      documento: documento.trim(),
    })
    return NextResponse.json({ cliente })
  } catch (e) {
    if (e instanceof ClienteDuplicadoError) {
      return NextResponse.json({ error: e.message, campo: e.campo }, { status: 409 })
    }
    console.error("[/api/clientes/:id] PATCH error:", e)
    return NextResponse.json({ error: e.message || "Error al actualizar cliente" }, { status: 500 })
  }
}
