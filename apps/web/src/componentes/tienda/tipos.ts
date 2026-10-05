import type { CategoriaServicio, ClaveArte, Moneda } from '@nv/shared';

/** Servicio tal como lo muestran el buscador y el megamenú (precios ya formateados). */
export interface ServicioMenu {
  id: string;
  nombre: string;
  slug: string;
  categoria: CategoriaServicio | null;
  color: string;
  arte: ClaveArte | null;
  /** Precio del plan más barato en la moneda elegida, tal como lo dio la API. */
  desde: string | null;
  duracion: string | null;
}

export interface CategoriaMenu {
  id: CategoriaServicio;
  nombre: string;
  descripcion: string;
  color: string;
  cuenta: number;
  desde: string | null;
  servicios: ServicioMenu[];
  /** El más pedido del universo en los últimos 30 días, si hubo pedidos. */
  destacado: ServicioMenu | null;
}

export interface OpcionMoneda {
  codigo: Moneda;
  nombre: string;
  simbolo: string;
  /** «1 USD = Bs.S 150,00» con la tasa vigente, o «Moneda base de los precios». */
  detalle: string | null;
}

export interface SesionMenu {
  nombre: string;
  panel: string;
  saldo: string | null;
  enlaceSaldo: string | null;
}

/** Cookie que recuerda que se cerró la barra de la tasa del día (vive en @nv/shared). */
export { COOKIE_AVISO_TASA } from '@nv/shared';
