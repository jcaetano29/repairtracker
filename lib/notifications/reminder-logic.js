// lib/notifications/reminder-logic.js

/**
 * Returns true if ciclo_meses months have passed since fechaEntrega.
 * Handles month overflow correctly (e.g., Jan 31 + 1 month = Feb 28, not Mar 3).
 * @param {string} fechaEntrega - ISO date string
 * @param {number} cicloMeses - reminder cycle in months
 */
export function isReminderDue(fechaEntrega, cicloMeses) {
  const entrega = new Date(fechaEntrega);
  const targetMonth = entrega.getMonth() + cicloMeses;
  const due = new Date(entrega.getFullYear(), targetMonth, entrega.getDate());
  // If the day overflowed (e.g., Feb 31 → Mar 3), clamp to last day of target month
  if (due.getMonth() !== targetMonth % 12) {
    due.setDate(0); // sets to last day of previous month
  }
  return new Date() >= due;
}
