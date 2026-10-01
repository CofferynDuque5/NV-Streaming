import type { ClienteCarteraDetalle, PaginaCartera } from '@nv/shared';
import { Package, Star } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { claseEnlace, Vacio } from '@/componentes/cliente/piezas-cuenta';
import {
  AvisosRevendedor,
  CabeceraPanel,
  NivelChip,
  Nota,
  SinResumen,
  usd,
} from '@/componentes/revendedor/panel';
import { NuevaVenta } from '@/componentes/revendedor/venta';
import { Alerta } from '@/componentes/ui/alerta';
import { leerApi } from '@/lib/api-servidor';
import { bloqueoVenta, leerCatalogoMayorista, leerResumenRevendedor } from '@/lib/panel-revendedor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Nueva venta' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NuevaVentaPagina({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[]; cliente?: string | string[] }>;
}) {
  await requerirSesion({ roles: ['revendedor'] });
  const { plan: pedido, cliente: deFicha } = await searchParams;
  const clienteId = typeof deFicha === 'string' && UUID.test(deFicha) ? deFicha : null;
  const [{ estado, datos: resumen }, catalogo, cartera, elegido] = await Promise.all([
    leerResumenRevendedor(),
    leerCatalogoMayorista(),
    leerApi<PaginaCartera>('/revendedor/clientes?porPagina=100&orden=nombre').then((x) => x.datos),
    clienteId
      ? leerApi<ClienteCarteraDetalle>(`/revendedor/clientes/${clienteId}`).then((x) => x.datos)
      : null,
  ]);

  if (!resumen || !catalogo) {
    return (
      <>
        <CabeceraPanel titulo="Nueva venta" />
        <SinResumen estado={resumen ? 500 : estado} />
      </>
    );
  }

  const r = resumen.revendedor;
  if (!catalogo.nivel) {
    return (
      <>
        <CabeceraPanel titulo="Nueva venta" descripcion="Tus precios dependen de tu nivel." />
        <AvisosRevendedor revendedor={r} soloEstado />
        <Vacio
          icono={<Star className="size-5" aria-hidden="true" />}
          color="#f59e0b"
          titulo="Aún no tienes nivel"
        >
          Cuando el equipo te asigne tu nivel verás aquí tus precios y podrás vender.
        </Vacio>
      </>
    );
  }

  const planPedido = typeof pedido === 'string' ? pedido : null;
  const planElegido = catalogo.planes.find((p) => p.id === planPedido) ?? null;
  const clientes = (cartera?.elementos ?? []).map((c) => ({ id: c.id, nombre: c.nombre }));
  // El cliente elegido desde su ficha puede no estar entre los 100 primeros.
  if (elegido && !clientes.some((c) => c.id === elegido.id)) {
    clientes.unshift({ id: elegido.id, nombre: elegido.nombre });
  }
  const limite = r.limiteDiarioCompras;

  return (
    <>
      <CabeceraPanel
        titulo="Nueva venta"
        descripcion={`Precios de nivel ${catalogo.nivel.nombre}. Elige el plan y para quién; se activa al instante.`}
      />
      <AvisosRevendedor revendedor={r} soloEstado />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 rounded-[1.125rem] border border-borde-fuerte bg-[rgb(8_11_26/0.7)] px-4 py-3">
        <div className="grid gap-0.5">
          <span className="text-[0.78rem] text-tinta-suave">Saldo</span>
          <b className="font-titulo text-lg font-extrabold tabular-nums">{usd(r.saldoUsd)}</b>
        </div>
        <div className="grid gap-1">
          <span className="text-[0.78rem] text-tinta-suave">Nivel</span>
          <NivelChip nivel={catalogo.nivel} />
        </div>
        <div className="grid gap-0.5">
          <span className="text-[0.78rem] text-tinta-suave">Ventas de hoy</span>
          <b className="font-titulo text-lg font-extrabold tabular-nums">
            {limite === null ? resumen.comprasHoy : `${resumen.comprasHoy} de ${limite}`}
          </b>
        </div>
        <Link href="/revendedor/saldo" className={`${claseEnlace} sm:ml-auto`}>
          Recargar saldo
        </Link>
      </div>

      {planPedido && !planElegido && (
        <Alerta tono="aviso">Ese plan no está disponible para tu nivel. Elige otro.</Alerta>
      )}

      {catalogo.planes.length === 0 ? (
        <Vacio
          icono={<Package className="size-5" aria-hidden="true" />}
          titulo="No hay planes para tu nivel"
        >
          El equipo de NV todavía no publicó precios mayoristas para tu nivel.
        </Vacio>
      ) : (
        <NuevaVenta
          planes={catalogo.planes}
          nivel={catalogo.nivel.nombre}
          clientes={clientes}
          saldoUsd={r.saldoUsd}
          bloqueo={bloqueoVenta(r)}
          planInicial={planElegido?.id ?? null}
          clienteInicial={elegido ? { id: elegido.id, nombre: elegido.nombre } : null}
        />
      )}
      <Nota>
        El margen es la diferencia con el precio al público de NV: tú decides cuánto le cobras a tu
        cliente. Siempre se activa en la cuenta propia de tu cliente; nunca entregamos usuarios ni
        contraseñas.
      </Nota>
    </>
  );
}
