import { auth } from '@/auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

const ALLOWED_TIPOS = ['PRESUPUESTO', 'LISTO_PARA_RETIRO', 'RECORDATORIO_MANTENIMIENTO']
const MAX_ASUNTO = 150
const MAX_CUERPO = 2000

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('plantillas_email')
    .select('tipo, asunto, cuerpo, updated_at')
    .order('tipo')

  if (error) {
    console.error('[/api/admin/plantillas-email] GET error:', error)
    return NextResponse.json({ error: 'Error al obtener plantillas' }, { status: 500 })
  }

  return NextResponse.json({ plantillas: data })
}

export async function PATCH(request) {
  const session = await auth()
  if (!session?.user?.role || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { tipo, asunto, cuerpo } = body

  if (!tipo || typeof asunto !== 'string' || typeof cuerpo !== 'string') {
    return NextResponse.json(
      { error: 'tipo, asunto y cuerpo son requeridos' },
      { status: 400 }
    )
  }

  if (!ALLOWED_TIPOS.includes(tipo)) {
    return NextResponse.json({ error: 'Tipo de plantilla no válido' }, { status: 400 })
  }

  if (asunto.trim().length === 0) {
    return NextResponse.json({ error: 'asunto no puede estar vacío' }, { status: 400 })
  }

  if (cuerpo.trim().length === 0) {
    return NextResponse.json({ error: 'cuerpo no puede estar vacío' }, { status: 400 })
  }

  if (asunto.length > MAX_ASUNTO) {
    return NextResponse.json(
      { error: `asunto demasiado largo (máx ${MAX_ASUNTO} caracteres)` },
      { status: 400 }
    )
  }

  if (cuerpo.length > MAX_CUERPO) {
    return NextResponse.json(
      { error: `cuerpo demasiado largo (máx ${MAX_CUERPO} caracteres)` },
      { status: 400 }
    )
  }

  const { data, error } = await getSupabaseAdmin()
    .from('plantillas_email')
    .update({ asunto, cuerpo, updated_at: new Date().toISOString() })
    .eq('tipo', tipo)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })
    }
    console.error('[/api/admin/plantillas-email] PATCH error:', error)
    return NextResponse.json({ error: 'Error al actualizar plantilla' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
