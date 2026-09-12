import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../env';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISS = 'nechimotos-matriculas';
const AUD = 'nechimotos-web';

export type Rol = 'ASESOR' | 'ADMIN';

export interface AccessClaims extends JWTPayload {
  sub: string;             // usuario_id
  rol: Rol;
  /** Punto de venta asignado. null == ADMIN con alcance global. */
  pdv: number | null;
  nombre: string;
  /** Identificador de sesion: permite revocar el access token al cerrar sesion. */
  sid: string;
}

export async function signAccessToken(claims: Omit<AccessClaims, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MIN}m`)
    .sign(secret);
}

/** Verifica firma, issuer, audience y expiracion. Devuelve null si algo falla. */
export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify<AccessClaims>(token, secret, {
      issuer: ISS,
      audience: AUD,
      algorithms: ['HS256'],       // fija el algoritmo: sin "alg: none" ni confusion RS/HS
      clockTolerance: 5,
    });
    if (typeof payload.sub !== 'string' || (payload.rol !== 'ADMIN' && payload.rol !== 'ASESOR')) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
