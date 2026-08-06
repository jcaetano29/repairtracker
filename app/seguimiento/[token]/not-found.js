export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-sm text-center">
        <span className="text-5xl block mb-4">🔍</span>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Orden no encontrada</h1>
        <p className="text-base text-slate-500">
          El enlace que utilizó no es válido o la orden ya no está disponible.
          Verifique el link en su correo o contacte al local.
        </p>
      </div>
    </div>
  )
}
