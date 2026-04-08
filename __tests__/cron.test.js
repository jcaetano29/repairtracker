// __tests__/cron.test.js
import { isReminderDue } from '@/lib/notifications/reminder-logic'

describe('isReminderDue', () => {
  it('returns true when ciclo_meses have passed since last service', () => {
    const fechaEntrega = new Date()
    fechaEntrega.setMonth(fechaEntrega.getMonth() - 19) // 19 months ago
    expect(isReminderDue(fechaEntrega.toISOString(), 18)).toBe(true)
  })

  it('returns false when ciclo_meses have not passed', () => {
    const fechaEntrega = new Date()
    fechaEntrega.setMonth(fechaEntrega.getMonth() - 10) // 10 months ago
    expect(isReminderDue(fechaEntrega.toISOString(), 18)).toBe(false)
  })

  it('returns true on the exact day the cycle completes', () => {
    const fechaEntrega = new Date()
    fechaEntrega.setMonth(fechaEntrega.getMonth() - 18)
    expect(isReminderDue(fechaEntrega.toISOString(), 18)).toBe(true)
  })
})
