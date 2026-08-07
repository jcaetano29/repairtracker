"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { DetalleClienteModal } from "./DetalleClienteModal";

function formatHora(iso) {
  return new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
}

export function WhatsAppHilo({ conversacionId, cliente }) {
  const [mensajes, setMensajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [mostrarDetalle, setMostrarDetalle] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuAbierto) return;

    function handleMouseDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAbierto(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setMenuAbierto(false);
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuAbierto]);

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
    <div className="flex-1 flex flex-col whatsapp-wallpaper min-h-0">
      <div className="px-4 py-3 bg-slate-800 text-white font-semibold text-sm shrink-0 flex items-center justify-between">
        <span>{cliente?.nombre ?? cliente?.telefono}</span>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuAbierto}
            aria-label="Más opciones"
            className="px-2 py-1 text-slate-300 hover:text-white rounded"
          >
            ⋮
          </button>
          {menuAbierto && (
            <div
              role="menu"
              className="absolute right-0 mt-1 w-56 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-10"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuAbierto(false);
                  setMostrarDetalle(true);
                }}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Ver detalles del usuario
              </button>
            </div>
          )}
        </div>
      </div>
      {mostrarDetalle && (
        <DetalleClienteModal cliente={cliente} onClose={() => setMostrarDetalle(false)} />
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2">
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
