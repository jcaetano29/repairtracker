"use client";

import { useState, useEffect, useCallback } from "react";
import { getPendientesCadete, registrarMovimientoCadete } from "@/lib/data";

export default function CadetePage() {
  const [pendientes, setPendientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const data = await getPendientesCadete();
      setPendientes(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function handleConfirmar(orden, tipo) {
    setProcessing(orden.id);
    try {
      await registrarMovimientoCadete({
        orden_id: orden.id,
        tipo,
        taller_id: null,
        cadete: "Cadete",
      });
      await loadData();
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setProcessing(null);
    }
  }

  // Agrupar por acción
  const llevarATaller = pendientes.filter((p) => p.accion_pendiente === "LLEVAR_A_TALLER");
  const retirarDeTaller = pendientes.filter((p) => p.accion_pendiente === "RETIRAR_DE_TALLER");
  const entregarEnLocal = pendientes.filter((p) => p.accion_pendiente === "ENTREGAR_EN_LOCAL");

  const hoy = new Date().toLocaleDateString("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">🚴 Vista Cadete</h1>
            <p className="text-xs text-slate-400 capitalize">{hoy}</p>
          </div>
          <a href="/" className="text-xs text-slate-400 hover:text-white px-3 py-2">
            ← Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {loading && <div className="text-center py-20 text-slate-400">Cargando...</div>}

        {!loading && pendientes.length === 0 && (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">✅</div>
            <div className="text-slate-500 font-medium">No hay movimientos pendientes</div>
            <div className="text-xs text-slate-400 mt-1">Todo está al día</div>
          </div>
        )}

        {/* Llevar a taller */}
        {llevarATaller.length > 0 && (
          <Section
            title="🔴 Retirar del local → Taller"
            color="red"
            items={llevarATaller}
            processing={processing}
            actionLabel="Retirado del local"
            onConfirm={(o) => handleConfirmar(o, "RETIRO_LOCAL")}
          />
        )}

        {/* Retirar de taller */}
        {retirarDeTaller.length > 0 && (
          <Section
            title="🟢 Retirar del taller → Local"
            color="green"
            items={retirarDeTaller}
            processing={processing}
            actionLabel="Retirado del taller"
            onConfirm={(o) => handleConfirmar(o, "RETIRO_TALLER")}
          />
        )}

        {/* Entregar en local */}
        {entregarEnLocal.length > 0 && (
          <Section
            title="🟡 Entregar en el local"
            color="amber"
            items={entregarEnLocal}
            processing={processing}
            actionLabel="Entregado en local"
            onConfirm={(o) => handleConfirmar(o, "ENTREGA_LOCAL")}
          />
        )}
      </main>
    </div>
  );
}

function Section({ title, color, items, processing, actionLabel, onConfirm }) {
  const colorMap = {
    red: "bg-red-50 border-red-200",
    green: "bg-green-50 border-green-200",
    amber: "bg-amber-50 border-amber-200",
  };
  const btnMap = {
    red: "bg-red-500 hover:bg-red-600",
    green: "bg-green-500 hover:bg-green-600",
    amber: "bg-amber-500 hover:bg-amber-600",
  };

  return (
    <div>
      <h2 className="text-sm font-bold text-slate-900 mb-2">{title}</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`p-4 rounded-xl border ${colorMap[color]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="text-xs font-bold font-mono text-slate-900">
                  #{String(item.numero_orden).padStart(4, "0")}
                </div>
                <div className="text-sm font-semibold text-slate-800 mt-0.5">
                  {item.tipo_articulo} — {item.marca || "S/M"}
                </div>
                <div className="text-xs text-slate-500">{item.cliente_nombre}</div>
                {item.taller_nombre && (
                  <div className="text-xs text-purple-600 mt-1">
                    📍 {item.taller_nombre}
                    {item.taller_direccion && ` — ${item.taller_direccion}`}
                  </div>
                )}
              </div>
              <button
                onClick={() => onConfirm(item)}
                disabled={processing === item.id}
                className={`px-4 py-2.5 ${btnMap[color]} text-white rounded-lg text-xs font-bold whitespace-nowrap disabled:opacity-50`}
              >
                {processing === item.id ? "..." : `✓ ${actionLabel}`}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
