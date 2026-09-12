import { redirect } from 'next/navigation';
import { getSesion } from '@/lib/auth/session';
import { listarPuntosVenta } from '@/lib/domain/mapeo';
import { kpiResumen, kpiRuntPorPdv } from '@/lib/reports/kpis';
import TarjetasKpi from '@/components/dashboard/TarjetasKpi';
import AlertaRunt from '@/components/dashboard/AlertaRunt';
import Tablero from '@/components/dashboard/Tablero';
import { Tarjeta } from '@/components/ui/primitivos';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tablero · NECHIMOTOS' };

export default async function DashboardPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  const [resumen, runtPdv, puntosVenta] = await Promise.all([
    kpiResumen(sesion, { desde: null, hasta: null }),
    kpiRuntPorPdv(sesion),
    listarPuntosVenta(),
  ]);

  const pdv = sesion.puntoVentaId
    ? await queryOne<{ ciudad_correspondencia: string }>(
        `SELECT ciudad_correspondencia FROM puntos_venta WHERE id = $1`,
        [sesion.puntoVentaId],
      )
    : null;

  const visibles = sesion.rol === 'ADMIN' ? puntosVenta : puntosVenta.filter((p) => p.id === sesion.puntoVentaId);
  const peores = [...runtPdv].sort((a, b) => b.noInscritos - a.noInscritos).slice(0, 4);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Tablero operativo</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {sesion.rol === 'ADMIN'
            ? 'Vista global de todos los puntos de venta y transitos.'
            : `Punto de venta ${pdv?.ciudad_correspondencia ?? ''} · solo se muestran los datos de su sede.`}
        </p>
      </header>

      <AlertaRunt bloqueadas={resumen.bloqueadosRunt} puntoVenta={pdv?.ciudad_correspondencia ?? null} />

      <TarjetasKpi resumen={resumen} periodo="Historico" />

      {sesion.rol === 'ADMIN' && peores.length > 0 && (
        <Tarjeta titulo="Puntos de venta con mas clientes sin RUNT">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {peores.map((p) => (
              <li
                key={p.puntoVentaId}
                className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
              >
                <p className="font-semibold">{p.ciudadCorrespondencia}</p>
                <p className="tnum mt-0.5 text-lg font-black text-red-700 dark:text-red-300">
                  {p.noInscritos}
                  <span className="ml-1 text-xs font-semibold text-slate-500">de {p.total}</span>
                </p>
                <p className="text-xs text-slate-500">{p.pctNoInscritos}% sin inscribir · {p.transito}</p>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <Tablero
        rol={sesion.rol}
        puntosVenta={visibles.map((p) => ({ id: p.id, ciudad_correspondencia: p.ciudad_correspondencia }))}
      />
    </div>
  );
}
