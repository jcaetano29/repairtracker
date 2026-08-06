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
// Countries where users commonly type a trunk "0" before the national number
// (e.g. UY "099...", AR "011..."). E.164 has no trunk 0, so we strip it after
// the dial code before returning.
const TRUNK_ZERO_DIAL_CODES = new Set(["598", "54", "55"]);

export function normalizePhoneToE164(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  const match = SORTED_COUNTRIES.find((c) => {
    const remaining = digits.length - c.dial.length;
    // Minimum plausible national number length after dial code; prevents short strings
    // like "12345" from false-matching short dial codes like US "1".
    return digits.startsWith(c.dial) && remaining >= 6;
  });
  if (match) {
    const rest = digits.slice(match.dial.length);
    const stripped = TRUNK_ZERO_DIAL_CODES.has(match.dial) && rest.startsWith("0")
      ? rest.replace(/^0+/, "")
      : rest;
    return `+${match.dial}${stripped}`;
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
