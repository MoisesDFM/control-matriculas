import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSesion } from '@/lib/auth/session';
import { listarPuntosVenta } from '@/lib/domain/mapeo';
import Tablero from '@/components/dashboard/Tablero';
import type { Estado } from '@/lib/domain/estados';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Registros · NECHIMOTOS' };

export default async function RegistrosPage({
  searchParams,
}: {
  searchParams: Promise<{ soloBloqueados?: string; estado?: string }>;
}) {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  const sp = await searchParams;
  const puntosVenta = await listarPuntosVenta();
  const visibles = sesion.rol === 'ADMIN' ? puntosVenta : puntosVenta.filter((p) => p.id === sesion.puntoVentaId);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Registros</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Columnas A a P del consolidado. Todas las fechas en formato YYYY/MM/DD.
          </p>
        </div>
        <Link href="/registros/nuevo" className="btn-primario text-sm">
          Registrar venta
        </Link>
      </header>

      <Tablero
        rol={sesion.rol}
        puntosVenta={visibles.map((p) => ({ id: p.id, ciudad_correspondencia: p.ciudad_correspondencia }))}
        filtroInicial={{
          soloBloqueados: sp.soloBloqueados === 'true',
          estado: (sp.estado as Estado | undefined) ?? undefined,
        }}
      />
    </div>
  );
}
