// __tests__/notifications.test.js
import { ordenCreadaTemplate } from '@/lib/notifications/templates/orden-creada'
import { listoParaRetiroTemplate } from '@/lib/notifications/templates/listo-para-retiro'
import { recordatorioMantenimientoTemplate } from '@/lib/notifications/templates/recordatorio-mantenimiento'

describe('ordenCreadaTemplate', () => {
  it('includes order number in subject', () => {
    const { subject } = ordenCreadaTemplate({
      numeroOrden: '0042',
      clienteNombre: 'Juan',
      tipoArticulo: 'Reloj',
      marca: 'Casio',
      trackingUrl: 'https://example.com/seguimiento/abc',
    })
    expect(subject).toContain('0042')
  })

  it('includes tracking URL in html', () => {
    const { html } = ordenCreadaTemplate({
      numeroOrden: '0042',
      clienteNombre: 'Juan',
      tipoArticulo: 'Reloj',
      marca: 'Casio',
      trackingUrl: 'https://example.com/seguimiento/abc',
    })
    expect(html).toContain('https://example.com/seguimiento/abc')
  })
})

describe('listoParaRetiroTemplate', () => {
  it('includes client name in html', () => {
    const { html } = listoParaRetiroTemplate({
      numeroOrden: '0042',
      clienteNombre: 'María',
      tipoArticulo: 'Reloj',
      marca: 'Tissot',
      trackingUrl: 'https://example.com/seguimiento/xyz',
    })
    expect(html).toContain('María')
  })
})

describe('recordatorioMantenimientoTemplate', () => {
  it('includes service type in subject', () => {
    const { subject } = recordatorioMantenimientoTemplate({
      clienteNombre: 'Pedro',
      tipoServicio: 'Cambio de pila',
      ultimaFecha: '2024-10-07',
    })
    expect(subject).toContain('Cambio de pila')
  })
})
