'use client';

import clsx from 'clsx';
import type { RegistroVista } from '@/lib/domain/registros.repo';
import { ETIQUETA_ESTADO, colorSemaforo, type Estado } from '@/lib/domain/estados';
import { Insignia } from '@/components/ui/primitivos';
import AccionesEstado from './AccionesEstado';

/** Vista de tabla con las columnas A..P y los semaforos de SLA. */
export default function VistaTabla({
  filas,
  rol,
  onAvanzar,
}: {
  filas: RegistroVista[];
  rol: 'ASESOR' | 'ADMIN';
  onAvanzar: (r: RegistroVista, e: Estado) => void;
}) {
  return (
    <div className="tarjeta scroll-x">
      <table className="w-full min-w-[1180px] text-left text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Identificacion</th>
            <th className="px-3 py-2">Nombre y apellidos</th>
            <th className="px-3 py-2">Apertura</th>
            <th className="px-3 py-2">Ciudad corresp.</th>
            <th className="px-3 py-2">Vehiculo</th>
            <th className="px-3 py-2">Placa</th>
            <th className="px-3 py-2">SOAT</th>
            <th className="px-3 py-2">Matricula</th>
            <th className="px-3 py-2">RUNT</th>
            <th className="px-3 py-2">Transito / Tramitador</th>
            <th className="px-3 py-2">SLA</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Accion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {filas.map((r) => (
            <tr
              key={r.id}
              className={clsx(
                'align-top',
                r.bloqueado_runt
                  ? 'bg-red-50 dark:bg-red-950/30'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
              )}
            >
              <td className="tnum px-3 py-2 font-medium">{r.col_a_identificacion}</td>
              <td className="max-w-[220px] px-3 py-2">{r.col_b_nombre}</td>
              <td className="tnum px-3 py-2 whitespace-nowrap">{r.col_c_fecha_apertura}</td>
              <td className="px-3 py-2 text-xs">{r.col_e_ciudad_correspondencia}</td>
              <td className="px-3 py-2 text-xs">
                {r.col_g_marca} {r.col_h_linea}
                <span className="tnum block text-slate-500">Mod. {r.col_i_modelo}</span>
              </td>
              <td className="px-3 py-2">
                {r.col_j_placa ? (
                  <span className="tnum font-mono font-semibold">
                    {r.col_j_placa}
                    {r.placa_preasignada && (
                      <span className="ml-1 text-[10px] font-bold text-amber-600">PRE</span>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="tnum px-3 py-2 whitespace-nowrap text-xs">{r.col_k_soat ?? '—'}</td>
              <td className="tnum px-3 py-2 whitespace-nowrap text-xs">{r.col_l_fecha_matricula ?? '—'}</td>
              <td className="px-3 py-2">
                {r.runt === 'SI' ? (
                  <Insignia tono="verde">Si</Insignia>
                ) : (
                  <Insignia tono="rojo">No</Insignia>
                )}
              </td>
              <td className="px-3 py-2 text-xs">
                {r.transito}
                <span className="block text-slate-500">{r.tramitador}</span>
              </td>
              <td className="px-3 py-2">
                <span className={clsx('insignia tnum', colorSemaforo(r.semaforo))}>
                  {r.dias_desde_apertura}d
                  {r.dias_en_transito !== null && ` · ${r.dias_en_transito}d tr.`}
                </span>
              </td>
              <td className="px-3 py-2 text-xs font-semibold">{ETIQUETA_ESTADO[r.estado]}</td>
              <td className="px-3 py-2">
                <AccionesEstado registro={r} rol={rol} onAvanzar={onAvanzar} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
