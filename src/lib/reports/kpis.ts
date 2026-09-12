import { query, queryOne } from '../db';
import { alcance } from '../api/rbac';
import type { Sesion } from '../auth/session';
import { aISO } from '../domain/fechas';

export interface KpiResumen {
  totalVentas: number;
  matriculasEjecutadas: number;
  pendientes: number;
  soatsExpedidos: number;
  bloqueadosRunt: number;
  enTransito: number;
  pctCumplimiento: number;
}

export interface KpiRuntPdv {
  puntoVentaId: number;
  ciudadCorrespondencia: string;
  transito: string;
  total: number;
  noInscritos: number;
  pctNoInscritos: number;
}

export interface KpiSla {
  tramitadorId: number;
  tramitador: string;
  transito: string;
  carpetas: number;
  diasPromTotal: number;
  diasPromTransito: number;
  demoradas: number;
}

export interface Periodo {
  desde: string | null; // YYYY/MM/DD
  hasta: string | null;
}

/**
 * Los tres bloques del dashboard (requisito 6). Todos respetan el aislamiento
 * por sede: un asesor ve unicamente los indicadores de su punto de venta.
 */
export async function kpiResumen(sesion: Sesion, p: Periodo): Promise<KpiResumen> {
  const al = alcance(sesion, 'r');
  const params = [...al.params, aISO(p.desde), aISO(p.hasta)];
  const i = al.siguiente;

  const row = await queryOne<Record<string, string>>(
    `SELECT
       count(*)::text                                                                 AS total,
       count(*) FILTER (WHERE r.estado IN ('MATRICULADO','ENTREGADO'))::text           AS matriculadas,
       count(*) FILTER (WHERE r.estado NOT IN ('MATRICULADO','ENTREGADO','ANULADO'))::text AS pendientes,
       count(*) FILTER (WHERE r.soat_fecha_expedicion IS NOT NULL)::text               AS soats,
       count(*) FILTER (WHERE r.runt = 'NO' AND r.estado <> 'ANULADO')::text           AS bloqueados,
       count(*) FILTER (WHERE r.estado = 'EN_TRANSITO')::text                          AS transito
     FROM registros r
     WHERE ${al.where}
       AND ($${i}::date IS NULL OR r.fecha_apertura >= $${i}::date)
       AND ($${i + 1}::date IS NULL OR r.fecha_apertura <= $${i + 1}::date)`,
    params,
  );

  const total = Number(row?.total ?? 0);
  const matriculadas = Number(row?.matriculadas ?? 0);

  return {
    totalVentas: total,
    matriculasEjecutadas: matriculadas,
    pendientes: Number(row?.pendientes ?? 0),
    soatsExpedidos: Number(row?.soats ?? 0),
    bloqueadosRunt: Number(row?.bloqueados ?? 0),
    enTransito: Number(row?.transito ?? 0),
    pctCumplimiento: total === 0 ? 0 : Math.round((matriculadas / total) * 1000) / 10,
  };
}

export async function kpiRuntPorPdv(sesion: Sesion): Promise<KpiRuntPdv[]> {
  const al = alcance(sesion, 'k');
  const filas = await query<{
    punto_venta_id: number;
    ciudad_correspondencia: string;
    transito: string;
    total: string;
    no_inscritos: string;
    pct_no_inscritos: string;
  }>(
    `SELECT * FROM vw_kpi_runt_pdv k WHERE ${al.where} ORDER BY pct_no_inscritos DESC, ciudad_correspondencia`,
    al.params,
  );

  return filas.map((f) => ({
    puntoVentaId: f.punto_venta_id,
    ciudadCorrespondencia: f.ciudad_correspondencia,
    transito: f.transito,
    total: Number(f.total),
    noInscritos: Number(f.no_inscritos),
    pctNoInscritos: Number(f.pct_no_inscritos),
  }));
}

/**
 * SLA por tramitador. Para el asesor se recalcula restringido a su PDV (la
 * vista agregada es global, por eso aqui se consulta la tabla base).
 */
export async function kpiSla(sesion: Sesion): Promise<KpiSla[]> {
  if (sesion.rol === 'ADMIN') {
    const filas = await query<{
      tramitador_id: number; tramitador: string; transito: string;
      carpetas: string; dias_prom_total: string | null; dias_prom_transito: string | null; demoradas: string;
    }>(`SELECT * FROM vw_kpi_sla ORDER BY dias_prom_total DESC NULLS LAST`);
    return filas.map(mapSla);
  }

  const al = alcance(sesion, 'r');
  const filas = await query<{
    tramitador_id: number; tramitador: string; transito: string;
    carpetas: string; dias_prom_total: string | null; dias_prom_transito: string | null; demoradas: string;
  }>(
    `SELECT tr.id AS tramitador_id, tr.nombre AS tramitador, t.nombre AS transito,
            count(r.id)::text AS carpetas,
            round(avg(coalesce(r.matriculado_en::date, CURRENT_DATE) - r.fecha_apertura)::numeric, 1)::text AS dias_prom_total,
            round(avg(CASE WHEN r.en_transito_en IS NOT NULL
                  THEN coalesce(r.matriculado_en::date, CURRENT_DATE) - r.en_transito_en::date END)::numeric, 1)::text AS dias_prom_transito,
            count(r.id) FILTER (WHERE r.estado = 'EN_TRANSITO'
                  AND (CURRENT_DATE - r.en_transito_en::date) > 15)::text AS demoradas
       FROM registros r
       JOIN tramitadores tr ON tr.id = r.tramitador_id
       JOIN transitos    t  ON t.id  = tr.transito_id
      WHERE ${al.where} AND r.estado <> 'ANULADO'
      GROUP BY tr.id, tr.nombre, t.nombre
      ORDER BY dias_prom_total DESC NULLS LAST`,
    al.params,
  );
  return filas.map(mapSla);
}

/** Serie temporal para la revision de cada 8 dias (ventas vs matriculas). */
export async function kpiSerieSemanal(sesion: Sesion, semanas = 12) {
  const al = alcance(sesion, 'r');
  return query<{ semana: string; ventas: string; matriculas: string }>(
    `SELECT to_char(date_trunc('week', r.fecha_apertura), 'YYYY/MM/DD') AS semana,
            count(*)::text AS ventas,
            count(*) FILTER (WHERE r.estado IN ('MATRICULADO','ENTREGADO'))::text AS matriculas
       FROM registros r
      WHERE ${al.where}
        AND r.estado <> 'ANULADO'
        AND r.fecha_apertura >= date_trunc('week', CURRENT_DATE) - ($${al.siguiente}::int * interval '1 week')
      GROUP BY 1 ORDER BY 1`,
    [...al.params, semanas],
  );
}

function mapSla(f: {
  tramitador_id: number; tramitador: string; transito: string;
  carpetas: string; dias_prom_total: string | null; dias_prom_transito: string | null; demoradas: string;
}): KpiSla {
  return {
    tramitadorId: f.tramitador_id,
    tramitador: f.tramitador,
    transito: f.transito,
    carpetas: Number(f.carpetas),
    diasPromTotal: Number(f.dias_prom_total ?? 0),
    diasPromTransito: Number(f.dias_prom_transito ?? 0),
    demoradas: Number(f.demoradas),
  };
}
