import { COUNTRIES, DEFAULT_COUNTRY } from "./countries";

// Longest dial first, so "598" (UY) matches before "1" (US) etc. — same
// ordering rule as lib/countries.js#parsePhone, kept in sync deliberately.
const SORTED_COUNTRIES = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

/**
 * Normaliza un teléfono a E.164 para matchear contra el wa_id que manda Meta.
 * A diferencia de lib/countries.js#parsePhone (que siempre devuelve algo,
 * pensado para un input editable), esta función devuelve null cuando no hay
 * un match confiable — se usa para join contra la base, no para mostrar UI.
 */
export function normalizePhoneToE164(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  const match = SORTED_COUNTRIES.find((c) => {
    const remaining = digits.length - c.dial.length;
    return digits.startsWith(c.dial) && remaining >= 6;
  });
  if (match) {
    return `+${digits}`;
  }

  // Formato legado uruguayo, guardado antes de que existiera el selector de
  // país (ver docs/superpowers/specs/2026-06-13-selector-prefijo-telefono-design.md):
  // local con 0 de tronco, ej "099123456".
  if (digits.startsWith("0") && digits.length === 9) {
    return `+${DEFAULT_COUNTRY.dial}${digits.slice(1)}`;
  }
  if (digits.length === 8) {
    return `+${DEFAULT_COUNTRY.dial}${digits}`;
  }

  return null;
}
