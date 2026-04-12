// lib/notifications/__tests__/email.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSend = vi.fn()

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    this.emails = { send: mockSend }
  }),
}))

describe('sendEmail', () => {
  const originalEnv = process.env.RESEND_API_KEY

  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: 'abc' }, error: null })
    process.env.RESEND_API_KEY = 'test-key'
  })

  afterEach(() => {
    process.env.RESEND_API_KEY = originalEnv
  })

  it('warns y retorna sin enviar si falta RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { sendEmail } = await import('../email')
    await sendEmail({ to: 'a@b.com', subject: 's', body: 'b' })
    expect(mockSend).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('no envía si falta `to`', async () => {
    const { sendEmail } = await import('../email')
    await sendEmail({ to: '', subject: 's', body: 'b' })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('envía con from, to, subject, html y text correctos', async () => {
    const { sendEmail } = await import('../email')
    await sendEmail({ to: 'cliente@x.com', subject: 'Hola', body: 'cuerpo' })
    expect(mockSend).toHaveBeenCalledWith({
      from: 'Riviera Joyas <info@rivierajoyas.com.uy>',
      to: 'cliente@x.com',
      subject: 'Hola',
      html: expect.stringContaining('cuerpo'),
      text: 'cuerpo',
    })
  })

  it('lanza error si Resend devuelve error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', statusCode: 422, message: 'bad from' },
    })
    const { sendEmail } = await import('../email')
    await expect(
      sendEmail({ to: 'a@b.com', subject: 's', body: 'b' })
    ).rejects.toThrow(/Resend/)
  })
})
