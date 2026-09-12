'use client';

import { useState } from 'react';
import clsx from 'clsx';
import PanelUsuarios from './PanelUsuarios';
import PanelMapeo from './PanelMapeo';

type Pestana = 'usuarios' | 'mapeo';

export default function PanelAdmin({
  puntosVenta,
  usuarioActualId,
}: {
  puntosVenta: { id: number; ciudad_correspondencia: string }[];
  usuarioActualId: string;
}) {
  const [pestana, setPestana] = useState<Pestana>('usuarios');

  const pestanas: [Pestana, string][] = [
    ['usuarios', 'Usuarios y accesos'],
    ['mapeo', 'Tramitadores y mapeo'],
  ];

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Secciones de administracion"
        className="flex w-full rounded-lg border border-slate-300 p-0.5 sm:w-auto dark:border-slate-700"
      >
        {pestanas.map(([clave, texto]) => (
          <button
            key={clave}
            role="tab"
            aria-selected={pestana === clave}
            onClick={() => setPestana(clave)}
            className={clsx(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold sm:flex-none',
              pestana === clave ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300',
            )}
          >
            {texto}
          </button>
        ))}
      </div>

      {pestana === 'usuarios' ? (
        <PanelUsuarios puntosVenta={puntosVenta} usuarioActualId={usuarioActualId} />
      ) : (
        <PanelMapeo />
      )}
    </div>
  );
}
