"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { WhatsAppHilo } from "@/components/WhatsAppHilo";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";

function formatFecha(iso) {
  const fecha = new Date(iso);
  const hoy = new Date();
  const esHoy = fecha.toDateString() === hoy.toDateString();
  return esHoy
    ? fecha.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })
    : fecha.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" });
}

function postMarcarLeido(conversacionId) {
  fetch(`/api/whatsapp/conversaciones/${conversacionId}/marcar-leido`, { method: "POST" }).catch(() => {});
}

export default function WhatsAppPage() {
  const [conversaciones, setConversaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState(null);

  const seleccionadaRef = useRef(null);
  useEffect(() => {
    seleccionadaRef.current = seleccionada;
  }, [seleccionada]);

  const cargarConversaciones = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/conversaciones");
      const data = res.ok ? await res.json() : { conversaciones: [] };
      const nuevas = data.conversaciones ?? [];
      fetch("/api/whatsapp/estado/marcar-leido", { method: "POST" }).catch(() => {});

      const abierta = nuevas.find((c) => c.id === seleccionadaRef.current);
      if (abierta?.unread) {
        postMarcarLeido(abierta.id);
        setConversaciones(nuevas.map((c) => (c.id === abierta.id ? { ...c, unread: false } : c)));
      } else {
        setConversaciones(nuevas);
      }
    } catch (e) {
      console.error("Error cargando conversaciones:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarConversaciones();
  }, [cargarConversaciones]);

  // Polling — mismo patrón que app/page.js (30s) / TrasladosPanel.js (5s).
  // Este proyecto no usa Supabase Realtime en ningún lado.
  useEffect(() => {
    const interval = setInterval(cargarConversaciones, 15000);
    return () => clearInterval(interval);
  }, [cargarConversaciones]);

  async function handleLogout() {
    await signOut({ callbackUrl: "/login" });
  }

  const conversacionesFiltradas = conversaciones.filter((c) =>
    (c.clientes?.nombre ?? c.telefono_e164 ?? "").toLowerCase().includes(busqueda.toLowerCase())
  );

  const conversacionActual = conversaciones.find((c) => c.id === seleccionada);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col">
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 sm:px-6 py-4 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3 cursor-pointer">
            <span className="text-2xl">⌚</span>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">RepairTrack</h1>
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <WhatsAppIcon className="w-3 h-3" /> WhatsApp
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-3 mr-14">
            <Link href="/" className="text-xs text-slate-400 hover:text-white transition-colors px-3 py-2">
              ← Volver al dashboard
            </Link>
            <button onClick={handleLogout} className="px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors">
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row bg-white dark:bg-slate-900 md:my-6 md:rounded-xl md:shadow overflow-hidden md:h-[75vh] min-h-0">
        <div className={`w-full md:w-80 border-r border-slate-200 dark:border-slate-700 flex-col ${seleccionada ? "hidden md:flex" : "flex"}`}>
          <div className="p-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <input
              type="text"
              placeholder="🔍 Buscar cliente..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/30"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && <p className="text-center text-xs text-slate-400 py-6">Cargando...</p>}
            {!loading && conversacionesFiltradas.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-6">Todavía no hay conversaciones</p>
            )}
            {conversacionesFiltradas.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSeleccionada(c.id);
                  if (c.unread) {
                    postMarcarLeido(c.id);
                    setConversaciones((prev) =>
                      prev.map((conv) => (conv.id === c.id ? { ...conv, unread: false } : conv))
                    );
                  }
                }}
                className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                  seleccionada === c.id ? "bg-slate-100 dark:bg-slate-950" : ""
                }`}
              >
                <div className="flex justify-between items-baseline gap-2">
                  <span
                    className={`text-sm truncate flex items-center gap-1.5 ${
                      c.unread
                        ? "font-bold text-slate-900 dark:text-white"
                        : "font-medium text-slate-800 dark:text-slate-100"
                    }`}
                  >
                    {c.unread && (
                      <span className="w-2 h-2 rounded-full bg-[#25D366] shrink-0" aria-label="Mensaje nuevo" />
                    )}
                    {c.clientes?.nombre ? `${c.clientes.nombre} (${c.telefono_e164})` : c.telefono_e164}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0">{formatFecha(c.last_message_at)}</span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{c.last_message_preview}</p>
              </button>
            ))}
          </div>
        </div>

        <div className={`flex-1 flex-col min-h-0 ${seleccionada ? "flex" : "hidden md:flex"}`}>
          {seleccionada && (
            <button
              onClick={() => setSeleccionada(null)}
              className="md:hidden px-4 py-2 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-700 text-left shrink-0"
            >
              ← Volver a conversaciones
            </button>
          )}
          <WhatsAppHilo
            conversacionId={seleccionada}
            cliente={{
              nombre: conversacionActual?.clientes?.nombre,
              telefono: conversacionActual?.telefono_e164,
              email: conversacionActual?.clientes?.email,
            }}
          />
        </div>
      </main>
    </div>
  );
}
