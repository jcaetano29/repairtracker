// Plantillas predeterminadas SOLO para previsualización en la UI.
// El contenido real que envía WhatsApp lo administra Meta Business Manager
// (los templates aprobados ahí son la verdad). Estos textos deben mantenerse
// en sync manualmente con los templates de Meta cuando se actualicen allá.
export const PLANTILLAS = {
  PRESUPUESTO: `Hola {{clienteNombre}} 👋

Tenemos el presupuesto listo para tu artículo.

🔢 Orden: #{{numeroOrden}}
⌚ Artículo: {{tipoArticulo}}
💰 Presupuesto: {{moneda}} {{monto}}

Avisanos si querés continuar con la reparación.`,

  LISTO_PARA_RETIRO: `Hola {{clienteNombre}} 🎉

¡Tu artículo está listo para retirar!

🔢 Orden: #{{numeroOrden}}
⌚ Artículo: {{tipoArticulo}}

Podés pasar a buscarlo cuando quieras. Ver estado:
{{trackingUrl}}

¡Gracias por confiar en nosotros!`,
}

export function renderPlantilla(tipo, vars = {}) {
  const tpl = PLANTILLAS[tipo]
  if (!tpl) return ""
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key]
    return v === undefined || v === null || v === "" ? `{{${key}}}` : String(v)
  })
}
