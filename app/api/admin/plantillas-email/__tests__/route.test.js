import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
const mockUpdate = vi.fn()
const mockSelect = vi.fn()

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: (...args) => mockSelect(...args),
      update: (...args) => mockUpdate(...args),
    }),
  }),
}))

describe('GET /api/admin/plantillas-email', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockSelect.mockReset()
  })

  it('returns 401 si no hay sesión', async () => {
    mockAuth.mockResolvedValue(null)
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns plantillas si autenticado', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } })
    mockSelect.mockReturnValue({
      order: () => Promise.resolve({
        data: [{ tipo: 'PRESUPUESTO', asunto: 'A', cuerpo: 'B', updated_at: 't' }],
        error: null,
      }),
    })
    const { GET } = await import('../route')
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.plantillas).toHaveLength(1)
  })
})

describe('PATCH /api/admin/plantillas-email', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockUpdate.mockReset()
  })

  function makeReq(body) {
    return { json: () => Promise.resolve(body) }
  }

  it('returns 403 si no es admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'operador' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'PRESUPUESTO', asunto: 'x', cuerpo: 'y' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 si tipo inválido', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'INVALID', asunto: 'x', cuerpo: 'y' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 si asunto vacío', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'PRESUPUESTO', asunto: '', cuerpo: 'y' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 si cuerpo vacío', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'PRESUPUESTO', asunto: 'x', cuerpo: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 si asunto > 150 chars', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'PRESUPUESTO', asunto: 'x'.repeat(151), cuerpo: 'y' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 si cuerpo > 2000 chars', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'PRESUPUESTO', asunto: 'x', cuerpo: 'y'.repeat(2001) }))
    expect(res.status).toBe(400)
  })

  it('actualiza correctamente', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    mockUpdate.mockReturnValue({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({
            data: { tipo: 'PRESUPUESTO', asunto: 'x', cuerpo: 'y', updated_at: 't' },
            error: null,
          }),
        }),
      }),
    })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeReq({ tipo: 'PRESUPUESTO', asunto: 'x', cuerpo: 'y' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
