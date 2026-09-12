import { query, queryOne } from '../db';

export interface LimiteConfig {
  /** Identificador del bucket, p.ej. 'login', 'registros:write'. */
  nombre: string;
  /** Maximo de peticiones permitidas dentro de la ventana. */
  max: number;
  /** Duracion de la ventana en segundos. */
  ventanaSeg: number;
}

export const LIMITES = {
  login: { nombre: 'login', max: 5, ventanaSeg: 300 },            // 5 intentos / 5 min
  escritura: { nombre: 'write', max: 60, ventanaSeg: 60 },         // 60 escrituras / min
  lectura: { nombre: 'read', max: 240, ventanaSeg: 60 },
  sync: { nombre: 'sync', max: 4, ventanaSeg: 300 },
  export: { nombre: 'export', max: 10, ventanaSeg: 600 },
} as const satisfies Record<string, LimiteConfig>;

export interface ResultadoLimite {
  permitido: boolean;
  restantes: number;
  reintentarEn: number; // segundos
}

/**
 * Rate limit atomico en PostgreSQL (funciona en serverless, donde la memoria
 * del proceso no se comparte entre invocaciones). Un solo round-trip.
 */
export async function rateLimit(cfg: LimiteConfig, clave: string): Promise<ResultadoLimite> {
  const bucket = `${cfg.nombre}:${clave}`;
  const row = await queryOne<{ hits: number; ventana_fin: Date }>(
    `INSERT INTO rate_limit (bucket, hits, ventana_fin)
     VALUES ($1, 1, now() + ($2 || ' seconds')::interval)
     ON CONFLICT (bucket) DO UPDATE
       SET hits = CASE WHEN rate_limit.ventana_fin < now() THEN 1 ELSE rate_limit.hits + 1 END,
           ventana_fin = CASE WHEN rate_limit.ventana_fin < now()
                              THEN now() + ($2 || ' seconds')::interval
                              ELSE rate_limit.ventana_fin END
     RETURNING hits, ventana_fin`,
    [bucket, String(cfg.ventanaSeg)],
  );

  if (!row) return { permitido: true, restantes: cfg.max - 1, reintentarEn: 0 };

  const reintentarEn = Math.max(0, Math.ceil((row.ventana_fin.getTime() - Date.now()) / 1000));
  return {
    permitido: row.hits <= cfg.max,
    restantes: Math.max(0, cfg.max - row.hits),
    reintentarEn,
  };
}

/** Limpieza periodica (invocada por el cron de sincronizacion). */
export async function limpiarRateLimit(): Promise<void> {
  await query(`DELETE FROM rate_limit WHERE ventana_fin < now() - interval '1 hour'`);
}

/** IP real detras del proxy de Vercel/Render. */
export function ipDe(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '0.0.0.0';
  return ip;
}
