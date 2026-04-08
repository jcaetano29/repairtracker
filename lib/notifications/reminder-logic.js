// lib/notifications/reminder-logic.js

/**
 * Returns true if ciclo_meses months have passed since fechaEntrega.
 * @param {string} fechaEntrega - ISO date string
 * @param {number} cicloMeses - reminder cycle in months
 */
export function isReminderDue(fechaEntrega, cicloMeses) {
  const entrega = new Date(fechaEntrega);
  const due = new Date(entrega);
  due.setMonth(due.getMonth() + cicloMeses);
  return new Date() >= due;
}
