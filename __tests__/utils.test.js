import { sanitizePhone } from '@/lib/utils'

describe('sanitizePhone', () => {
  it('keeps digits only', () => expect(sanitizePhone('099123456')).toBe('099123456'))
  it('keeps + prefix', () => expect(sanitizePhone('+59899123456')).toBe('+59899123456'))
  it('strips spaces', () => expect(sanitizePhone('+598 99 123')).toBe('+59899123'))
  it('strips dashes', () => expect(sanitizePhone('099-123-456')).toBe('099123456'))
  it('strips letters', () => expect(sanitizePhone('abc')).toBe(''))
  it('handles empty string', () => expect(sanitizePhone('')).toBe(''))
})
