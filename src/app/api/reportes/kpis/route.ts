import { z } from 'zod';
import { ruta, ok } from '@/lib/api/handler';
import { kpiResumen, kpiRuntPorPdv, kpiSerieSemanal, kpiSla } from '@/lib/reports/kpis';
import { normalizarFecha } from '@/lib/domain/fechas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rango = z.object({
  desde: z.string().optional().transform((v) => (v ? normalizarFecha(v) : null)),
  hasta: z.string().optional().transform((v) => (v ? normalizarFecha(v) : null)),
  /** 8 = revision de cada 8 dias, 30 = revision mensual. */
  ventana: z.enum(['8', '30', 'todo']).default('30'),
});

/**
 * GET /api/reportes/kpis
 * Tres bloques: resumen global, RUNT no inscrito por PDV y SLA por tramitador.
 * Todo filtrado por el alcance de la sesion.
 */
export const GET = ruta({ schema: rango }, async ({ sesion, body }) => {
  const desde = body.desde ?? (body.ventana === 'todo' ? null : haceDias(Number(body.ventana)));
  const periodo = { desde, hasta: body.hasta ?? null };

  const [resumen, runtPorPdv, sla, serie] = await Promise.all([
    kpiResumen(sesion, periodo),
    kpiRuntPorPdv(sesion),
    kpiSla(sesion),
    kpiSerieSemanal(sesion, 12),
  ]);

  return ok({
    periodo: {
      desde: periodo.desde,
      hasta: periodo.hasta,
      etiqueta: body.ventana === 'todo' ? 'Historico completo' : `Ultimos ${body.ventana} dias`,
    },
    resumen,
    runtPorPdv,
    sla,
    serie: serie.map((s) => ({ semana: s.semana, ventas: Number(s.ventas), matriculas: Number(s.matriculas) })),
  });
});

function haceDias(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return normalizarFecha(d)!;
}
