import { parsePhone, COUNTRIES, DEFAULT_COUNTRY } from '@/lib/countries'

describe('parsePhone', () => {
  it('empty value → UY + empty', () => {
    expect(parsePhone('')).toEqual({ country: DEFAULT_COUNTRY, number: '' })
  })

  it('UY full prefix', () => {
    expect(parsePhone('59899123456')).toEqual({
      country: COUNTRIES.find((c) => c.code === 'UY'),
      number: '99123456',
    })
  })

  it('accepts leading +', () => {
    expect(parsePhone('+59899123456').number).toBe('99123456')
  })

  it('Argentina prefix', () => {
    expect(parsePhone('5491112345678')).toEqual({
      country: COUNTRIES.find((c) => c.code === 'AR'),
      number: '91112345678',
    })
  })

  it('legacy Uruguay local without prefix → UY fallback, full number', () => {
    expect(parsePhone('099123456')).toEqual({
      country: DEFAULT_COUNTRY,
      number: '099123456',
    })
  })

  it('US prefix', () => {
    expect(parsePhone('1234567890')).toEqual({
      country: COUNTRIES.find((c) => c.code === 'US'),
      number: '234567890',
    })
  })

  it('longest-prefix-wins: 598… matches UY, not US (1) or AR (54)/BR (55)', () => {
    expect(parsePhone('59899').country.code).toBe('UY')
  })

  it('DEFAULT_COUNTRY is Uruguay', () => {
    expect(DEFAULT_COUNTRY.code).toBe('UY')
  })

  it('COUNTRIES contains the 7 expected codes', () => {
    expect(COUNTRIES.map((c) => c.code)).toEqual(['UY', 'AR', 'BR', 'CL', 'PY', 'ES', 'US'])
  })
})
