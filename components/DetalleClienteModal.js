// components/DetalleClienteModal.js
"use client";

function Fila({ etiqueta, valor }) {
  return (
    <div>
      <div className="text-xs text-slate-400 font-semibold tracking-wider">{etiqueta}</div>
      <div className="text-sm text-slate-800 dark:text-slate-100 mt-0.5">{valor}</div>
    </div>
  );
}

export function DetalleClienteModal({ cliente, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Detalles del usuario</h2>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            ×
          </button>
        </div>
        <div className="p-6 space-y-4">
          <Fila etiqueta="NOMBRE" valor={cliente?.nombre || "No especificado"} />
          <Fila etiqueta="TELÉFONO" valor={cliente?.telefono || "No especificado"} />
          <Fila etiqueta="EMAIL" valor={cliente?.email || "No especificado"} />
        </div>
      </div>
    </div>
  );
}
