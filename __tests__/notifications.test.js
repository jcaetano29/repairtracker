import { interpolate } from '@/lib/notifications'

describe('interpolate', () => {
  it('replaces known variables', () => {
    const result = interpolate('Hola {{clienteNombre}}', { clienteNombre: 'Juan' })
    expect(result).toBe('Hola Juan')
  })

  it('keeps unknown variables as placeholder', () => {
    const result = interpolate('Hola {{clienteNombre}} {{apellido}}', { clienteNombre: 'Juan' })
    expect(result).toBe('Hola Juan {{apellido}}')
  })

  it('replaces multiple occurrences of the same variable', () => {
    const result = interpolate('{{nombre}} y {{nombre}}', { nombre: 'X' })
    expect(result).toBe('X y X')
  })

  it('handles template with no variables', () => {
    const result = interpolate('Sin variables', { nombre: 'Juan' })
    expect(result).toBe('Sin variables')
  })

  it('handles empty vars object', () => {
    const result = interpolate('Hola {{nombre}}', {})
    expect(result).toBe('Hola {{nombre}}')
  })
})
