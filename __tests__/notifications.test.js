import { describe, it, expect, vi, beforeEach } from 'vitest'
import { interpolate } from '@/lib/notifications'

// Mocks para sendEmail y sendWhatsApp
const mockSendEmail = vi.fn()
const mockSendWhatsApp = vi.fn()

vi.mock('@/lib/notifications/email', () => ({
  sendEmail: (...args) => mockSendEmail(...args),
}))
vi.mock('@/lib/notifications/whatsapp', () => ({
  sendWhatsApp: (...args) => mockSendWhatsApp(...args),
}))

// Mock Supabase admin para devolver plantillas
const mockEmailRow = { asunto: 'Asunto {{numeroOrden}}', cuerpo: 'Hola {{clienteNombre}}' }
const mockWaRow = { mensaje: 'WA {{clienteNombre}}' }

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: () => {
            if (table === 'plantillas_email') return Promise.resolve({ data: mockEmailRow, error: null })
            if (table === 'plantillas_whatsapp') return Promise.resolve({ data: mockWaRow, error: null })
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
    mockSendWhatsApp.mockResolvedValue()
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

  it('envía por WhatsApp si hay clienteTelefono', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '099123456',
      clienteNombre: 'Ana',
    })
    expect(mockSendWhatsApp).toHaveBeenCalledWith({
      to: '099123456',
      body: 'WA Ana',
    })
  })

  it('envía por ambos canales si hay email y teléfono', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteEmail: 'a@b.com',
      clienteTelefono: '099',
      clienteNombre: 'Ana',
      numeroOrden: '123',
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
    })
    expect(mockSendWhatsApp).toHaveBeenCalled()
    err.mockRestore()
  })
})
