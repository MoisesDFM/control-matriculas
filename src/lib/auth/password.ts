import bcrypt from 'bcryptjs';

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Comparacion contra un hash señuelo cuando el usuario no existe: iguala el
 * tiempo de respuesta y evita enumeracion de cuentas por temporizacion.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.tS8nnaYPgtcTgVCdOSk9iCgFDpTcSPa';
export async function fakeCompare(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH);
}

/** Politica minima de contraseñas para usuarios internos. */
export function passwordPolicy(p: string): string | null {
  if (p.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (!/[A-Z]/.test(p)) return 'Debe incluir al menos una mayuscula.';
  if (!/[a-z]/.test(p)) return 'Debe incluir al menos una minuscula.';
  if (!/[0-9]/.test(p)) return 'Debe incluir al menos un numero.';
  return null;
}
