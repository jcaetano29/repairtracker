import { getNivelRetraso, formatNumeroOrden } from '@/lib/constants'

describe('getNivelRetraso', () => {
  it('returns none when under leve threshold', () => {
    expect(getNivelRetraso('INGRESADO', 1)).toBe('none')
  })
  it('returns leve at leve threshold', () => {
    expect(getNivelRetraso('INGRESADO', 2)).toBe('leve')
  })
  it('returns grave at grave threshold', () => {
    expect(getNivelRetraso('INGRESADO', 5)).toBe('grave')
  })
  it('returns none for states without thresholds', () => {
    expect(getNivelRetraso('ENTREGADO', 100)).toBe('none')
  })
})

describe('formatNumeroOrden', () => {
  it('pads single digit to 4 chars', () => {
    expect(formatNumeroOrden(1)).toBe('0001')
  })
  it('does not truncate 5+ digit numbers', () => {
    expect(formatNumeroOrden(12345)).toBe('12345')
  })
})
