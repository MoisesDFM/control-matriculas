import { google, type sheets_v4 } from 'googleapis';
import { env, sheetsConfigurado } from '../env';
import { celdaSegura } from '../security/sanitize';

/**
 * Integracion con Google Sheets mediante Service Account (cuota gratuita).
 *
 * Puesta en marcha:
 *  1. Google Cloud Console -> nuevo proyecto -> habilitar "Google Sheets API".
 *  2. IAM -> Cuentas de servicio -> crear -> Claves -> JSON.
 *  3. Copiar client_email y private_key a las variables de entorno.
 *  4. Compartir la hoja de Drive con ese client_email como EDITOR.
 *
 * El orden de columnas A..P es un contrato: no se reordena nunca.
 */

export const ENCABEZADOS = [
  'NUMERO DE IDENTIFICACION', // A
  'NOMBRE Y NOMBRES (APELLIDOS)', // B
  'FECHA DE APERTURA', // C  YYYY/MM/DD
  'CODIGOS', // D
  'CIUDAD CORRESPONDENCIA', // E
  'PRENDA', // F
  'MARCA', // G
  'LINEA', // H
  'MODELO', // I
  'PLACA', // J
  'SOAT', // K  YYYY/MM/DD
  'FECHA MATRICULA', // L  YYYY/MM/DD
  'CHASIS', // M
  'MOTOR', // N
  'RUNT', // O  Si / No
  'OBSERVACION', // P
] as const;

export const RANGO_DATOS = () => `${env.GOOGLE_SHEETS_TAB}!A2:P`;
export const RANGO_TOTAL = () => `${env.GOOGLE_SHEETS_TAB}!A1:P`;

let cliente: sheets_v4.Sheets | null = null;

export function sheets(): sheets_v4.Sheets {
  if (!sheetsConfigurado) {
    throw new Error('Google Sheets no esta configurado (faltan variables GOOGLE_*).');
  }
  if (cliente) return cliente;

  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    // La clave llega con \n escapados desde el gestor de variables de entorno.
    key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  cliente = google.sheets({ version: 'v4', auth });
  return cliente;
}

/** Una fila del Excel como arreglo posicional A..P. */
export type FilaAP = (string | number | null)[];

export async function leerFilas(): Promise<{ fila: number; valores: FilaAP }[]> {
  const api = sheets();
  const res = await api.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID!,
    range: RANGO_DATOS(),
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
  });

  const filas = res.data.values ?? [];
  return filas
    .map((valores, i) => ({ fila: i + 2, valores: normalizarAncho(valores as FilaAP) }))
    .filter((f) => f.valores.some((v) => v !== null && v !== ''));
}

/** Escribe/actualiza una fila concreta conservando el orden A..P. */
export async function escribirFila(fila: number, valores: FilaAP): Promise<void> {
  const api = sheets();
  await api.spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID!,
    range: `${env.GOOGLE_SHEETS_TAB}!A${fila}:P${fila}`,
    valueInputOption: 'RAW', // RAW evita que Sheets reinterprete las fechas
    requestBody: { values: [normalizarAncho(valores).map(celdaSegura)] },
  });
}

/** Añade filas al final y devuelve el numero de la primera fila escrita. */
export async function anexarFilas(filas: FilaAP[]): Promise<number | null> {
  if (filas.length === 0) return null;
  const api = sheets();
  const res = await api.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID!,
    range: RANGO_DATOS(),
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: filas.map((f) => normalizarAncho(f).map(celdaSegura)) },
  });
  const rango = res.data.updates?.updatedRange ?? '';
  const m = /![A-Z]+(\d+)/.exec(rango);
  return m?.[1] ? Number(m[1]) : null;
}

/** Reescribe la hoja completa (usado en la sincronizacion total DB -> Sheets). */
export async function reemplazarTodo(filas: FilaAP[]): Promise<void> {
  const api = sheets();
  const id = env.GOOGLE_SHEETS_SPREADSHEET_ID!;
  await api.spreadsheets.values.clear({ spreadsheetId: id, range: RANGO_TOTAL() });
  await api.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${env.GOOGLE_SHEETS_TAB}!A1:P1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[...ENCABEZADOS]] },
  });
  // Lotes de 500 filas: respeta los limites de la cuota gratuita.
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500);
    await api.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${env.GOOGLE_SHEETS_TAB}!A${i + 2}:P${i + 1 + lote.length}`,
      valueInputOption: 'RAW',
      requestBody: { values: lote.map((f) => normalizarAncho(f).map(celdaSegura)) },
    });
  }
}

/** Formatea la cabecera y congela la primera fila (solo cosmetico, idempotente). */
export async function prepararHoja(): Promise<void> {
  const api = sheets();
  const id = env.GOOGLE_SHEETS_SPREADSHEET_ID!;
  const meta = await api.spreadsheets.get({ spreadsheetId: id });
  const hoja = meta.data.sheets?.find((s) => s.properties?.title === env.GOOGLE_SHEETS_TAB);
  const sheetId = hoja?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new Error(`La hoja "${env.GOOGLE_SHEETS_TAB}" no existe en el documento.`);
  }

  await api.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 16 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.12, green: 0.25, blue: 0.55 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
      ],
    },
  });
}

function normalizarAncho(valores: FilaAP): FilaAP {
  const out = valores.slice(0, 16);
  while (out.length < 16) out.push(null);
  return out;
}
