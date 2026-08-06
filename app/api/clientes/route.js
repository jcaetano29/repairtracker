import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { buscarClientes, crearCliente, buscarClientePorTelefonoE164 } from "@/lib/data"
import { normalizePhoneToE164 } from "@/lib/phone"

export async function GET(request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q") || ""

  try {
    const clientes = await buscarClientes(q)
    return NextResponse.json({ clientes })
  } catch (e) {
    console.error("[/api/clientes] GET error:", e)
    return NextResponse.json({ error: e.message || "Error al buscar clientes" }, { status: 500 })
  }
}

export async function POST(request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { nombre, telefono, email, documento } = body
  if (!nombre?.trim() || !telefono?.trim() || !documento?.trim()) {
    return NextResponse.json({ error: "nombre, telefono y documento son requeridos" }, { status: 400 })
  }

  try {
    const telefonoE164 = normalizePhoneToE164(telefono)
    if (telefonoE164) {
      const existing = await buscarClientePorTelefonoE164(telefonoE164)
      if (existing) {
        return NextResponse.json(
          { error: "Ya existe un cliente con este teléfono", clienteExistente: existing },
          { status: 409 }
        )
      }
    }
    const cliente = await crearCliente({ nombre, telefono, email, documento })
    return NextResponse.json({ cliente })
  } catch (e) {
    console.error("[/api/clientes] POST error:", e)
    return NextResponse.json({ error: e.message || "Error al crear cliente" }, { status: 500 })
  }
}
