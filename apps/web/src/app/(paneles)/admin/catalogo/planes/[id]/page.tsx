import {
  INFO_MONEDA,
  type Moneda,
  MONEDAS_CON_TASA,
  type PlanPublico,
  type Referencia,
  type TasaVigente,
} from '@nv/shared';
import { ArrowLeft, ArrowRight, History } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CeldaPrecio, EditarPlan, PrecioMoneda } from '@/componentes/admin/catalogo';
import { formatearTasa } from '@/componentes/admin/formato-admin';
import { Alerta } from '@/componentes/ui/alerta';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearDuracion, formatearFechaHora, formatearMonto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Detalle del plan' };

interface CambioPrecio {
  id: string;
  moneda: Moneda;
  anterior: string | null;
  nuevo: string | null;
  autor: Referencia | null;
  creadoEn: string;
}

type PlanConHistorial = PlanPublico & { historial: CambioPrecio[] };

function Precio({ valor, moneda, vacio }: { valor: string | null; moneda: Moneda; vacio: string }) {
  return valor === null ? (
    <span className="text-tinta-tenue">{vacio}</span>
  ) : (
    <span className="tabular-nums">{formatearMonto(valor, moneda)}</span>
  );
}

export default async function DetallePlan({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requerirSesion({ permiso: 'catalogo.ver' });
  const puedeGestionar = sesion.permisos.includes('catalogo.gestionar');
  const { id } = await params;
  const [{ estado, datos: plan }, { datos: tasas }] = await Promise.all([
    leerApi<PlanConHistorial>(`/catalogo/planes/${encodeURIComponent(id)}`),
    leerApi<TasaVigente[]>('/finanzas/tasas'),
  ]);
  if (estado === 404 || estado === 400 || !plan) notFound();
  const tasaDe = new Map((tasas ?? []).map((t) => [t.moneda, t]));

  const ficha: [string, string][] = [
    ['Servicio', plan.servicio.nombre],
    ['Duración', formatearDuracion(plan.duracionCantidad, plan.duracionUnidad)],
    ['Precio base', formatearMonto(plan.precioUsd, 'USD')],
    ['Renovable', plan.renovable ? 'Sí' : 'No'],
  ];

  return (
    <>
      <Link
        href="/admin/catalogo"
        className="inline-flex w-fit items-center gap-2 text-sm text-tinta-suave hover:text-tinta"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Catálogo
      </Link>

      <div className="grid gap-3">
        <p className="text-sm font-medium text-marca">{plan.servicio.nombre}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold sm:text-[1.75rem]">{plan.nombre}</h1>
          {plan.activo ? <Insignia tono="exito">Activo</Insignia> : <Insignia>Inactivo</Insignia>}
          {plan.visible ? (
            <Insignia tono="marca">Visible</Insignia>
          ) : (
            <Insignia tono="aviso">Oculto</Insignia>
          )}
          {plan.revendible && <Insignia tono="acento">Revendible</Insignia>}
        </div>
        {plan.descripcion && <p className="max-w-2xl text-tinta-suave">{plan.descripcion}</p>}
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-nv border border-borde bg-borde shadow-nv sm:grid-cols-4">
        {ficha.map(([k, v]) => (
          <div key={k} className="grid gap-0.5 bg-superficie px-5 py-4">
            <dt className="text-xs text-tinta-tenue">{k}</dt>
            <dd className="font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Precio por moneda"
          descripcion="El precio en USD es la base: el resto de monedas sigue la tasa del día, salvo que fijes un precio."
        />
        <Tabla minimo={puedeGestionar ? '44rem' : '32rem'}>
          <Encabezados
            columnas={[
              'Moneda',
              'Tasa vigente',
              { texto: 'Precio', className: 'text-right' },
              'Origen',
              ...(puedeGestionar
                ? [{ texto: 'Acciones', className: 'text-right pr-5 sm:pr-6' }]
                : []),
            ]}
          />
          <Cuerpo>
            <tr className="bg-marca-suave/40">
              <Celda primera>
                <span className="font-medium">USD</span>
                <span className="block text-xs text-tinta-tenue">{INFO_MONEDA.USD.nombre}</span>
              </Celda>
              <Celda className="text-tinta-tenue">Base</Celda>
              <Celda className="text-right font-semibold tabular-nums">
                {formatearMonto(plan.precioUsd, 'USD')}
              </Celda>
              <Celda>
                <Insignia tono="marca">Precio base</Insignia>
              </Celda>
              {puedeGestionar && (
                <Celda className="pr-5 text-right text-xs text-tinta-tenue sm:pr-6">
                  Se cambia en «Editar plan».
                </Celda>
              )}
            </tr>
            {MONEDAS_CON_TASA.map((m) => {
              const t = tasaDe.get(m);
              const valor = plan.precios[m];
              return (
                <tr key={m}>
                  <Celda primera>
                    <span className="font-medium">{m}</span>
                    <span className="block text-xs text-tinta-tenue">{INFO_MONEDA[m].nombre}</span>
                  </Celda>
                  <Celda className="text-tinta-suave tabular-nums">
                    {t ? (
                      `1 USD = ${formatearTasa(t.valor, m)}`
                    ) : (
                      <span className="text-aviso">Sin tasa registrada</span>
                    )}
                  </Celda>
                  <Celda className="text-right font-medium">
                    <CeldaPrecio moneda={m} valor={valor} />
                  </Celda>
                  <Celda>
                    {valor?.fijo ? (
                      <Insignia tono="acento">Precio fijo</Insignia>
                    ) : valor ? (
                      <Insignia>Según la tasa</Insignia>
                    ) : (
                      <Insignia tono="aviso">No se puede cobrar</Insignia>
                    )}
                  </Celda>
                  {puedeGestionar && (
                    <Celda className="pr-5 text-right sm:pr-6">
                      <PrecioMoneda planId={plan.id} moneda={m} actual={valor} />
                    </Celda>
                  )}
                </tr>
              );
            })}
          </Cuerpo>
        </Tabla>
      </Tarjeta>

      {puedeGestionar ? (
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Editar plan"
            descripcion="Los cambios valen para las facturas nuevas; las ya emitidas conservan su precio."
          />
          <EditarPlan plan={plan} />
        </Tarjeta>
      ) : (
        plan.beneficios.length > 0 && (
          <Tarjeta>
            <CabeceraTarjeta titulo="Beneficios" />
            <ul className="grid gap-2 px-5 py-5 text-sm sm:px-6">
              {plan.beneficios.map((b) => (
                <li key={b} className="flex gap-2">
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-marca"
                    aria-hidden="true"
                  />
                  {b}
                </li>
              ))}
            </ul>
          </Tarjeta>
        )
      )}

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Historial de precios"
          descripcion="Cada cambio del precio base o de un precio fijo, con quién lo hizo."
        />
        {plan.historial.length === 0 ? (
          <EstadoVacio icono={History} titulo="Sin cambios de precio todavía" />
        ) : (
          <Tabla minimo="36rem">
            <Encabezados columnas={['Moneda', 'Cambio', 'Autor', 'Fecha']} />
            <Cuerpo>
              {plan.historial.map((h) => (
                <tr key={h.id}>
                  <Celda primera className="font-medium">
                    {h.moneda}
                  </Celda>
                  <Celda>
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <Precio
                        valor={h.anterior}
                        moneda={h.moneda}
                        vacio={h.moneda === 'USD' ? 'Alta del plan' : 'Según la tasa'}
                      />
                      <ArrowRight className="size-3.5 text-tinta-tenue" aria-label="pasa a" />
                      <Precio valor={h.nuevo} moneda={h.moneda} vacio="Según la tasa" />
                    </span>
                  </Celda>
                  <Celda className="text-tinta-suave">{h.autor?.nombre ?? 'Sistema'}</Celda>
                  <Celda className="text-tinta-tenue">
                    <time dateTime={h.creadoEn}>{formatearFechaHora(h.creadoEn)}</time>
                  </Celda>
                </tr>
              ))}
            </Cuerpo>
          </Tabla>
        )}
      </Tarjeta>

      {!tasas && (
        <Alerta tono="aviso">
          No pudimos leer las tasas vigentes. Los precios mostrados son los que calculó la API.
        </Alerta>
      )}
    </>
  );
}
