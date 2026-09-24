/**
 * Catalogo de datos FICTICIOS para poblar la interfaz.
 * Ninguno corresponde a una persona, vehiculo o correo reales.
 * Todos los chasis llevan el prefijo DEMO para poder limpiarlos despues.
 */

export const NOMBRES = [
  'Ana Lucia Restrepo Molina', 'Carlos Andres Pineda Rojas', 'Diana Marcela Ortiz Vega',
  'Eduardo Jose Salgado Mejia', 'Fabiola Andrea Cortes Nunez', 'Gustavo Adolfo Marin Silva',
  'Helena Sofia Bustos Pardo', 'Ivan Dario Quintero Lara', 'Julieta Carolina Arango Ruiz',
  'Kevin Esteban Morales Diaz', 'Laura Valentina Pineda Gomez', 'Mauricio Alberto Serna Cano',
  'Natalia Andrea Bedoya Ospina', 'Oscar Ivan Zapata Henao', 'Paola Andrea Guzman Tovar',
  'Ricardo Alfonso Mendez Paz', 'Sandra Milena Cardona Rios', 'Tomas Felipe Aguirre Leon',
  'Ursula Maria Calderon Pena', 'Victor Hugo Betancur Mesa', 'Wendy Johana Suarez Pabon',
  'Ximena Patricia Rojas Duque', 'Yeison Alberto Correa Vidal', 'Zulma Esperanza Naranjo Gil',
  'Alberto Emilio Vargas Soto', 'Beatriz Elena Ramirez Toro', 'Cristian Camilo Osorio Munoz',
  'Daniela Fernanda Lozano Cruz', 'Esteban Ricardo Gallego Perez', 'Fernanda Isabel Munera Soto',
];

export const VEHICULOS = [
  { marca: 'BAJAJ', linea: 'BOXER CT 100', modelos: [2024, 2025, 2026] },
  { marca: 'BAJAJ', linea: 'PULSAR NS 160', modelos: [2025, 2026] },
  { marca: 'TVS', linea: 'APACHE RTR 160', modelos: [2024, 2025, 2026] },
  { marca: 'TVS', linea: 'RAIDER 125', modelos: [2025, 2026] },
  { marca: 'YAMAHA', linea: 'CRYPTON FI', modelos: [2024, 2025] },
  { marca: 'YAMAHA', linea: 'FZ 2.0', modelos: [2025, 2026] },
  { marca: 'HONDA', linea: 'CB 125F', modelos: [2024, 2025, 2026] },
  { marca: 'HONDA', linea: 'NAVI 110', modelos: [2025, 2026] },
  { marca: 'SUZUKI', linea: 'GIXXER 150', modelos: [2024, 2026] },
  { marca: 'AKT', linea: 'NKD 125', modelos: [2025, 2026] },
];

export const PRENDAS = [
  'Banco Agrario', 'Bancolombia', 'Finandina', 'Sufi', 'Crediorbe', null, null,
];

export const OBSERVACIONES = [
  'Cliente entrega documentos el proximo lunes.',
  'Falta certificado de residencia.',
  'Tramite con poder autenticado.',
  'Cliente solicita entrega en el punto de venta.',
  'Pendiente firma del pagare.',
  null, null, null,
];

/** Usuarios de prueba: un asesor por transito. Contraseña unica para los tres. */
export const USUARIOS_DEMO = [
  { email: 'asesor.nechi@example.com', nombre: 'Marta Elena Ruiz Vera', pdv: 'NECHI' },
  { email: 'asesor.planeta@example.com', nombre: 'Jorge Ivan Palacio Duque', pdv: 'PLANETA RICA' },
  { email: 'asesor.sanmarcos@example.com', nombre: 'Claudia Ines Bravo Mora', pdv: 'SAN MARCOS' },
];

export const PASSWORD_DEMO = 'Demo.Nechimotos2026';

/**
 * Reparto de estados pensado para que la interfaz muestre los tres semaforos,
 * el bloqueo por RUNT y el flujo completo sin tener que crear nada a mano.
 */
export const REPARTO = [
  // [estado, runt, diasDesdeApertura, conSoat, conPlaca]
  ['REGISTRADO', 'NO', 2, false, false],
  ['REGISTRADO', 'NO', 5, false, false],
  ['REGISTRADO', 'NO', 14, true, false],
  ['REGISTRADO', 'NO', 26, true, false],
  ['REGISTRADO', 'SI', 3, true, false],
  ['REGISTRADO', 'SI', 8, true, false],
  ['DOC_COMPLETA', 'NO', 12, true, false],
  ['DOC_COMPLETA', 'NO', 24, true, false],
  ['DOC_COMPLETA', 'SI', 4, true, false],
  ['DOC_COMPLETA', 'SI', 11, true, false],
  ['EN_TRANSITO', 'SI', 9, true, true],
  ['EN_TRANSITO', 'SI', 16, true, true],
  ['EN_TRANSITO', 'SI', 23, true, true],
  ['EN_TRANSITO', 'SI', 31, true, true],
  ['MATRICULADO', 'SI', 18, true, true],
  ['MATRICULADO', 'SI', 27, true, true],
  ['MATRICULADO', 'SI', 35, true, true],
  ['ENTREGADO', 'SI', 42, true, true],
  ['ENTREGADO', 'SI', 55, true, true],
  ['ENTREGADO', 'SI', 68, true, true],
];

export const CODIGOS = ['CONTADO', 'CREDITO', 'LEASING', 'TRASPASO', 'RETOMA'];

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITOS = '0123456789';

/** Generador determinista: la misma semilla produce siempre el mismo lote. */
export function aleatorio(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export const elegir = (rnd, lista) => lista[Math.floor(rnd() * lista.length)];

export function placaFicticia(rnd) {
  const l = () => LETRAS[Math.floor(rnd() * LETRAS.length)];
  const d = () => DIGITOS[Math.floor(rnd() * DIGITOS.length)];
  return `${l()}${l()}${l()}${d()}${d()}${l()}`;
}

export function cedulaFicticia(rnd, i) {
  return String(1000000000 + Math.floor(rnd() * 99999999) + i);
}

/** Chasis y motor ficticios. El prefijo DEMO marca la fila como de prueba. */
export function chasisFicticio(i) {
  return `DEMO${String(i).padStart(4, '0')}VIN${String(i * 7919 % 100000).padStart(5, '0')}`;
}

export function motorFicticio(rnd, i) {
  const l = () => LETRAS[Math.floor(rnd() * LETRAS.length)];
  return `${l()}${l()}${String(100000 + i * 137).slice(0, 6)}`;
}

/** Fecha en YYYY-MM-DD, n dias antes de hoy. */
export function haceDias(n) {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}
