import { describe, it, expect, vi, beforeEach } from 'vitest'
import { interpolate } from '@/lib/notifications'

// Mocks
const mockSendEmail = vi.fn()
const mockSendWhatsApp = vi.fn()

vi.mock('@/lib/notifications/email', () => ({
  sendEmail: (...args) => mockSendEmail(...args),
}))
vi.mock('@/lib/notifications/whatsapp', () => ({
  sendWhatsApp: (...args) => mockSendWhatsApp(...args),
}))

// Mock Supabase admin
const mockEmailRow = { asunto: 'Asunto {{numeroOrden}}', cuerpo: 'Hola {{clienteNombre}}' }
const mockMetaRow = {
  template_name: 'presupuesto_listo',
  language_code: 'es_AR',
  param_keys: ['clienteNombre', 'numeroOrden', 'tipoArticulo', 'moneda', 'monto'],
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table) => ({
      select: (cols) => ({
        eq: () => ({
          single: () => {
            if (table === 'plantillas_email') return Promise.resolve({ data: mockEmailRow, error: null })
            if (table === 'plantillas_whatsapp_meta') return Promise.resolve({ data: mockMetaRow, error: null })
            return Promise.resolve({ data: null, error: null })
          },
        }),
      }),
    }),
  }),
}))

describe('interpolate', () => {
  it('replaces known variables', () => {
    expect(interpolate('Hola {{nombre}}', { nombre: 'Juan' })).toBe('Hola Juan')
  })
  it('keeps unknown variables as placeholder', () => {
    expect(interpolate('{{a}} {{b}}', { a: 'x' })).toBe('x {{b}}')
  })
  it('replaces multiple occurrences', () => {
    expect(interpolate('{{n}} y {{n}}', { n: 'X' })).toBe('X y X')
  })
  it('handles template with no variables', () => {
    expect(interpolate('Sin', { n: 'J' })).toBe('Sin')
  })
  it('handles empty vars object', () => {
    expect(interpolate('{{n}}', {})).toBe('{{n}}')
  })
})

describe('sendNotification', () => {
  beforeEach(() => {
    mockSendEmail.mockReset()
    mockSendWhatsApp.mockReset()
    mockSendEmail.mockResolvedValue()
    mockSendWhatsApp.mockResolvedValue('wamid.abc123')
  })

  it('envía por email si hay clienteEmail', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteEmail: 'a@b.com',
      clienteNombre: 'Ana',
      numeroOrden: '123',
    })
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: 'a@b.com',
      subject: 'Asunto 123',
      body: 'Hola Ana',
    })
  })

  it('envía por WhatsApp con template y parámetros posicionales', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '099123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(mockSendWhatsApp).toHaveBeenCalledWith({
      to: '099123456',
      templateName: 'presupuesto_listo',
      languageCode: 'es_AR',
      parameters: ['Ana', '123', 'Reloj', 'UYU', '3500'],
    })
  })

  it('envía por ambos canales si hay email y teléfono', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteEmail: 'a@b.com',
      clienteTelefono: '099',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(mockSendEmail).toHaveBeenCalled()
    expect(mockSendWhatsApp).toHaveBeenCalled()
  })

  it('no envía nada si no hay email ni teléfono', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', { clienteNombre: 'Ana' })
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockSendWhatsApp).not.toHaveBeenCalled()
  })

  it('si email falla, WhatsApp igual se envía', async () => {
    mockSendEmail.mockRejectedValue(new Error('boom'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteEmail: 'a@b.com',
      clienteTelefono: '099',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(mockSendWhatsApp).toHaveBeenCalled()
    err.mockRestore()
  })
})
