// lib/notifications/templates/listo-para-retiro.js
export function listoParaRetiroTemplate({ numeroOrden, clienteNombre, tipoArticulo, marca, trackingUrl }) {
  return {
    subject: `RepairTrack — Orden #${numeroOrden} lista para retirar 🎉`,
    html: `
<!DOCTYPE html>
<html lang="es">
<body style="font-family: sans-serif; background: #f1f5f9; padding: 24px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 36px;">🎉</span>
      <h1 style="font-size: 18px; color: #0f172a; margin: 8px 0 0;">RepairTrack</h1>
    </div>

    <h2 style="font-size: 20px; color: #0f172a; margin: 0 0 8px;">Hola ${clienteNombre},</h2>
    <p style="color: #475569; font-size: 15px; margin: 0 0 24px;">
      Tu artículo está listo y podés pasar a buscarlo cuando quieras.
    </p>

    <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Listo para retiro</div>
      <div style="font-size: 22px; font-weight: 800; color: #22c55e; font-family: monospace;">#${numeroOrden}</div>
      <div style="font-size: 14px; color: #334155; margin-top: 8px;">${tipoArticulo}${marca ? ` — ${marca}` : ''}</div>
    </div>

    <a href="${trackingUrl}" style="display: block; text-align: center; background: #22c55e; color: white; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 15px; margin-bottom: 24px;">
      Ver estado de mi orden →
    </a>

    <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
      ¡Gracias por confiar en nosotros!
    </p>
  </div>
</body>
</html>`,
  };
}
