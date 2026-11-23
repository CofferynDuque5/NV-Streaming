import type {
  CatalogoPublico,
  ListaRenovaciones,
  MetodoCobroPublico,
  Moneda,
  MovimientoSaldoPublico,
  Pagina,
  RecargaPublica,
  SaldoRevendedor,
} from '@nv/shared';
import type { Metadata } from 'next';
import { VistaBilletera } from '@/componentes/cliente/billetera';
import { AvisosRevendedor, CabeceraPanel, SinResumen } from '@/componentes/revendedor/panel';
import { leerApi } from '@/lib/api-servidor';
import { bloqueoCuenta, leerResumenRevendedor } from '@/lib/panel-revendedor';
import { requerirSesion } from '@/lib/sesion';
import { ubicacionVisitante } from '@/lib/ubicacion';

export const metadata: Metadata = { title: 'Saldo y recargas' };

const MAX_MB = Number(process.env.COMPROBANTE_MAX_MB ?? 5);
/** Recargas y movimientos por página («Ver más» pide la siguiente). */
const POR_PAGINA_RECARGAS = 10;
const POR_PAGINA_MOVIMIENTOS = 6;

export default async function Saldo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requerirSesion({ roles: ['revendedor'] });
  // Desde Renovaciones: servicios elegidos para renovar con esta recarga.
  const pedidos = (await searchParams).renovar;
  const idsRenovar = (typeof pedidos === 'string' ? pedidos.split(',') : [])
    .map((x) => x.trim())
    .filter(Boolean);
  const [{ estado, datos: resumen }, saldo, recargas, movimientos, metodos, catalogo, ubicacion] =
    await Promise.all([
      leerResumenRevendedor(),
      leerApi<SaldoRevendedor>('/revendedor/saldo').then((r) => r.datos),
      leerApi<Pagina<RecargaPublica>>(`/revendedor/recargas?porPagina=${POR_PAGINA_RECARGAS}`).then(
        (r) => r.datos,
      ),
      leerApi<Pagina<MovimientoSaldoPublico>>(
        `/revendedor/movimientos?porPagina=${POR_PAGINA_MOVIMIENTOS}`,
      ).then((r) => r.datos),
      leerApi<MetodoCobroPublico[]>('/revendedor/metodos-cobro').then((r) => r.datos ?? []),
      leerApi<CatalogoPublico>('/catalogo').then((r) => r.datos),
      ubicacionVisitante(),
    ]);
  const renovables =
    idsRenovar.length > 0
      ? (await leerApi<ListaRenovaciones>('/revendedor/renovaciones?filtro=todos')).datos
      : null;
  const elegidos = (renovables?.elementos ?? []).filter(
    (x) => idsRenovar.includes(x.suscripcion.id) && x.precioUsd !== null,
  );
  const renovar =
    elegidos.length > 0
      ? {
          ids: elegidos.map((x) => x.suscripcion.id),
          cantidad: elegidos.length,
          totalUsd: elegidos.reduce((t, x) => t + Number(x.precioUsd), 0).toFixed(2),
        }
      : null;
  const cabecera = (
    <CabeceraPanel
      titulo="Saldo y recargas"
      descripcion="Recarga con comprobante. El equipo lo revisa y lo suma a tu saldo en dólares."
    />
  );

  if (!resumen || !saldo || !recargas || !movimientos) {
    return (
      <>
        {cabecera}
        <SinResumen estado={resumen ? 500 : estado} />
      </>
    );
  }

  const r = resumen.revendedor;
  const tasas: Partial<Record<Moneda, string>> = Object.fromEntries(
    (catalogo?.tasas ?? []).map((t) => [t.moneda, t.valor]),
  );

  return (
    <>
      {cabecera}
      <AvisosRevendedor revendedor={r} soloEstado />
      <VistaBilletera
        datos={{
          billetera: {
            ...saldo,
            recargasEnRevision: saldo.recargasPorEstado.en_revision,
            pedidoPendiente: null,
          },
          recargas,
          movimientos,
          metodos,
          tasas,
          pedido: null,
          renovar,
          monedaSugerida: ubicacion.moneda,
          nombre: sesion.usuario.nombre,
          maxMb: MAX_MB,
          revendedor: { nombreComercial: r.nombreComercial, bloqueo: bloqueoCuenta(r) },
        }}
      />
    </>
  );
}
