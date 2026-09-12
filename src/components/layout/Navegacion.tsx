'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';
import { api } from '@/lib/client/api';

export interface Perfil {
  nombre: string;
  rol: 'ASESOR' | 'ADMIN';
  puntoVenta: string | null;
  transito: string | null;
  tramitador: string | null;
}

const ENLACES = [
  { href: '/dashboard', texto: 'Tablero', soloAdmin: false },
  { href: '/registros', texto: 'Registros', soloAdmin: false },
  { href: '/registros/nuevo', texto: 'Registrar venta', soloAdmin: false },
  { href: '/runt', texto: 'Inscripciones RUNT', soloAdmin: false },
  { href: '/reportes', texto: 'Reportes y KPIs', soloAdmin: false },
];

export default function Navegacion({ perfil, pendientesRunt }: { perfil: Perfil; pendientesRunt: number }) {
  const ruta = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  async function salir() {
    await api.post('/api/auth/logout', {}).catch(() => undefined);
    router.replace('/login');
  }

  const enlaces = ENLACES.filter((e) => !e.soloAdmin || perfil.rol === 'ADMIN');

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 no-print">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-black text-white">N</span>
          <span className="hidden text-sm font-black tracking-tight sm:inline">NECHIMOTOS</span>
        </Link>

        {/* Navegacion de escritorio */}
        <nav className="ml-4 hidden flex-1 items-center gap-1 lg:flex">
          {enlaces.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className={clsx(
                'relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                ruta === e.href
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-100'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {e.texto}
              {e.href === '/runt' && pendientesRunt > 0 && (
                <span className="ml-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {pendientesRunt}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold leading-tight">{perfil.nombre}</p>
            <p className="text-xs leading-tight text-slate-500 dark:text-slate-400">
              {perfil.rol === 'ADMIN' ? 'Control central · acceso global' : `PDV ${perfil.puntoVenta}`}
            </p>
          </div>
          <button onClick={salir} className="btn-secundario px-3 py-1.5 text-xs">
            Salir
          </button>
          <button
            onClick={() => setAbierto((v) => !v)}
            className="btn-secundario px-3 py-1.5 lg:hidden"
            aria-expanded={abierto}
            aria-label="Menu"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Navegacion movil */}
      {abierto && (
        <nav className="grid gap-1 border-t border-slate-200 px-4 pb-3 pt-2 lg:hidden dark:border-slate-800">
          {enlaces.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              onClick={() => setAbierto(false)}
              className={clsx(
                'rounded-lg px-3 py-2 text-sm font-medium',
                ruta === e.href
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-100'
                  : 'text-slate-600 dark:text-slate-300',
              )}
            >
              {e.texto}
              {e.href === '/runt' && pendientesRunt > 0 && (
                <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  {pendientesRunt} por validar
                </span>
              )}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
