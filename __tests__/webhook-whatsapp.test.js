import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const originalEnv = { ...process.env }

const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (...args) => mockUpdate(...args),
    }),
  }),
}))

beforeEach(() => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'my-secret-token'
  mockUpdate.mockClear()
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('GET /api/webhook/whatsapp — verification', () => {
  it('returns challenge when verify token matches', async () => {
    const { GET } = await import('@/app/api/webhook/whatsapp/route')
    const url = new URL('http://localhost/api/webhook/whatsapp')
    url.searchParams.set('hub.mode', 'subscribe')
    url.searchParams.set('hub.verify_token', 'my-secret-token')
    url.searchParams.set('hub.challenge', 'challenge_abc')

    const res = await GET(new Request(url.toString()))
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toBe('challenge_abc')
  })

  it('returns 403 when verify token does not match', async () => {
    const { GET } = await import('@/app/api/webhook/whatsapp/route')
    const url = new URL('http://localhost/api/webhook/whatsapp')
    url.searchParams.set('hub.mode', 'subscribe')
    url.searchParams.set('hub.verify_token', 'wrong-token')
    url.searchParams.set('hub.challenge', 'challenge_abc')

    const res = await GET(new Request(url.toString()))
    expect(res.status).toBe(403)
  })

  it('returns 403 when hub.mode is not subscribe', async () => {
    const { GET } = await import('@/app/api/webhook/whatsapp/route')
    const url = new URL('http://localhost/api/webhook/whatsapp')
    url.searchParams.set('hub.mode', 'unsubscribe')
    url.searchParams.set('hub.verify_token', 'my-secret-token')
    url.searchParams.set('hub.challenge', 'challenge_abc')

    const res = await GET(new Request(url.toString()))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/webhook/whatsapp — status updates', () => {
  it('updates notificaciones_enviadas on delivered status', async () => {
    const { POST } = await import('@/app/api/webhook/whatsapp/route')

    const payload = {
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: 'wamid.abc123',
              status: 'delivered',
              timestamp: '1234567890',
            }],
          },
        }],
      }],
    }

    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      estado: 'delivered',
      enviado: true,
    })
  })

  it('marks as failed with error message', async () => {
    const { POST } = await import('@/app/api/webhook/whatsapp/route')

    const payload = {
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: 'wamid.abc123',
              status: 'failed',
              timestamp: '1234567890',
              errors: [{ title: 'Message undeliverable' }],
            }],
          },
        }],
      }],
    }

    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      estado: 'failed',
      enviado: false,
      error: 'Message undeliverable',
    })
  })

  it('always returns 200 even on malformed payload', async () => {
    const { POST } = await import('@/app/api/webhook/whatsapp/route')
    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(200)
  })
})
