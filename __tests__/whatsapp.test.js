import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Save original env
const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.WHATSAPP_TOKEN = 'test-token'
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456'
})

afterEach(() => {
  process.env = { ...originalEnv }
  vi.restoreAllMocks()
})

describe('sendWhatsApp', () => {
  it('sends a template message with correct payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: 'wamid.abc123' }] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { sendWhatsApp } = await import('@/lib/notifications/whatsapp')

    const result = await sendWhatsApp({
      to: '+54 9 11 1234-5678',
      templateName: 'presupuesto_listo',
      languageCode: 'es_AR',
      parameters: ['Juan', '1234', 'Reloj', 'UYU', '3500'],
    })

    expect(result).toBe('wamid.abc123')

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v20.0/123456/messages')
    expect(options.headers.Authorization).toBe('Bearer test-token')

    const body = JSON.parse(options.body)
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '5491112345678',
      type: 'template',
      template: {
        name: 'presupuesto_listo',
        language: { code: 'es_AR' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: 'Juan' },
            { type: 'text', text: '1234' },
            { type: 'text', text: 'Reloj' },
            { type: 'text', text: 'UYU' },
            { type: 'text', text: '3500' },
          ],
        }],
      },
    })
  })

  it('returns null when phone is missing', async () => {
    const { sendWhatsApp } = await import('@/lib/notifications/whatsapp')
    const result = await sendWhatsApp({ to: '', templateName: 'test', languageCode: 'es_AR', parameters: [] })
    expect(result).toBeNull()
  })

  it('returns null when env vars are missing', async () => {
    delete process.env.WHATSAPP_TOKEN
    const { sendWhatsApp } = await import('@/lib/notifications/whatsapp')
    const result = await sendWhatsApp({ to: '099123456', templateName: 'test', languageCode: 'es_AR', parameters: [] })
    expect(result).toBeNull()
  })

  it('throws on API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { code: 100 } }),
    }))
    const { sendWhatsApp } = await import('@/lib/notifications/whatsapp')
    await expect(
      sendWhatsApp({ to: '5491112345678', templateName: 'test', languageCode: 'es_AR', parameters: [] })
    ).rejects.toThrow('WhatsApp API error 400')
  })
})
