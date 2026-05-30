export const metadata = {
  title: "Política de Privacidad — RepairTracker",
  description:
    "Política de privacidad de RepairTracker: qué datos recolectamos, cómo los usamos y cómo ejercer tus derechos.",
}

const ULTIMA_ACTUALIZACION = "30 de mayo de 2026"
const RESPONSABLE = "RepairTracker"
const CONTACTO_EMAIL = "joacocaetano@gmail.com"

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <span className="text-2xl">⌚</span>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">RepairTracker</h1>
            <p className="text-sm text-slate-400">Política de Privacidad</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <article className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 space-y-6 text-slate-700 leading-relaxed">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Política de Privacidad</h2>
            <p className="text-sm text-slate-500">Última actualización: {ULTIMA_ACTUALIZACION}</p>
          </div>

          <section className="space-y-2">
            <p>
              {RESPONSABLE} (en adelante, &ldquo;la Aplicación&rdquo;) es un sistema de gestión interna
              utilizado por relojerías y joyerías para administrar órdenes de reparación, talleres
              externos, traslados entre sucursales y la comunicación con sus clientes. Esta política
              describe qué datos personales tratamos, con qué finalidad, durante cuánto tiempo y qué
              derechos tenés sobre esa información.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">1. Responsable del tratamiento</h3>
            <p>
              El responsable del tratamiento de los datos personales gestionados a través de la
              Aplicación es el comercio (relojería o joyería) que la utiliza como herramienta interna.
              Para consultas sobre esta política o el desarrollo técnico de la Aplicación podés
              escribir a: <a className="text-indigo-600 underline" href={`mailto:${CONTACTO_EMAIL}`}>{CONTACTO_EMAIL}</a>.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">2. Datos que recolectamos</h3>
            <p>Tratamos las siguientes categorías de datos:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Datos de clientes finales:</strong> nombre, número de teléfono (incluido el de
                WhatsApp), y descripción del artículo entregado para reparación (tipo, marca, modelo,
                observaciones).
              </li>
              <li>
                <strong>Datos operativos de la orden:</strong> estado, fechas, montos presupuestados,
                sucursal de origen, taller asignado y movimientos de traslado.
              </li>
              <li>
                <strong>Datos de usuarios internos:</strong> nombre, correo electrónico, rol
                (administrador, empleado, cadete) y sucursal asignada para acceder a la Aplicación.
              </li>
              <li>
                <strong>Mensajes de WhatsApp:</strong> contenido de las notificaciones enviadas
                mediante plantillas aprobadas de Meta (por ejemplo, aviso de orden lista) y el estado
                de entrega de esos mensajes (enviado, entregado, leído, fallido).
              </li>
              <li>
                <strong>Datos técnicos:</strong> registros de actividad (logs) necesarios para
                seguridad, auditoría y diagnóstico de errores.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">3. Finalidad del tratamiento</h3>
            <p>Los datos se utilizan exclusivamente para:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Gestionar internamente las órdenes de reparación y su trazabilidad.</li>
              <li>
                Notificar al cliente sobre el avance de su reparación a través de WhatsApp, correo
                electrónico u otros canales habilitados.
              </li>
              <li>Coordinar traslados entre sucursales y talleres externos.</li>
              <li>Generar reportes operativos y estadísticas internas del negocio.</li>
              <li>Cumplir con obligaciones legales, contables y fiscales aplicables.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">4. Base legal</h3>
            <p>
              El tratamiento se basa en (a) la ejecución del contrato de servicio de reparación
              solicitado por el cliente, (b) el interés legítimo del comercio en gestionar su
              operatoria interna y (c) el consentimiento del cliente al proporcionar su número de
              teléfono para recibir notificaciones sobre su orden.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">5. Compartición de datos con terceros</h3>
            <p>
              <strong>No vendemos ni comercializamos datos personales.</strong> Los datos se comparten
              únicamente con proveedores estrictamente necesarios para el funcionamiento del servicio:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Meta Platforms, Inc.</strong> — para el envío de mensajes mediante la API de
                WhatsApp Business.
              </li>
              <li>
                <strong>Supabase</strong> — proveedor de base de datos y autenticación.
              </li>
              <li>
                <strong>Vercel</strong> — proveedor de hosting de la Aplicación.
              </li>
              <li>
                <strong>Resend</strong> — proveedor de envío de correos electrónicos transaccionales.
              </li>
              <li>
                <strong>Talleres externos</strong> contratados por el comercio, exclusivamente con
                los datos necesarios para identificar la pieza enviada.
              </li>
            </ul>
            <p>
              Estos proveedores actúan como encargados del tratamiento y están sujetos a sus propias
              políticas de privacidad.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">6. Conservación de los datos</h3>
            <p>
              Los datos relativos a una orden de reparación se conservan mientras dure la relación
              comercial y durante los plazos exigidos por la legislación aplicable (por ejemplo,
              obligaciones fiscales). Las órdenes entregadas pueden conservarse de forma archivada
              con fines históricos y de garantía. Los mensajes y registros de entrega de WhatsApp se
              conservan por un máximo de doce (12) meses.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">7. Derechos del titular</h3>
            <p>
              Como titular de los datos podés ejercer los derechos de acceso, rectificación,
              supresión, oposición, limitación y portabilidad. También podés solicitar dejar de
              recibir notificaciones por WhatsApp en cualquier momento respondiendo &ldquo;BAJA&rdquo;
              al mensaje recibido o contactándonos directamente.
            </p>
            <p>
              Para ejercer estos derechos escribí a{" "}
              <a className="text-indigo-600 underline" href={`mailto:${CONTACTO_EMAIL}`}>{CONTACTO_EMAIL}</a>{" "}
              indicando la solicitud concreta. Responderemos dentro de los plazos previstos por la
              normativa aplicable.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">8. Seguridad</h3>
            <p>
              Aplicamos medidas técnicas y organizativas razonables para proteger los datos: acceso
              restringido por roles, autenticación con contraseñas cifradas, conexiones cifradas
              (HTTPS) y registros de auditoría. Ningún sistema es absolutamente infalible, por lo que
              no podemos garantizar una seguridad absoluta, pero trabajamos para minimizar los
              riesgos.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">9. Menores de edad</h3>
            <p>
              La Aplicación no está dirigida a menores de edad. No recolectamos datos de menores de
              forma intencional. Si detectás que un menor proporcionó datos sin autorización,
              contactanos para eliminarlos.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">10. Transferencias internacionales</h3>
            <p>
              Algunos proveedores (Meta, Supabase, Vercel, Resend) pueden procesar datos fuera del
              país del comercio. En todos los casos se trata de proveedores con políticas de
              cumplimiento internacional (GDPR, LGPD, entre otras).
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">11. Cambios en esta política</h3>
            <p>
              Podemos actualizar esta política cuando sea necesario para reflejar cambios legales o
              en el servicio. La fecha de la última actualización se indica al inicio del documento.
              El uso continuado de la Aplicación implica la aceptación de la versión vigente.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">12. Contacto</h3>
            <p>
              Para cualquier consulta sobre esta política o sobre el tratamiento de tus datos,
              escribinos a{" "}
              <a className="text-indigo-600 underline" href={`mailto:${CONTACTO_EMAIL}`}>{CONTACTO_EMAIL}</a>.
            </p>
          </section>
        </article>

        <p className="text-center text-xs text-slate-400 mt-6">
          © {new Date().getFullYear()} {RESPONSABLE}. Todos los derechos reservados.
        </p>
      </main>
    </div>
  )
}
