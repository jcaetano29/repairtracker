export const MONEDAS = ["UYU", "USD"];

export function monedaPrefix(moneda) {
  return moneda === "USD" ? "US$" : "$U";
}

export function formatMonto(monto, moneda = "UYU") {
  if (monto === null || monto === undefined || monto === "") return "—";
  const n = typeof monto === "number" ? monto : parseFloat(monto);
  if (Number.isNaN(n)) return "—";
  return `${monedaPrefix(moneda)} ${n.toLocaleString("es-UY")}`;
}
