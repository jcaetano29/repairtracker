// lib/notifications/templates/listo-para-retiro.js
export function listoParaRetiroTemplate({ numeroOrden, clienteNombre, tipoArticulo, marca, trackingUrl }) {
  const articulo = marca ? `${tipoArticulo} — ${marca}` : tipoArticulo;
  return {
    body: `Hola ${clienteNombre} 🎉

¡Tu artículo está listo para retirar!

🔢 Orden: #${numeroOrden}
⌚ Artículo: ${articulo}

Podés pasar a buscarlo cuando quieras. Ver estado:
${trackingUrl}

¡Gracias por confiar en nosotros!`,
  };
}
