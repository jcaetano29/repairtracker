// lib/notifications/templates/recordatorio-mantenimiento.js
export function recordatorioMantenimientoTemplate({ clienteNombre, tipoServicio, ultimaFecha }) {
  return {
    body: `Hola ${clienteNombre} ⌚

Te recordamos que es momento de hacer el mantenimiento de tu artículo.

🔧 Servicio recomendado: ${tipoServicio}
📅 Último servicio: ${ultimaFecha}

Comunicate con nosotros para coordinar la revisión.`,
  };
}
