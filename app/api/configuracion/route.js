import { auth } from "@/auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

/**
 * GET /api/configuracion
 *
 * Returns all configuration values as { configuracion: { clave: valor, ... } }
 * No authentication required (data is non-sensitive)
 */
export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("configuracion")
    .select("clave, valor")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Transform array of {clave, valor} into a single object
  const configuracion = {}
  if (data && Array.isArray(data)) {
    data.forEach(({ clave, valor }) => {
      configuracion[clave] = valor
    })
  }

  return NextResponse.json({ configuracion })
}

/**
 * POST /api/configuracion
 *
 * Updates a single configuration value
 * Requires session.user.role === 'dueno' (admin-only)
 *
 * Request body: { clave: string, valor: { leve: number, grave: number } }
 * Response: { success: true, data: updated_row } or error object with status code
 */
export async function POST(request) {
  // Check authentication
  const session = await auth()
  if (!session?.user?.role || session.user.role !== "dueno") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Parse request body
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { clave, valor } = body

  // Validate clave and valor are present
  if (!clave) {
    return NextResponse.json(
      { error: "clave is required" },
      { status: 400 }
    )
  }

  if (!valor) {
    return NextResponse.json(
      { error: "valor is required" },
      { status: 400 }
    )
  }

  // Validate valor has leve and grave properties
  if (valor.leve === undefined || valor.grave === undefined) {
    return NextResponse.json(
      { error: "valor must have leve and grave properties" },
      { status: 400 }
    )
  }

  // Validate leve and grave are numeric
  if (typeof valor.leve !== "number" || typeof valor.grave !== "number") {
    return NextResponse.json(
      { error: "leve and grave must be numeric values" },
      { status: 400 }
    )
  }

  // Validate leve and grave are non-negative
  if (valor.leve < 0 || valor.grave < 0) {
    return NextResponse.json(
      { error: "leve and grave must be non-negative" },
      { status: 400 }
    )
  }

  // Validate leve < grave when grave > 0
  if (valor.grave > 0 && valor.leve >= valor.grave) {
    return NextResponse.json(
      { error: "leve must be less than grave when grave > 0" },
      { status: 400 }
    )
  }

  // Prepare update data
  const now = new Date().toISOString()
  const updateData = {
    valor,
    actualizado_en: now,
    actualizado_por: session.user.id,
  }

  // Update in database
  const { data, error } = await getSupabaseAdmin()
    .from("configuracion")
    .update(updateData)
    .eq("clave", clave)
    .select()
    .single()

  // Handle errors
  if (error) {
    // Check if it's "no rows returned" (non-existent clave)
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: `Configuration key '${clave}' not found` },
        { status: 404 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
