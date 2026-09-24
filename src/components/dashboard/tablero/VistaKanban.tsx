'use client';

import clsx from 'clsx';
import type { RegistroVista } from '@/lib/domain/registros.repo';
import { ETIQUETA_ESTADO, colorSemaforo, type Estado } from '@/lib/domain/estados';
import { FLUJO } from '@/lib/domain/estados';
import { Insignia } from '@/components/ui/primitivos';
import AccionesEstado from './AccionesEstado';

/** Vista Kanban: una columna por etapa del flujo. */
export default function VistaKanban({
  filas,
  rol,
  onAvanzar,
}: {
  filas: RegistroVista[];
  rol: 'ASESOR' | 'ADMIN';
  onAvanzar: (r: RegistroVista, e: Estado) => void;
}) {
  return (
    <div className="scroll-x pb-2">
      <div className="flex gap-3" style={{ minWidth: `${FLUJO.length * 264}px` }}>
        {FLUJO.map((estado) => {
          const grupo = filas.filter((f) => f.estado === estado);
          const bloq = grupo.filter((f) => f.bloqueado_runt).length;
          return (
            <div key={estado} className="w-64 shrink-0">
              <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
                <span className="text-xs font-bold uppercase tracking-wide">{ETIQUETA_ESTADO[estado]}</span>
                <span className="tnum text-xs font-bold text-slate-500">{grupo.length}</span>
              </div>
              {bloq > 0 && (
                <p className="mb-2 rounded-md bg-red-100 px-2 py-1 text-[11px] font-bold text-red-800 dark:bg-red-950 dark:text-red-200">
                  {bloq} sin RUNT
                </p>
              )}
              <div className="space-y-2">
                {grupo.map((r) => (
                  <article
                    key={r.id}
                    className={clsx(
                      'tarjeta border p-3',
                      r.bloqueado_runt ? 'border-red-400 bg-red-50 dark:bg-red-950/40' : '',
                    )}
                  >
                    <p className="truncate text-sm font-semibold">{r.col_b_nombre}</p>
                    <p className="tnum text-xs text-slate-500">{r.col_a_identificacion}</p>
                    <p className="mt-1 text-xs">
                      {r.col_g_marca} {r.col_h_linea}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <span className={clsx('insignia tnum', colorSemaforo(r.semaforo))}>
                        {r.dias_desde_apertura}d
                      </span>
                      {r.bloqueado_runt && <Insignia tono="rojo">RUNT No</Insignia>}
                      {r.col_j_placa && <Insignia tono="azul">{r.col_j_placa}</Insignia>}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {r.transito} · {r.tramitador}
                    </p>
                    <div className="mt-2">
                      <AccionesEstado registro={r} rol={rol} onAvanzar={onAvanzar} />
                    </div>
                  </article>
                ))}
                {grupo.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-xs text-slate-400 dark:border-slate-700">
                    Sin carpetas
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
