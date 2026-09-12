import { redirect } from 'next/navigation';
import { getSesion } from '@/lib/auth/session';
import { listarPuntosVenta } from '@/lib/domain/mapeo';
import { query } from '@/lib/db';
import FormularioRegistro from '@/components/forms/FormularioRegistro';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Registrar venta · NECHIMOTOS' };

export default async function NuevoRegistroPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  const [puntosVenta, codigos] = await Promise.all([
    listarPuntosVenta(),
    query<{ codigo: string; descripcion: string | null }>(
      `SELECT codigo, descripcion FROM codigos WHERE activo ORDER BY codigo`,
    ),
  ]);

  // El asesor solo recibe su propio punto de venta: el selector no puede
  // ofrecerle otra sede ni siquiera como opcion visible.
  const visibles =
    sesion.rol === 'ADMIN' ? puntosVenta : puntosVenta.filter((p) => p.id === sesion.puntoVentaId);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Registrar venta</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          El transito y el tramitador se asignan automaticamente segun la ciudad de correspondencia.
        </p>
      </header>

      <FormularioRegistro rol={sesion.rol} puntosVenta={visibles} codigos={codigos} />
    </div>
  );
}
