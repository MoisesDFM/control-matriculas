import { z } from 'zod';

/**
 * Validacion de configuracion en el arranque. Si falta un secreto la app
 * NO levanta: preferimos fallar ruidosamente a quedar abierta por defecto.
 */
const schema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgres'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().min(5).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  APP_ORIGIN: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
  GOOGLE_SHEETS_TAB: z.string().default('REGISTROS'),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),

  CRON_SECRET: z.string().min(16).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detalle = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Configuracion invalida (.env):\n${detalle}`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

export const sheetsConfigurado = Boolean(
  env.GOOGLE_SHEETS_SPREADSHEET_ID &&
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
);
