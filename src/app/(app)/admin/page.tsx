import { redirect } from 'next/navigation';
import { getSesion } from '@/lib/auth/session';
import { listarPuntosVenta } from '@/lib/domain/mapeo';
import { query } from '@/lib/db';
import PanelAdmin from '@/components/admin/PanelAdmin';
import { Alerta, Tarjeta } from '@/components/ui/primitivos';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administracion · NECHIMOTOS' };

/**
 * Zona exclusiva del control central. Triple puerta: el middleware de borde
 * bloquea /admin para quien no sea ADMIN, esta pagina vuelve a comprobarlo
 * contra la sesion del servidor y cada ruta de /api/admin exige rol ADMIN.
 */
export default async function AdminPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  if (sesion.rol !== 'ADMIN') redirect('/dashboard');

  const puntosVenta = await listarPuntosVenta();

  const auditoria = await query<{
    fecha: string;
    accion: string;
    usuario: string | null;
    entidad: string | null;
  }>(
    `SELECT to_char(a.created_at, 'YYYY/MM/DD HH24:MI') AS fecha,
            a.accion, u.nombre AS usuario, a.entidad
       FROM auditoria a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.accion LIKE 'USUARIO%'
         OR a.accion LIKE 'TRAMITADOR%'
         OR a.accion LIKE 'PDV%'
         OR a.accion LIKE 'TRANSITO%'
         OR a.accion IN ('LOGIN_FAIL', 'LOGIN_BLOQUEADO')
      ORDER BY a.created_at DESC
      LIMIT 20`,
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Administracion</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Cuentas de acceso, catalogo de tramitadores y mapeo por ciudad de correspondencia.
        </p>
      </header>

      <Alerta tono="aviso" titulo="Zona sensible">
        Todo cambio aqui altera quien ve que informacion. Las acciones quedan registradas en la auditoria con su nombre y
        la direccion IP de origen.
      </Alerta>

      <PanelAdmin
        puntosVenta={puntosVenta.map((p) => ({ id: p.id, ciudad_correspondencia: p.ciudad_correspondencia }))}
        usuarioActualId={sesion.usuarioId}
      />

      <Tarjeta titulo="Ultimos movimientos de administracion y accesos fallidos">
        {auditoria.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Sin movimientos registrados.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {auditoria.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 py-2">
                <span className="tnum text-xs text-slate-500">{a.fecha}</span>
                <span className="font-mono text-xs font-semibold">{a.accion}</span>
                <span className="text-xs text-slate-500">
                  {a.usuario ?? 'sistema'}
                  {a.entidad ? ` · ${a.entidad}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
