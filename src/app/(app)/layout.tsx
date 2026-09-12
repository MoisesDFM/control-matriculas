import { redirect } from 'next/navigation';
import { getSesion } from '@/lib/auth/session';
import { queryOne } from '@/lib/db';
import { alcance } from '@/lib/api/rbac';
import Navegacion, { type Perfil } from '@/components/layout/Navegacion';

export const dynamic = 'force-dynamic';

/**
 * Envoltorio de la zona autenticada. La sesion se resuelve en el servidor: el
 * navegador nunca decide si esta autorizado, solo pinta lo que ya fue aprobado.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  const pdv = sesion.puntoVentaId
    ? await queryOne<{ ciudad_correspondencia: string; transito: string; tramitador: string }>(
        `SELECT pdv.ciudad_correspondencia, t.nombre AS transito, tr.nombre AS tramitador
           FROM puntos_venta pdv
           JOIN transitos t     ON t.id  = pdv.transito_id
           JOIN tramitadores tr ON tr.id = pdv.tramitador_id
          WHERE pdv.id = $1`,
        [sesion.puntoVentaId],
      )
    : null;

  const al = alcance(sesion, 's');
  const pend = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM solicitudes_runt s WHERE ${al.where} AND s.estado = 'PENDIENTE'`,
    al.params,
  );

  const perfil: Perfil = {
    nombre: sesion.nombre,
    rol: sesion.rol,
    puntoVenta: pdv?.ciudad_correspondencia ?? null,
    transito: pdv?.transito ?? null,
    tramitador: pdv?.tramitador ?? null,
  };

  return (
    <div className="min-h-dvh">
      <Navegacion perfil={perfil} pendientesRunt={Number(pend?.n ?? 0)} />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-4 text-xs text-slate-400 no-print">
        Fechas en formato YYYY/MM/DD · Datos personales de uso interno · Sesion auditada
      </footer>
    </div>
  );
}
