import UY from 'country-flag-icons/react/3x2/UY'
import AR from 'country-flag-icons/react/3x2/AR'
import BR from 'country-flag-icons/react/3x2/BR'
import CL from 'country-flag-icons/react/3x2/CL'
import PY from 'country-flag-icons/react/3x2/PY'
import ES from 'country-flag-icons/react/3x2/ES'
import US from 'country-flag-icons/react/3x2/US'

export const COUNTRIES = [
  { code: 'UY', name: 'Uruguay',   dial: '598', Flag: UY },
  { code: 'AR', name: 'Argentina', dial: '54',  Flag: AR },
  { code: 'BR', name: 'Brasil',    dial: '55',  Flag: BR },
  { code: 'CL', name: 'Chile',     dial: '56',  Flag: CL },
  { code: 'PY', name: 'Paraguay',  dial: '595', Flag: PY },
  { code: 'ES', name: 'España',    dial: '34',  Flag: ES },
  { code: 'US', name: 'EE.UU.',    dial: '1',   Flag: US },
]

export const DEFAULT_COUNTRY = COUNTRIES[0]

export function parsePhone(value) {
  if (!value) return { country: DEFAULT_COUNTRY, number: '' }
  const digits = value.replace(/^\+/, '')
  // Sort by dial length descending so "598" matches before "5"
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
  const match = sorted.find((c) => digits.startsWith(c.dial))
  if (match) {
    return { country: match, number: digits.slice(match.dial.length) }
  }
  return { country: DEFAULT_COUNTRY, number: digits }
}
