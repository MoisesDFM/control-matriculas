import { ruta, ok } from '@/lib/api/handler';
import { cerrarSesion } from '@/lib/auth/session';

export const runtime = 'nodejs';

export const POST = ruta({}, async ({ auditar }) => {
  await auditar('LOGOUT');
  await cerrarSesion();
  return ok({ cerrada: true });
});
