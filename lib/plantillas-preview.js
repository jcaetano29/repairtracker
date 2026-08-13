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

Por favor, respondé a este mensaje con SI si querés continuar con la reparación o con NO si preferís no realizarla.

Importante: este número es únicamente para responder al presupuesto (SI/NO). Si tenés alguna consulta o necesitás comunicarte con nosotros por otro motivo, por favor contactanos a nuestros teléfonos:
+598 2711 9982 / +598 91 966 297

¡Muchas gracias!`,

  LISTO_PARA_RETIRO: `Hola {{clienteNombre}}

¡Tu artículo está listo para retirar!

  🔢 Orden: #{{numeroOrden}}
  ⌚ Artículo: {{tipoArticulo}}

Podés pasar a buscarlo cuando quieras. ¡Gracias por confiar en nosotros!`,
}

export function renderPlantilla(tipo, vars = {}) {
  const tpl = PLANTILLAS[tipo]
  if (!tpl) return ""
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key]
    return v === undefined || v === null || v === "" ? `{{${key}}}` : String(v)
  })
}
