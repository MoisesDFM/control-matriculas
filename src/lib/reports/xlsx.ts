import ExcelJS from 'exceljs';
import { celdaSegura } from '../security/sanitize';
import { ENCABEZADOS } from '../integrations/google-sheets';
import type { RegistroVista } from '../domain/registros.repo';
import type { KpiResumen, KpiRuntPdv, KpiSla } from './kpis';
import { hoy } from '../domain/fechas';

const AZUL = 'FF1E3A8A';
const ROJO = 'FFFEE2E2';
const AMBAR = 'FFFEF3C7';
const VERDE = 'FFDCFCE7';

/**
 * Generador de libros .xlsx nativos con exceljs.
 * - Hoja "REGISTROS": columnas A..P en el mismo orden del Excel original.
 * - Fechas escritas como TEXTO 'YYYY/MM/DD' para que ningun Excel regional
 *   las reinterprete como MM/DD/YYYY.
 * - Toda celda de texto pasa por celdaSegura(): neutraliza inyeccion de formulas.
 */
export async function libroRegistros(
  filas: RegistroVista[],
  meta: { alcance: string; usuario: string },
): Promise<Buffer> {
  const wb = nuevoLibro(meta.usuario);
  const ws = wb.addWorksheet('REGISTROS', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true },
  });

  ws.columns = [
    { header: ENCABEZADOS[0], key: 'a', width: 16 },
    { header: ENCABEZADOS[1], key: 'b', width: 32 },
    { header: ENCABEZADOS[2], key: 'c', width: 14 },
    { header: ENCABEZADOS[3], key: 'd', width: 12 },
    { header: ENCABEZADOS[4], key: 'e', width: 22 },
    { header: ENCABEZADOS[5], key: 'f', width: 14 },
    { header: ENCABEZADOS[6], key: 'g', width: 14 },
    { header: ENCABEZADOS[7], key: 'h', width: 18 },
    { header: ENCABEZADOS[8], key: 'i', width: 9 },
    { header: ENCABEZADOS[9], key: 'j', width: 10 },
    { header: ENCABEZADOS[10], key: 'k', width: 14 },
    { header: ENCABEZADOS[11], key: 'l', width: 14 },
    { header: ENCABEZADOS[12], key: 'm', width: 22 },
    { header: ENCABEZADOS[13], key: 'n', width: 18 },
    { header: ENCABEZADOS[14], key: 'o', width: 7 },
    { header: ENCABEZADOS[15], key: 'p', width: 40 },
  ];

  encabezar(ws, 16);

  for (const r of filas) {
    const row = ws.addRow({
      a: celdaSegura(r.col_a_identificacion),
      b: celdaSegura(r.col_b_nombre),
      c: r.col_c_fecha_apertura, // texto YYYY/MM/DD
      d: celdaSegura(r.col_d_codigo),
      e: celdaSegura(r.col_e_ciudad_correspondencia),
      f: celdaSegura(r.col_f_prenda),
      g: celdaSegura(r.col_g_marca),
      h: celdaSegura(r.col_h_linea),
      i: r.col_i_modelo,
      j: celdaSegura(r.col_j_placa),
      k: r.col_k_soat ?? '',
      l: r.col_l_fecha_matricula ?? '',
      m: celdaSegura(r.col_m_chasis),
      n: celdaSegura(r.col_n_motor),
      o: r.col_o_runt,
      p: celdaSegura(r.col_p_observacion),
    });

    for (const col of ['c', 'k', 'l']) {
      row.getCell(col).alignment = { horizontal: 'center' };
      row.getCell(col).numFmt = '@'; // texto: preserva YYYY/MM/DD
    }

    // Resaltado visual del bloqueo por RUNT
    if (r.bloqueado_runt) {
      row.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO } };
      });
      row.getCell('o').font = { bold: true, color: { argb: 'FF991B1B' } };
    } else if (r.semaforo === 'CRITICO' || r.semaforo === 'ALERTA') {
      row.getCell('c').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBAR } };
    } else if (r.semaforo === 'OK') {
      row.getCell('l').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    }
  }

  ws.autoFilter = { from: 'A1', to: `P${filas.length + 1}` };
  hojaPortada(wb, { alcance: meta.alcance, usuario: meta.usuario, filas: filas.length });

  return (await wb.xlsx.writeBuffer()) as Buffer;
}

/** Libro de indicadores para las revisiones de cada 8 dias y mensuales. */
export async function libroKpis(
  datos: { resumen: KpiResumen; runtPorPdv: KpiRuntPdv[]; sla: KpiSla[] },
  meta: { alcance: string; usuario: string; periodo: string },
): Promise<Buffer> {
  const wb = nuevoLibro(meta.usuario);

  // --- Resumen global ---
  const r = wb.addWorksheet('RESUMEN');
  r.columns = [
    { header: 'INDICADOR', key: 'k', width: 38 },
    { header: 'VALOR', key: 'v', width: 16 },
  ];
  encabezar(r, 2);
  const pares: [string, number | string][] = [
    ['Periodo', meta.periodo],
    ['Alcance', meta.alcance],
    ['Total ventas realizadas', datos.resumen.totalVentas],
    ['Matriculas ejecutadas', datos.resumen.matriculasEjecutadas],
    ['Pendientes', datos.resumen.pendientes],
    ['SOAT expedidos', datos.resumen.soatsExpedidos],
    ['Carpetas en transito', datos.resumen.enTransito],
    ['BLOQUEADAS POR RUNT', datos.resumen.bloqueadosRunt],
    ['% cumplimiento matriculas', `${datos.resumen.pctCumplimiento}%`],
  ];
  for (const [k, v] of pares) {
    const row = r.addRow({ k, v });
    if (k.startsWith('BLOQUEADAS')) {
      row.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO } };
        c.font = { bold: true, color: { argb: 'FF991B1B' } };
      });
    }
  }

  // --- RUNT por PDV ---
  const p = wb.addWorksheet('RUNT POR PDV');
  p.columns = [
    { header: 'CIUDAD CORRESPONDENCIA', key: 'c', width: 26 },
    { header: 'TRANSITO', key: 't', width: 16 },
    { header: 'TOTAL CLIENTES', key: 'tt', width: 16 },
    { header: 'NO INSCRITOS', key: 'n', width: 15 },
    { header: '% NO INSCRITOS', key: 'pc', width: 16 },
  ];
  encabezar(p, 5);
  for (const f of datos.runtPorPdv) {
    const row = p.addRow({
      c: celdaSegura(f.ciudadCorrespondencia),
      t: celdaSegura(f.transito),
      tt: f.total,
      n: f.noInscritos,
      pc: f.pctNoInscritos / 100,
    });
    row.getCell('pc').numFmt = '0.00%';
    if (f.pctNoInscritos >= 30) {
      row.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO } };
      });
    } else if (f.pctNoInscritos >= 10) {
      row.getCell('pc').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBAR } };
    }
  }

  // --- SLA por tramitador ---
  const s = wb.addWorksheet('SLA TRAMITADORES');
  s.columns = [
    { header: 'TRAMITADOR', key: 'tr', width: 22 },
    { header: 'TRANSITO', key: 't', width: 16 },
    { header: 'CARPETAS', key: 'c', width: 12 },
    { header: 'DIAS PROM. TOTAL', key: 'dt', width: 18 },
    { header: 'DIAS PROM. EN TRANSITO', key: 'dtr', width: 22 },
    { header: 'DEMORADAS (>15 DIAS)', key: 'd', width: 22 },
  ];
  encabezar(s, 6);
  for (const f of datos.sla) {
    const row = s.addRow({
      tr: celdaSegura(f.tramitador),
      t: celdaSegura(f.transito),
      c: f.carpetas,
      dt: f.diasPromTotal,
      dtr: f.diasPromTransito,
      d: f.demoradas,
    });
    if (f.demoradas > 0) {
      row.getCell('d').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO } };
      row.getCell('d').font = { bold: true };
    }
  }

  return (await wb.xlsx.writeBuffer()) as Buffer;
}

// ------------------------------------------------------------------ helpers
function nuevoLibro(usuario: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = `NECHIMOTOS · ${usuario}`;
  wb.created = new Date();
  wb.company = 'NECHIMOTOS';
  return wb;
}

function encabezar(ws: ExcelJS.Worksheet, columnas: number): void {
  const fila = ws.getRow(1);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  fila.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  fila.height = 28;
  for (let i = 1; i <= columnas; i++) {
    fila.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    fila.getCell(i).border = { bottom: { style: 'medium', color: { argb: 'FF0F172A' } } };
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function hojaPortada(wb: ExcelJS.Workbook, m: { alcance: string; usuario: string; filas: number }): void {
  const ws = wb.addWorksheet('INFORMACION');
  ws.columns = [
    { key: 'k', width: 30 },
    { key: 'v', width: 46 },
  ];
  const lineas: [string, string][] = [
    ['Reporte', 'Registros de matriculas y tramites'],
    ['Generado', hoy()],
    ['Generado por', m.usuario],
    ['Alcance de los datos', m.alcance],
    ['Filas exportadas', String(m.filas)],
    ['Formato de fechas', 'YYYY/MM/DD (texto, no reinterpretable)'],
    ['Confidencialidad', 'Contiene datos personales. Uso interno exclusivo.'],
  ];
  for (const [k, v] of lineas) {
    const row = ws.addRow({ k, v });
    row.getCell('k').font = { bold: true };
  }
}

/** Nombre de archivo determinista y seguro. */
export function nombreArchivo(prefijo: string): string {
  return `${prefijo}_${hoy().replace(/\//g, '')}.xlsx`;
}
