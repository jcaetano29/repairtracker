// __tests__/notifications.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks
const mockSendWhatsApp = vi.fn()

vi.mock('@/lib/notifications/whatsapp', () => ({
  sendWhatsApp: (...args) => mockSendWhatsApp(...args),
}))

// Mock Supabase admin — plantillas_whatsapp_meta (send), plantillas_whatsapp
// (preview text for the thread), clientes/whatsapp_conversaciones/whatsapp_mensajes (new).
const mockMetaRow = {
  template_name: 'presupuesto_ready_v2',
  language_code: 'en',
  param_keys: ['clienteNombre', 'numeroOrden', 'tipoArticulo', 'moneda', 'monto'],
}
const mockPreviewRow = { mensaje: 'Hola {{clienteNombre}}, tu presupuesto de {{tipoArticulo}} está listo.' }
const mockMensajeInsert = vi.fn().mockResolvedValue({ error: null })
let mockClienteResult = { data: { id: 'cliente-1' }, error: null }

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table) => {
      if (table === 'plantillas_whatsapp_meta') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockMetaRow, error: null }) }) }) }
      }
      if (table === 'plantillas_whatsapp') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockPreviewRow, error: null }) }) }) }
      }
      if (table === 'clientes') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(mockClienteResult) }) }) }
      }
      if (table === 'whatsapp_conversaciones') {
        return { upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'conv-1' }, error: null }) }) }) }
      }
      if (table === 'whatsapp_mensajes') {
        return { insert: (...args) => mockMensajeInsert(...args) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

describe('sendNotification', () => {
  beforeEach(() => {
    mockSendWhatsApp.mockReset()
    mockSendWhatsApp.mockResolvedValue('wamid.abc123')
    mockMensajeInsert.mockClear()
    mockClienteResult = { data: { id: 'cliente-1' }, error: null }
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

  it('registra el mensaje saliente en whatsapp_mensajes con el wa_message_id devuelto', async () => {
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '59899123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(mockMensajeInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversacion_id: 'conv-1',
        direccion: 'saliente',
        wa_message_id: 'wamid.abc123',
        tipo: 'text',
        body: 'Hola Ana, tu presupuesto de Reloj está listo.',
        estado: 'enviado',
      })
    )
  })

  it('no registra el mensaje saliente si el envío de WhatsApp falla', async () => {
    mockSendWhatsApp.mockRejectedValue(new Error('meta down'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '59899123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(mockMensajeInsert).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('no registra el mensaje saliente si el teléfono no matchea ningún cliente', async () => {
    mockClienteResult = { data: null, error: null }
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '59899123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(mockMensajeInsert).not.toHaveBeenCalled()
  })

  it('loguea el error si el insert en whatsapp_mensajes falla, pero no propaga', async () => {
    mockMensajeInsert.mockResolvedValueOnce({ error: { message: 'db down' } })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sendNotification } = await import('@/lib/notifications')
    await sendNotification('PRESUPUESTO', {
      clienteTelefono: '59899123456',
      clienteNombre: 'Ana',
      numeroOrden: '123',
      tipoArticulo: 'Reloj',
      moneda: 'UYU',
      monto: '3500',
    })
    expect(mockMensajeInsert).toHaveBeenCalledOnce()
    expect(err).toHaveBeenCalledWith(
      '[Notifications] Error inserting outbound whatsapp message:',
      { message: 'db down' }
    )
    err.mockRestore()
  })
})
