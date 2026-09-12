import { redirect } from 'next/navigation';
import { getSesion } from '@/lib/auth/session';
import { listarPuntosVenta } from '@/lib/domain/mapeo';
import PanelRunt from '@/components/forms/PanelRunt';
import { Alerta } from '@/components/ui/primitivos';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inscripciones RUNT · NECHIMOTOS' };

export default async function RuntPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  const puntosVenta = await listarPuntosVenta();
  const visibles =
    sesion.rol === 'ADMIN' ? puntosVenta : puntosVenta.filter((p) => p.id === sesion.puntoVentaId);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Inscripciones al RUNT</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {sesion.rol === 'ADMIN'
            ? 'Valide las solicitudes radicadas por los puntos de venta. Aprobar es la unica via para poner RUNT = Si.'
            : 'Radique la inscripcion del cliente y consulte el estado de sus solicitudes.'}
        </p>
      </header>

      <Alerta tono="aviso" titulo="Regla obligatoria">
        Ninguna carpeta se tramita sin RUNT verificado. Mientras la inscripcion no este validada, el registro no puede
        pasar a <strong>En transito</strong> ni a estados posteriores, en ningun punto de venta ni transito.
      </Alerta>

      <PanelRunt rol={sesion.rol} puntosVenta={visibles} />
    </div>
  );
}
