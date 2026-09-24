/** Organismo de transito tal como lo devuelve /api/admin/transitos. */
export interface Transito {
  id: number;
  nombre: string;
  activo: boolean;
  tramitadores: number;
}
