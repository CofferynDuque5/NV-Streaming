import { type MetodoCobroPublico, serviciosTienda } from '@nv/shared';
import type { Metadata } from 'next';
import { Migas } from '@/componentes/tienda/migas';
import { type CuentaCarrito, PaginaCarrito } from '@/componentes/tienda/pagina-carrito';
import { leerApi } from '@/lib/api-servidor';
import {
  billeteraTienda,
  catalogoTienda,
  leerTemaPublico,
  mayoristaTienda,
  monedaTienda,
  type SesionTienda,
  sesionTienda,
} from '@/lib/tienda';

export const metadata: Metadata = {
  title: 'Carrito',
  description: 'Revisa tus planes, elige cómo pagar y haz tu pedido.',
  robots: { index: false },
};

type Parametros = Record<string, string | string[] | undefined>;

const sinRepetir = (nombres: string[]) => [...new Set(nombres)];

/** Qué puede hacer quien mira el carrito, con su saldo y su pedido por pagar si es cliente. */
async function cuentaDe(sesion: SesionTienda | null): Promise<CuentaCarrito> {
  if (!sesion) return { tipo: 'invitado' };
  if (sesion.rol === 'revendedor') return { tipo: 'revendedor' };
  if (sesion.rol !== 'cliente') return { tipo: 'equipo', panel: sesion.panel };
  try {
    const [billetera, metodos] = await Promise.all([
      billeteraTienda(),
      leerApi<MetodoCobroPublico[]>('/mi/billetera/metodos-cobro'),
    ]);
    if (billetera.estado === 401) return { tipo: 'invitado' };
    if (!billetera.datos) return { tipo: 'error' };
    return {
      tipo: 'cliente',
      saldoUsd: billetera.datos.saldoUsd,
      pendiente: billetera.datos.pedidoPendiente,
      metodosRecarga: sinRepetir((metodos.datos ?? []).map((m) => m.nombre)),
    };
  } catch {
    return { tipo: 'error' };
  }
}

export default async function Carrito({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const pedida = typeof parametros.moneda === 'string' ? parametros.moneda : undefined;
  const [catalogo, moneda, tema, sesion] = await Promise.all([
    catalogoTienda(),
    monedaTienda(pedida),
    leerTemaPublico(),
    sesionTienda(),
  ]);
  const [cuenta, mayorista] = await Promise.all([cuentaDe(sesion), mayoristaTienda(moneda)]);

  return (
    <div className="contenedor grid gap-6 pt-7 pb-16">
      <Migas pasos={[{ texto: 'Inicio', href: '/' }, { texto: 'Carrito' }]} />
      <PaginaCarrito
        servicios={catalogo ? serviciosTienda(catalogo) : []}
        moneda={moneda}
        cuenta={cuenta}
        metodosPago={sinRepetir(tema.metodosPago.map((m) => m.nombre))}
        mayorista={mayorista}
      />
    </div>
  );
}
