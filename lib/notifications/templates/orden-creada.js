// lib/notifications/templates/orden-creada.js
export function ordenCreadaTemplate({ numeroOrden, clienteNombre, tipoArticulo, marca, trackingUrl }) {
  const articulo = marca ? `${tipoArticulo} — ${marca}` : tipoArticulo;
  return {
    body: `Hola ${clienteNombre} 👋

Tu artículo ingresó a nuestro taller correctamente.

🔢 Orden: #${numeroOrden}
⌚ Artículo: ${articulo}

Podés seguir el estado de tu orden acá:
${trackingUrl}

Te avisamos cuando esté listo para retirar.`,
  };
}
