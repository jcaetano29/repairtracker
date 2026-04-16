"use client";

const TRASLADO_BADGE = {
  pendiente: {
    label: "Pendiente despacho",
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    icon: "📦",
  },
  en_transito: {
    label: "En tránsito",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    icon: "🚚",
  },
};

export function TrasladosBadge({ tipo, estado }) {
  if (!estado || estado === "recibido") return null;

  const config = TRASLADO_BADGE[estado];
  if (!config) return null;

  const suffix = tipo === "retorno" ? " (retorno)" : "";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${config.bg} ${config.border} ${config.text}`}
    >
      {config.icon} {config.label}{suffix}
    </span>
  );
}
