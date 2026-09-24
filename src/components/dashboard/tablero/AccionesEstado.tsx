'use client';

import clsx from 'clsx';
import type { RegistroVista } from '@/lib/domain/registros.repo';
import { ETIQUETA_ESTADO, FLUJO, puedeTransicionar, type Estado } from '@/lib/domain/estados';

/**
 * Boton de avance al siguiente estado. Usa el MISMO predicado que la API
 * (puedeTransicionar), de modo que la interfaz nunca ofrece una transicion que
 * el backend vaya a rechazar, y explica el motivo cuando esta bloqueada.
 */
export default function AccionesEstado({
  registro,
  rol,
  onAvanzar,
}: {
  registro: RegistroVista;
  rol: 'ASESOR' | 'ADMIN';
  onAvanzar: (r: RegistroVista, e: Estado) => void;
}) {
  const indice = FLUJO.indexOf(registro.estado);
  const siguiente = indice >= 0 && indice < FLUJO.length - 1 ? FLUJO[indice + 1] : null;
  if (!siguiente) return <span className="text-xs text-slate-400">—</span>;

  const veredicto = puedeTransicionar({
    actual: registro.estado,
    destino: siguiente,
    runt: registro.runt,
    rol,
    placa: registro.col_j_placa,
    placaPreasignada: registro.placa_preasignada,
    fechaMatricula: registro.col_l_fecha_matricula,
  });

  return (
    <button
      onClick={() => onAvanzar(registro, siguiente)}
      disabled={!veredicto.permitido}
      title={veredicto.motivo}
      className={clsx(
        'btn w-full whitespace-nowrap px-2 py-1 text-[11px]',
        veredicto.permitido
          ? 'bg-brand-600 text-white hover:bg-brand-700'
          : veredicto.codigo === 'RUNT_BLOQUEADO'
            ? 'cursor-not-allowed border border-red-400 bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
            : 'cursor-not-allowed border border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800',
      )}
    >
      {veredicto.codigo === 'RUNT_BLOQUEADO' ? 'Bloqueado: sin RUNT' : `→ ${ETIQUETA_ESTADO[siguiente]}`}
    </button>
  );
}
