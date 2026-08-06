import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks
const mockSendWhatsApp = vi.fn()

vi.mock('@/lib/notifications/whatsapp', () => ({
  sendWhatsApp: (...args) => mockSendWhatsApp(...args),
}))

// Mock Supabase admin — only plantillas_whatsapp_meta is queried now
const mockMetaRow = {
  template_name: 'presupuesto_ready_v2',
  language_code: 'en',
  param_keys: ['clienteNombre', 'numeroOrden', 'tipoArticulo', 'moneda', 'monto'],
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: () => {
            if (table === 'plantillas_whatsapp_meta') {
              return Promise.resolve({ data: mockMetaRow, error: null })
            }
            return Promise.resolve({ data: null, error: null })
          },
        }),
      }),
    }),
  }),
}))

describe('sendNotification', () => {
  beforeEach(() => {
    mockSendWhatsApp.mockReset()
    mockSendWhatsApp.mockResolvedValue('wamid.abc123')
  })

  it('envía por WhatsApp si hay clienteTelefono', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '59899123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(mockSendWhatsApp).toHaveBeenCalledWith({
      to: '59899123456',
      templateName: 'presupuesto_ready_v2',
      languageCode: 'en',
      parameters: ['Ana', '123', 'Reloj', 'UYU', '3500'],
    })
  })

  it('no envía nada si no hay clienteTelefono', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', { clienteNombre: 'Ana' })
    expect(mockSendWhatsApp).not.toHaveBeenCalled()
  })

  it('ignora silenciosamente clienteEmail (backward compat con callers viejos)', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteEmail: 'a@b.com',
      clienteTelefono: '59899123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    // Solo WhatsApp se llama. El email se ignora.
    expect(mockSendWhatsApp).toHaveBeenCalledOnce()
    expect(mockSendWhatsApp).toHaveBeenCalledWith({
      to: '59899123456',
      templateName: 'presupuesto_ready_v2',
      languageCode: 'en',
      parameters: ['Ana', '123', 'Reloj', 'UYU', '3500'],
    })
  })

  it('loguea el error si WhatsApp falla pero no propaga', async () => {
    mockSendWhatsApp.mockRejectedValue(new Error('boom'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sendNotification } = await import('@/lib/notifications')
    // resolves without throwing — non-propagation is asserted by the test not rejecting
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '59899123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})
