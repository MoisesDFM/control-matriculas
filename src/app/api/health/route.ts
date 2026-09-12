import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sonda de salud. No revela version, esquema ni datos. */
export async function GET(): Promise<NextResponse> {
  try {
    await queryOne(`SELECT 1 AS ok`);
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
