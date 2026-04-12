// lib/notifications/__tests__/email-template.test.js
import { describe, it, expect } from 'vitest'
import { renderEmailHtml } from '../email-template'

describe('renderEmailHtml', () => {
  it('envuelve el body en estructura HTML con branding', () => {
    const html = renderEmailHtml({ body: 'Hola' })
    expect(html).toContain('<html')
    expect(html).toContain('Riviera Joyas')
    expect(html).toContain('Hola')
  })

  it('escapa caracteres HTML en el body', () => {
    const html = renderEmailHtml({ body: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('convierte saltos de línea a <br>', () => {
    const html = renderEmailHtml({ body: 'linea1\nlinea2' })
    expect(html).toContain('linea1<br>linea2')
  })

  it('incluye footer con aviso de no responder', () => {
    const html = renderEmailHtml({ body: 'x' })
    expect(html).toMatch(/no responder/i)
    expect(html).toContain('info@rivierajoyas.com.uy')
  })
})
