import type { Metadata } from 'next';
import FormularioLogin from '@/components/forms/FormularioLogin';

export const metadata: Metadata = { title: 'Ingresar · NECHIMOTOS' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const { volver } = await searchParams;
  // Solo se aceptan rutas internas: evita open redirect via ?volver=//evil.com
  const destino = volver && /^\/[a-zA-Z0-9/_-]*$/.test(volver) ? volver : '/dashboard';

  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-br from-slate-100 via-white to-brand-50 px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-2xl font-black text-white shadow-lg">
            N
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">NECHIMOTOS</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Gestion de matriculas, SOAT y RUNT
          </p>
        </div>

        <FormularioLogin destino={destino} />

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Acceso restringido a personal autorizado. Esta plataforma contiene datos personales
          protegidos por la Ley 1581 de 2012; todo ingreso queda auditado.
        </p>
      </div>
    </main>
  );
}
