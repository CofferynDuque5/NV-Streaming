import {
  type BilleteraPublica,
  type CatalogoPublico,
  CONTACTO_VACIO,
  esPaletaSitio,
  type Moneda,
  PALETA_PREDETERMINADA,
  type ResumenRevendedor,
  type Rol,
  rutaInicio,
  type TemaSitioPublico,
} from '@nv/shared';
import { cache } from 'react';
import { monedaValida } from '@/componentes/planes';
import { monedaMayorista } from '@/componentes/planes-mayoristas';
import type { MayoristaTienda } from '@/componentes/tienda/precio-tarjeta';
import { leerApi } from './api-servidor';
import { vistaMayorista } from './revendedor-publico';
import { obtenerSesion } from './sesion';
import { ETIQUETA_SITIO, leerCatalogo } from './sitio';
import { ubicacionVisitante } from './ubicacion';

const API = process.env.API_URL_INTERNA ?? 'http://localhost:4000';

const TEMA_PREDETERMINADO: TemaSitioPublico = {
  paleta: PALETA_PREDETERMINADA,
  contacto: CONTACTO_VACIO,
  metodosPago: [],
};

/**
 * Tema público del sitio: paleta, datos de contacto y métodos de cobro activos
 * (solo nombre y moneda). Si la API no responde, el sitio se ve con la paleta
 * de NV y sin datos de contacto: nunca se inventan.
 */
export const leerTemaPublico = cache(async (): Promise<TemaSitioPublico> => {
  try {
    const r = await fetch(`${API}/api/v1/sitio/publico/tema`, {
      next: { tags: [ETIQUETA_SITIO], revalidate: 60 },
    });
    if (!r.ok) return TEMA_PREDETERMINADO;
    const datos = (await r.json()) as Partial<TemaSitioPublico>;
    return {
      paleta: esPaletaSitio(datos.paleta) ? datos.paleta : PALETA_PREDETERMINADA,
      contacto: { ...CONTACTO_VACIO, ...datos.contacto },
      metodosPago: Array.isArray(datos.metodosPago) ? datos.metodosPago : [],
    };
  } catch {
    return TEMA_PREDETERMINADO;
  }
});

/** Catálogo público de la petición (una sola lectura por render, con caché de 5 minutos). */
export const catalogoTienda = cache(async (): Promise<CatalogoPublico | null> => leerCatalogo());

/**
 * Moneda en la que se muestran los precios: la pedida en la URL, la elegida
 * antes (cookie) o la del país de la visita, entre las que tiene el catálogo.
 */
export const monedaTienda = cache(async (pedida?: string): Promise<Moneda> => {
  const [catalogo, ubicacion] = await Promise.all([catalogoTienda(), ubicacionVisitante()]);
  return monedaValida(catalogo?.monedas ?? ['USD'], pedida, ubicacion.moneda);
});

export interface SesionTienda {
  nombre: string;
  rol: Rol;
  /** Inicio de su panel. */
  panel: string;
  /** Saldo en USD de su billetera (clientes) o de su cuenta (revendedores). */
  saldoUsd: string | null;
  enlaceSaldo: string | null;
}

/**
 * Quién visita la tienda, para la cabecera. Sin cookie de sesión no se
 * consulta la API. El saldo se lee en cada petición y nunca se guarda en caché.
 */
export const sesionTienda = cache(async (): Promise<SesionTienda | null> => {
  let sesion: Awaited<ReturnType<typeof obtenerSesion>>;
  try {
    sesion = await obtenerSesion();
  } catch {
    return null;
  }
  if (!sesion || sesion.pendiente) return null;
  const { rol, nombre } = sesion.usuario;
  const base = { nombre, rol, panel: rutaInicio(rol), saldoUsd: null, enlaceSaldo: null };
  try {
    if (rol === 'cliente') {
      const r = await leerApi<BilleteraPublica>('/mi/billetera');
      if (r.datos) return { ...base, saldoUsd: r.datos.saldoUsd, enlaceSaldo: '/cuenta/billetera' };
    }
    if (rol === 'revendedor') {
      const r = await leerApi<ResumenRevendedor>('/revendedor/resumen');
      if (r.datos)
        return {
          ...base,
          saldoUsd: r.datos.revendedor.saldoUsd,
          enlaceSaldo: '/revendedor/saldo',
        };
    }
  } catch {
    // Sin saldo: la cabecera solo muestra el acceso al panel.
  }
  return base;
});

/**
 * Precios mayoristas de un revendedor con sesión, en USD o bolívares según la
 * moneda de la tienda. `null` para cualquier otra visita. Se lee en cada
 * petición con su cookie: nunca se guarda en caché.
 */
export const mayoristaTienda = cache(async (moneda: Moneda): Promise<MayoristaTienda | null> => {
  const vista = await vistaMayorista();
  return vista ? { vista, moneda: monedaMayorista(vista, moneda) } : null;
});
