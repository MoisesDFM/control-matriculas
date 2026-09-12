import { ruta, ok } from '@/lib/api/handler';
import { filtrosSchema, registroCrearSchema } from '@/lib/domain/schemas';
import { crearRegistro, listarRegistros, obtenerRegistro } from '@/lib/domain/registros.repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/registros - listado paginado.
 * El asesor recibe exclusivamente los registros de su CIUDAD CORRESPONDENCIA:
 * el filtro se inyecta desde el JWT en alcance(), no desde la querystring.
 */
export const GET = ruta({ schema: filtrosSchema }, async ({ sesion, body }) => {
  const { filas, total } = await listarRegistros(sesion, body);
  return ok({
    filas,
    total,
    pagina: body.pagina,
    porPagina: body.porPagina,
    paginas: Math.max(1, Math.ceil(total / body.porPagina)),
    alcance: sesion.rol === 'ADMIN' ? 'GLOBAL' : `PDV:${sesion.puntoVentaId}`,
  });
});

/** POST /api/registros - registrar una venta. El RUNT arranca siempre en 'No'. */
export const POST = ruta({ schema: registroCrearSchema }, async ({ sesion, body, auditar }) => {
  const id = await crearRegistro(sesion, body);
  await auditar('REGISTRO_CREATE', { entidad: 'registros', entidadId: id, metadata: { chasis: body.chasis } });
  const registro = await obtenerRegistro(sesion, id);
  return ok({ registro }, { status: 201 });
});
