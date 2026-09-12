import { redirect } from 'next/navigation';
import { getSesion } from '@/lib/auth/session';
import PanelReportes from '@/components/reportes/PanelReportes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reportes y KPIs · NECHIMOTOS' };

export default async function ReportesPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Reportes e indicadores</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Revisiones de cada 8 dias y mensuales, con descarga nativa en .xlsx.
        </p>
      </header>

      <PanelReportes rol={sesion.rol} />
    </div>
  );
}
