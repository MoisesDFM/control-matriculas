import { z } from 'zod';
import { NextResponse } from 'next/server';
import { ruta } from '@/lib/api/handler';
import { LIMITES } from '@/lib/security/rate-limit';
import { filtrosSchema } from '@/lib/domain/schemas';
import { listarRegistros } from '@/lib/domain/registros.repo';
import { kpiResumen, kpiRuntPorPdv, kpiSla } from '@/lib/reports/kpis';
import { libroKpis, libroRegistros, nombreArchivo } from '@/lib/reports/xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const params = filtrosSchema.extend({
  tipo: z.enum(['REGISTROS', 'KPIS']).default('REGISTROS'),
});

/**
 * GET /api/reportes/xlsx - descarga nativa .xlsx.
 * El archivo se arma con el MISMO filtro RBAC del listado: un asesor jamas
 * puede exportar datos de otra sede, ni manipulando la querystring.
 */
export const GET = ruta({ schema: params, limite: LIMITES.export }, async ({ sesion, body, auditar }) => {
  const alcanceTexto =
    sesion.rol === 'ADMIN' ? 'Global (todos los puntos de venta)' : `Punto de venta del asesor (id ${sesion.puntoVentaId})`;

  let buffer: Buffer;
  let nombre: string;

  if (body.tipo === 'KPIS') {
    const [resumen, runtPorPdv, sla] = await Promise.all([
      kpiResumen(sesion, { desde: body.desde ?? null, hasta: body.hasta ?? null }),
      kpiRuntPorPdv(sesion),
      kpiSla(sesion),
    ]);
    buffer = await libroKpis(
      { resumen, runtPorPdv, sla },
      {
        alcance: alcanceTexto,
        usuario: sesion.nombre,
        periodo: `${body.desde ?? 'inicio'} - ${body.hasta ?? 'hoy'}`,
      },
    );
    nombre = nombreArchivo('NECHIMOTOS_INDICADORES');
  } else {
    // Exportacion completa del filtro actual (hasta 5000 filas por descarga).
    const { filas } = await listarRegistros(sesion, { ...body, pagina: 1, porPagina: 200 });
    const todas = filas;
    let pagina = 2;
    while (todas.length < 5000) {
      const siguiente = await listarRegistros(sesion, { ...body, pagina, porPagina: 200 });
      if (siguiente.filas.length === 0) break;
      todas.push(...siguiente.filas);
      if (siguiente.filas.length < 200) break;
      pagina++;
    }
    buffer = await libroRegistros(todas, { alcance: alcanceTexto, usuario: sesion.nombre });
    nombre = nombreArchivo('NECHIMOTOS_REGISTROS');
  }

  await auditar('EXPORT_XLSX', { metadata: { tipo: body.tipo, bytes: buffer.byteLength } });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'no-store, private',
    },
  });
});
