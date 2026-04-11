// __tests__/notifications.test.js
import { ordenCreadaTemplate } from '@/lib/notifications/templates/orden-creada'
import { listoParaRetiroTemplate } from '@/lib/notifications/templates/listo-para-retiro'
import { recordatorioMantenimientoTemplate } from '@/lib/notifications/templates/recordatorio-mantenimiento'

describe('ordenCreadaTemplate', () => {
  it('includes order number in body', () => {
    const { body } = ordenCreadaTemplate({
      numeroOrden: '0042',
      clienteNombre: 'Juan',
      tipoArticulo: 'Reloj',
      marca: 'Casio',
      trackingUrl: 'https://example.com/seguimiento/abc',
    })
    expect(body).toContain('0042')
  })

  it('includes tracking URL in body', () => {
    const { body } = ordenCreadaTemplate({
      numeroOrden: '0042',
      clienteNombre: 'Juan',
      tipoArticulo: 'Reloj',
      marca: 'Casio',
      trackingUrl: 'https://example.com/seguimiento/abc',
    })
    expect(body).toContain('https://example.com/seguimiento/abc')
  })

  it('does not return subject or html', () => {
    const result = ordenCreadaTemplate({
      numeroOrden: '0042',
      clienteNombre: 'Juan',
      tipoArticulo: 'Reloj',
      marca: 'Casio',
      trackingUrl: 'https://example.com/seguimiento/abc',
    })
    expect(result).not.toHaveProperty('subject')
    expect(result).not.toHaveProperty('html')
  })
})

describe('listoParaRetiroTemplate', () => {
  it('includes client name in body', () => {
    const { body } = listoParaRetiroTemplate({
      numeroOrden: '0042',
      clienteNombre: 'María',
      tipoArticulo: 'Reloj',
      marca: 'Tissot',
      trackingUrl: 'https://example.com/seguimiento/xyz',
    })
    expect(body).toContain('María')
  })
})

describe('recordatorioMantenimientoTemplate', () => {
  it('includes service type in body', () => {
    const { body } = recordatorioMantenimientoTemplate({
      clienteNombre: 'Pedro',
      tipoServicio: 'Cambio de pila',
      ultimaFecha: '07 de octubre de 2024',
    })
    expect(body).toContain('Cambio de pila')
  })
})
