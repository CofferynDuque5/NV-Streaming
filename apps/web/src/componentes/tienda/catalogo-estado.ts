import {
  type CategoriaServicio,
  CATEGORIAS_SERVICIO,
  ORDENES_CATALOGO,
  type OrdenCatalogo,
} from '@nv/shared';

/** Cuántas tarjetas se muestran de entrada y en cada «Cargar más». */
export const POR_PAGINA = 12;

export type VistaCatalogo = 'rejilla' | 'lista';

export interface EstadoCatalogo {
  texto: string;
  categoria: CategoriaServicio | null;
  duracion: string | null;
  precioMax: number | null;
  orden: OrdenCatalogo;
  vista: VistaCatalogo;
}

/** Lee los filtros de la URL; lo que no es válido se ignora. */
export function estadoDesdeUrl(p: Record<string, string | string[] | undefined>): EstadoCatalogo {
  const uno = (k: string) => {
    const v = p[k];
    return typeof v === 'string' ? v : undefined;
  };
  const categoria = uno('categoria');
  const orden = uno('orden');
  const max = Number(uno('max'));
  return {
    texto: (uno('q') ?? '').slice(0, 80),
    categoria: CATEGORIAS_SERVICIO.includes(categoria as CategoriaServicio)
      ? (categoria as CategoriaServicio)
      : null,
    duracion: /^\d{1,3}-(dia|mes)$/.test(uno('duracion') ?? '') ? (uno('duracion') ?? null) : null,
    precioMax: Number.isFinite(max) && max > 0 ? max : null,
    orden: ORDENES_CATALOGO.includes(orden as OrdenCatalogo)
      ? (orden as OrdenCatalogo)
      : 'recomendados',
    vista: uno('vista') === 'lista' ? 'lista' : 'rejilla',
  };
}
