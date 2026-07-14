import { useEffect, useState } from 'react'
import type { DbStatus } from '../../preload'

function App(): JSX.Element {
  const [status, setStatus] = useState<DbStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .getDbStatus()
      .then(setStatus)
      .catch((err: unknown) => setError(String(err)))
  }, [])

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-100">
      <div className="rounded-lg bg-white px-8 py-6 text-center shadow-md">
        <h1 className="mb-4 text-xl font-semibold text-slate-800">Nucleo Mejora</h1>

        {error && <p className="text-red-600">Error: {error}</p>}

        {!error && !status && <p className="text-slate-500">Conectando a la base...</p>}

        {status?.connected && (
          <p className="text-emerald-600">
            Conectado a la base, {status.tableCount} tablas creadas
          </p>
        )}

        {status && !status.connected && (
          <p className="text-red-600">No se pudo conectar a la base</p>
        )}
      </div>
    </div>
  )
}

export default App
