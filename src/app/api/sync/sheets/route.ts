import { z } from 'zod';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { ruta, ok, auditar } from '@/lib/api/handler';
import { LIMITES, limpiarRateLimit } from '@/lib/security/rate-limit';
import { sincronizarDesdeSheets, sincronizarHaciaSheets } from '@/lib/integrations/sync';
import { prepararHoja } from '@/lib/integrations/google-sheets';
import { env, sheetsConfigurado } from '@/lib/env';
import { fallo } from '@/lib/api/respuestas';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const cuerpo = z.object({
  direccion: z.enum(['DB_TO_SHEETS', 'SHEETS_TO_DB', 'AMBAS']).default('AMBAS'),
  completo: z.coerce.boolean().default(false),
  prepararFormato: z.coerce.boolean().default(false),
});

/** POST /api/sync/sheets · SOLO ADMINISTRADOR (sincronizacion manual). */
export const POST = ruta({ rol: 'ADMIN', schema: cuerpo, limite: LIMITES.sync }, async ({ sesion, body, auditar }) => {
  if (!sheetsConfigurado) {
    return fallo('ERROR_INTERNO', 'Google Sheets no esta configurado en el servidor.');
  }

  if (body.prepararFormato) await prepararHoja();

  const salida: Record<string, unknown> = {};
  if (body.direccion === 'SHEETS_TO_DB' || body.direccion === 'AMBAS') {
    salida.desdeSheets = await sincronizarDesdeSheets(sesion.usuarioId);
  }
  if (body.direccion === 'DB_TO_SHEETS' || body.direccion === 'AMBAS') {
    salida.haciaSheets = await sincronizarHaciaSheets({ completo: body.completo, usuarioId: sesion.usuarioId });
  }

  await auditar('SYNC_MANUAL', { metadata: { direccion: body.direccion, completo: body.completo } });
  return ok(salida);
});

/**
 * GET /api/sync/sheets · invocado por el cron de Vercel (vercel.json).
 * Se autentica con CRON_SECRET en la cabecera Authorization, no por sesion.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const cabecera = req.headers.get('authorization') ?? '';
  const esperado = `Bearer ${env.CRON_SECRET ?? ''}`;

  if (!env.CRON_SECRET || !comparar(cabecera, esperado)) {
    return NextResponse.json(
      { ok: false, error: { codigo: 'SIN_PERMISO', mensaje: 'No autorizado.' } },
      { status: 403, headers: { 'cache-control': 'no-store' } },
    );
  }

  if (!sheetsConfigurado) {
    return NextResponse.json({ ok: false, error: { codigo: 'ERROR_INTERNO', mensaje: 'Sheets sin configurar.' } }, { status: 500 });
  }

  const desdeSheets = await sincronizarDesdeSheets(null);
  const haciaSheets = await sincronizarHaciaSheets({ usuarioId: null });
  await limpiarRateLimit();
  await query(`DELETE FROM sesiones WHERE expira_en < now() - interval '30 days'`);
  await auditar({ usuarioId: null, accion: 'SYNC_CRON', metadata: { desdeSheets, haciaSheets } });

  return NextResponse.json(
    { ok: true, data: { desdeSheets, haciaSheets } },
    { headers: { 'cache-control': 'no-store' } },
  );
}

function comparar(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
