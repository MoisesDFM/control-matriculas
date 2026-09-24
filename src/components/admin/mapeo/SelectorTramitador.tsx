'use client';

import { useState } from 'react';
import type { PuntoVentaAdmin, TramitadorFila } from '@/lib/domain/admin.repo';

/**
 * Reasignacion del tramitador de una sede. Solo confirma cuando hay cambio, y
 * ofrece arrastrar las carpetas abiertas como decision explicita.
 */
export default function SelectorTramitador({
  puntoVenta,
  tramitadores,
  onAsignar,
}: {
  puntoVenta: PuntoVentaAdmin;
  tramitadores: TramitadorFila[];
  onAsignar: (tramitadorId: number, reasignarAbiertas: boolean) => Promise<boolean>;
}) {
  const [valor, setValor] = useState<number>(puntoVenta.tramitador_id);
  const [reasignar, setReasignar] = useState(false);
  const cambio = valor !== puntoVenta.tramitador_id;

  return (
    <div className="space-y-1">
      <select className="campo w-full py-1 text-xs" value={valor} onChange={(e) => setValor(Number(e.target.value))}>
        {tramitadores.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre} · {t.transito}
          </option>
        ))}
      </select>

      {cambio && (
        <div className="space-y-1">
          {puntoVenta.abiertas > 0 && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600"
                checked={reasignar}
                onChange={(e) => setReasignar(e.target.checked)}
              />
              Pasar tambien las {puntoVenta.abiertas} carpeta(s) abiertas
            </label>
          )}
          <div className="flex gap-1">
            <button
              className="btn-primario px-2 py-1 text-[11px]"
              onClick={async () => {
                if (await onAsignar(valor, reasignar)) setReasignar(false);
              }}
            >
              Reasignar
            </button>
            <button
              className="btn-secundario px-2 py-1 text-[11px]"
              onClick={() => {
                setValor(puntoVenta.tramitador_id);
                setReasignar(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
