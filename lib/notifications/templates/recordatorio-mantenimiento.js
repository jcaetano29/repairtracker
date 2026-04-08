// lib/notifications/templates/recordatorio-mantenimiento.js
export function recordatorioMantenimientoTemplate({ clienteNombre, tipoServicio, ultimaFecha }) {
  return {
    subject: `RepairTrack — Recordatorio: ${tipoServicio}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<body style="font-family: sans-serif; background: #f1f5f9; padding: 24px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 36px;">⌚</span>
      <h1 style="font-size: 18px; color: #0f172a; margin: 8px 0 0;">RepairTrack</h1>
    </div>

    <h2 style="font-size: 20px; color: #0f172a; margin: 0 0 8px;">Hola ${clienteNombre},</h2>
    <p style="color: #475569; font-size: 15px; margin: 0 0 24px;">
      Te recordamos que es momento de hacer el mantenimiento de tu artículo.
    </p>

    <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Servicio recomendado</div>
      <div style="font-size: 18px; font-weight: 700; color: #92400e;">${tipoServicio}</div>
      <div style="font-size: 13px; color: #78350f; margin-top: 4px;">Último servicio: ${ultimaFecha}</div>
    </div>

    <p style="color: #475569; font-size: 14px; margin: 0 0 24px;">
      Comunicate con nosotros para coordinar la revisión.
    </p>

    <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
      Si no querés recibir estos recordatorios, respondé este email.
    </p>
  </div>
</body>
</html>`,
  };
}
