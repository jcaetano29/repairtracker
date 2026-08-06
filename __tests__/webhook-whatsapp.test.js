// __tests__/webhook-whatsapp.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'

const originalEnv = { ...process.env }

const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
})

// clientes/whatsapp_conversaciones/whatsapp_mensajes mocks — overridable per test.
let mockClienteResult = { data: [{ id: 'cliente-1' }], error: null }
// Overridable per test to simulate a synchronous throw (e.g. a client library
// error), distinct from mockClienteResult's normal resolved-value shape.
let mockClienteQuery = () => Promise.resolve(mockClienteResult)
let mockConversacionResult = { data: { id: 'conv-1' }, error: null }
const mockMensajeInsert = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table) => {
      if (table === 'notificaciones_enviadas') {
        return { update: (...args) => mockUpdate(...args) }
      }
      if (table === 'clientes') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ limit: () => mockClienteQuery() }),
            }),
          }),
        }
      }
      if (table === 'whatsapp_conversaciones') {
        return {
          upsert: () => ({
            select: () => ({ single: () => Promise.resolve(mockConversacionResult) }),
          }),
        }
      }
      if (table === 'whatsapp_mensajes') {
        return { insert: (...args) => mockMensajeInsert(...args) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

function sign(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

beforeEach(() => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'my-secret-token'
  mockUpdate.mockClear()
  mockMensajeInsert.mockClear()
  mockClienteResult = { data: [{ id: 'cliente-1' }], error: null }
  mockClienteQuery = () => Promise.resolve(mockClienteResult)
  mockConversacionResult = { data: { id: 'conv-1' }, error: null }
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

describe('POST /api/webhook/whatsapp — signature verification', () => {
  it('does not require a signature when WHATSAPP_APP_SECRET is unset (existing behavior)', async () => {
    delete process.env.WHATSAPP_APP_SECRET
    const { POST } = await import('@/app/api/webhook/whatsapp/route')
    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      body: JSON.stringify({ entry: [] }),
    }))
    expect(res.status).toBe(200)
  })

  it('rejects an invalid signature when WHATSAPP_APP_SECRET is set', async () => {
    process.env.WHATSAPP_APP_SECRET = 'app-secret'
    const { POST } = await import('@/app/api/webhook/whatsapp/route')
    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
      body: JSON.stringify({ entry: [] }),
    }))
    expect(res.status).toBe(401)
  })

  it('accepts a valid signature when WHATSAPP_APP_SECRET is set', async () => {
    process.env.WHATSAPP_APP_SECRET = 'app-secret'
    const { POST } = await import('@/app/api/webhook/whatsapp/route')
    const rawBody = JSON.stringify({ entry: [] })
    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'x-hub-signature-256': sign(rawBody, 'app-secret') },
      body: rawBody,
    }))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/webhook/whatsapp — incoming messages', () => {
  it('persists a text message from a known client and updates the conversation', async () => {
    const { POST } = await import('@/app/api/webhook/whatsapp/route')

    const rawBody = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ id: 'wamid.in1', from: '59899111222', type: 'text', text: { body: 'Hola' } }] } }] }],
    })

    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      body: rawBody,
    }))

    expect(res.status).toBe(200)
    expect(mockMensajeInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversacion_id: 'conv-1',
        direccion: 'entrante',
        wa_message_id: 'wamid.in1',
        tipo: 'text',
        body: 'Hola',
      })
    )
  })

  it('skips a message from an unknown phone number', async () => {
    mockClienteResult = { data: [], error: null }
    const { POST } = await import('@/app/api/webhook/whatsapp/route')

    const rawBody = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ id: 'wamid.in2', from: '59891234567', type: 'text', text: { body: 'Hola' } }] } }] }],
    })

    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      body: rawBody,
    }))

    expect(res.status).toBe(200)
    expect(mockMensajeInsert).not.toHaveBeenCalled()
  })

  it('does not fail the whole request if persisting one message errors', async () => {
    // Force a synchronous throw inside persistIncomingMessage so this genuinely
    // exercises the per-message try/catch in the POST handler, rather than the
    // ordinary "no client matched" early-return path.
    mockClienteQuery = () => {
      throw new Error('boom')
    }
    const { POST } = await import('@/app/api/webhook/whatsapp/route')

    const rawBody = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ id: 'wamid.in3', from: '59899111222', type: 'text', text: { body: 'x' } }] } }] }],
    })

    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      body: rawBody,
    }))

    expect(res.status).toBe(200)
  })
})
