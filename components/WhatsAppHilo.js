"use client";

import { useEffect, useState, useCallback } from "react";

function formatHora(iso) {
  return new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
}

export function WhatsAppHilo({ conversacionId, clienteNombre }) {
  const [mensajes, setMensajes] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargarMensajes = useCallback(async () => {
    if (!conversacionId) return;
    try {
      const res = await fetch(`/api/whatsapp/conversaciones/${conversacionId}/mensajes`);
      const data = res.ok ? await res.json() : { mensajes: [] };
      setMensajes(data.mensajes ?? []);
    } catch (e) {
      console.error("Error cargando mensajes:", e);
    } finally {
      setLoading(false);
    }
  }, [conversacionId]);

  useEffect(() => {
    setLoading(true);
    cargarMensajes();
  }, [cargarMensajes]);

  // Polling — mismo patrón que components/TrasladosPanel.js (este proyecto
  // no usa Supabase Realtime en ningún lado).
  useEffect(() => {
    if (!conversacionId) return;
    const interval = setInterval(cargarMensajes, 5000);
    return () => clearInterval(interval);
  }, [conversacionId, cargarMensajes]);

  if (!conversacionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Seleccioná una conversación
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#e5ddd5] min-h-0">
      <div className="px-4 py-3 bg-slate-800 text-white font-semibold text-sm shrink-0">
        {clienteNombre}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {loading && <p className="text-center text-xs text-slate-500">Cargando...</p>}
        {!loading && mensajes.length === 0 && (
          <p className="text-center text-xs text-slate-500">Todavía no hay mensajes</p>
        )}
        {mensajes.map((m) => (
          <div
            key={m.id}
            className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${
              m.direccion === "saliente"
                ? "self-end bg-[#dcf8c6] text-slate-800"
                : "self-start bg-white text-slate-800"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">
              {m.tipo === "text" ? m.body : "📎 Mensaje multimedia"}
            </p>
            <p className="text-[10px] text-slate-400 mt-1 text-right">{formatHora(m.created_at)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
