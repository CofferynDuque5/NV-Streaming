import {
  formatearMonto,
  type ListaRenovaciones,
  type Pagina,
  type RecargaPublica,
  type ResumenVentas,
} from '@nv/shared';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { claseEnlace } from '@/componentes/cliente/piezas-cuenta';
import { GraficaVentas } from '@/componentes/revendedor/grafica';
import {
  AvisosRevendedor,
  CabeceraPanel,
  Caja,
  CeldaPlan,
  claseVence,
  Kpi,
  Kpis,
  LimiteDiario,
  Nota,
  PasosInicio,
  saldoBajo,
  SinResumen,
  usd,
  venceCorto,
} from '@/componentes/revendedor/panel';
import { BotonEnlace, clasesBoton } from '@/componentes/ui/boton';
import { leerApi } from '@/lib/api-servidor';
import { bloqueoVenta, leerResumenRevendedor } from '@/lib/panel-revendedor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Panel de revendedor' };

export default async function PanelRevendedor() {
  const sesion = await requerirSesion({ roles: ['revendedor'] });
  const [{ estado, datos: r }, v30, v7, renovar, recargas] = await Promise.all([
    leerResumenRevendedor(),
    leerApi<ResumenVentas>('/revendedor/ventas/resumen?periodo=30').then((x) => x.datos),
    leerApi<ResumenVentas>('/revendedor/ventas/resumen?periodo=7').then((x) => x.datos),
    leerApi<ListaRenovaciones>('/revendedor/renovaciones?filtro=urgentes').then((x) => x.datos),
    leerApi<Pagina<RecargaPublica>>('/revendedor/recargas?porPagina=1').then((x) => x.datos),
  ]);
  const nombre = sesion.usuario.nombre.split(' ')[0];

  if (!r) {
    return (
      <>
        <CabeceraPanel titulo={`Hola, ${nombre}`} />
        <SinResumen estado={estado} />
      </>
    );
  }

  const d = r.revendedor;
  const bloqueo = bloqueoVenta(d);
  const t30 = v30?.totales;
  const urgentes = renovar?.totales.urgentes;
  const nuevo = d.compras === 0;

  return (
    <>
      <CabeceraPanel
        titulo={d.nombreComercial}
        descripcion={`Hola, ${nombre} · ${d.nivel ? `nivel ${d.nivel.nombre}` : 'nivel por asignar'}${d.limiteDiarioCompras !== null ? ` · hasta ${d.limiteDiarioCompras} ventas al día` : ''}`}
        accion={
          <>
            {bloqueo ? (
              <span
                aria-disabled="true"
                title={bloqueo}
                className={clasesBoton('primario', 'lg', 'px-3')}
              >
                <Plus className="size-4" aria-hidden="true" /> Nueva venta
              </span>
            ) : (
              <BotonEnlace href="/revendedor/catalogo" tamano="lg" className="px-3">
                <Plus className="size-4" aria-hidden="true" /> Nueva venta
              </BotonEnlace>
            )}
            <BotonEnlace
              href="/revendedor/saldo"
              variante="secundario"
              tamano="lg"
              className="px-3"
            >
              Recargar saldo
            </BotonEnlace>
          </>
        }
      />
      <AvisosRevendedor revendedor={d} ultimaRecarga={recargas?.elementos[0] ?? null} />

      <Kpis>
        <Kpi
          titulo="Saldo disponible"
          valor={usd(d.saldoUsd)}
          detalle={r.saldoVes ? `≈ ${formatearMonto(r.saldoVes, 'VES')}` : undefined}
          tono={saldoBajo(d) ? 'aviso' : undefined}
          accion={
            <Link href="/revendedor/saldo" className={claseEnlace}>
              Recargar
            </Link>
          }
        />
        <Kpi
          titulo="Ventas · 30 días"
          valor={t30 ? t30.ventas : '—'}
          detalle={v7 ? `${v7.totales.ventas} en los últimos 7 días` : undefined}
        />
        <Kpi
          titulo="Ganancia · 30 días"
          valor={t30 ? usd(t30.gananciaUsd) : '—'}
          detalle={t30 ? `Estimada, sobre ${usd(t30.pagadoUsd)} pagados` : undefined}
          tono="ok"
        />
        <Kpi
          titulo="Clientes"
          valor={d.clientes}
          detalle={`${d.suscripcionesActivas} ${d.suscripcionesActivas === 1 ? 'servicio activo' : 'servicios activos'}`}
        />
      </Kpis>

      {nuevo && <PasosInicio />}

      {v30 ? (
        <GraficaVentas dias={v30.dias} />
      ) : (
        <Nota>No pudimos cargar la gráfica de ventas. Recarga la página.</Nota>
      )}

      <div className="grid gap-4 min-[68.75rem]:grid-cols-2">
        <Caja
          id="titulo-renovar"
          titulo="Por renovar"
          nota={
            urgentes && urgentes.cantidad > 0
              ? `Vencidos y los que vencen en 7 días · ${urgentes.cantidad} por ${usd(urgentes.totalUsd)}`
              : 'Nada vencido ni por vencer esta semana.'
          }
          accion={
            urgentes && urgentes.cantidad > 0 ? (
              <Link href="/revendedor/renovaciones" className={claseEnlace}>
                Renovar en lote
              </Link>
            ) : undefined
          }
        >
          {renovar && renovar.elementos.length > 0 && (
            <table className="t-tab">
              <thead>
                <tr>
                  <th scope="col">Cliente y servicio</th>
                  <th scope="col">Vence</th>
                  <th scope="col" className="num">
                    Precio
                  </th>
                </tr>
              </thead>
              <tbody>
                {renovar.elementos.slice(0, 6).map(({ suscripcion: s, precioUsd }) => {
                  const [texto, tono] = venceCorto(s);
                  return (
                    <tr key={s.id}>
                      <td data-l="Cliente">
                        <CeldaPlan
                          servicio={{
                            slug: s.plan.servicioSlug,
                            categoria: s.plan.categoria,
                            nombre: s.plan.servicio,
                          }}
                          titulo={s.cliente.nombre}
                          detalle={`${s.plan.servicio} ${s.plan.nombre}`}
                        />
                      </td>
                      <td data-l="Vence">
                        <span className={claseVence(tono)}>{texto}</span>
                      </td>
                      <td data-l="Precio" className="num">
                        {usd(precioUsd!)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Caja>

        <Caja
          id="titulo-top"
          titulo="Lo más vendido"
          nota="Últimos 30 días"
          accion={
            <Link href="/revendedor/ventas" className={claseEnlace}>
              Ver ventas
            </Link>
          }
        >
          {v30 && v30.masVendidos.length > 0 ? (
            <div className="overflow-x-auto max-[43.75rem]:overflow-visible">
              <table className="t-tab">
                <thead>
                  <tr>
                    <th scope="col">Plan</th>
                    <th scope="col" className="num">
                      Ventas
                    </th>
                    <th scope="col" className="num">
                      Pagaste
                    </th>
                    <th scope="col" className="num">
                      Ganancia est.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {v30.masVendidos.map((x) => (
                    <tr key={x.plan.id}>
                      <td data-l="Plan">
                        <CeldaPlan
                          servicio={{
                            slug: x.plan.servicioSlug,
                            categoria: x.plan.categoria,
                            nombre: x.plan.servicio,
                          }}
                          titulo={x.plan.servicio}
                          detalle={x.plan.nombre}
                        />
                      </td>
                      <td data-l="Ventas" className="num">
                        {x.ventas}
                      </td>
                      <td data-l="Pagaste" className="num">
                        {usd(x.pagadoUsd)}
                      </td>
                      <td data-l="Ganancia est." className="num text-[#4ade80]">
                        {usd(x.gananciaUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mx-4 mb-4 rounded-2xl border border-dashed border-borde-fuerte px-4 py-6 text-center text-sm text-tinta-suave">
              Cuando vendas, aquí verás tus planes estrella.
            </p>
          )}
        </Caja>
      </div>

      <LimiteDiario hoy={r.comprasHoy} limite={d.limiteDiarioCompras} />
      <Nota>
        La ganancia es una estimación: precio al público menos lo que pagaste. Tú decides cuánto le
        cobras a cada cliente.
      </Nota>
    </>
  );
}
