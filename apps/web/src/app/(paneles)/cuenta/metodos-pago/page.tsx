import {
  INFO_MONEDA,
  type MetodoAutorizadoPublico,
  type MetodoCobroPublico,
  type ResumenCliente,
} from '@nv/shared';
import {
  BadgeCheck,
  ChevronDown,
  Clock,
  Landmark,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  Zap,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { RevocarMetodoCliente } from '@/componentes/cliente/metodos-pago';
import { PildoraEstado, type TonoEstado } from '@/componentes/cliente/pago';
import {
  CabeceraCuenta,
  claseLista,
  fechaLarga,
  MiniaturaServicio,
  Vacio,
} from '@/componentes/cliente/piezas-cuenta';
import { Bandera } from '@/componentes/tienda/iconos';
import { Alerta } from '@/componentes/ui/alerta';
import { leerApi } from '@/lib/api-servidor';
import { formatearFechaHora } from '@/lib/formato';
import { leerPanelCliente } from '@/lib/panel-cliente';
import { nombrePasarela } from '@/lib/pagos-en-linea';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Métodos de pago' };

const ESTADO: Record<MetodoAutorizadoPublico['estado'], [string, TonoEstado]> = {
  activo: ['Autorizado', 'exito'],
  revocado: ['Revocado', 'neutro'],
  invalido: ['No válido', 'peligro'],
};

type Servicios = Map<string, ResumenCliente['suscripciones'][number]>;

export default async function MetodosGuardados() {
  await requerirSesion({ roles: ['cliente'] });
  const panel = await leerPanelCliente();
  const cabecera = (
    <CabeceraCuenta
      titulo="Métodos de pago"
      descripcion="Cómo puedes pagarnos y los métodos que guardaste para tus renovaciones automáticas."
    />
  );

  if (panel?.revendedor) {
    return (
      <>
        {cabecera}
        <Vacio>
          Como cliente de {panel.revendedor.nombre} no puedes guardar métodos para cobros
          automáticos. Paga tus compras de la tienda con tu billetera o desde cada factura.
        </Vacio>
      </>
    );
  }

  const [{ datos }, { datos: resumen }, { datos: disponibles }] = await Promise.all([
    leerApi<MetodoAutorizadoPublico[]>('/mi/metodos-autorizados'),
    leerApi<ResumenCliente>('/mi/resumen'),
    leerApi<MetodoCobroPublico[]>('/mi/billetera/metodos-cobro'),
  ]);
  const formas = (disponibles ?? []).filter((m) => m.activo).sort((a, b) => a.orden - b.orden);
  const servicios: Servicios = new Map((resumen?.suscripciones ?? []).map((s) => [s.id, s]));
  const activos = datos?.filter((m) => m.estado === 'activo') ?? [];
  const historial = datos?.filter((m) => m.estado !== 'activo') ?? [];

  return (
    <>
      {cabecera}
      <FormasDePago formas={formas} guardados={activos.length} />

      <section aria-labelledby="titulo-guardados" className="grid gap-3.5">
        <div className="grid gap-1">
          <h2 id="titulo-guardados" className="flex items-center gap-2 text-xl">
            <RefreshCw className="size-5 text-violeta" aria-hidden="true" />
            Cobros automáticos
          </h2>
          <p className="text-sm text-tinta-suave">
            Métodos que autorizaste para renovar tus servicios solos. Los pagos con comprobante no
            se guardan.
          </p>
        </div>
      {!datos ? (
        <Alerta tono="peligro">
          No pudimos cargar tus métodos de pago. Recarga la página en un momento.
        </Alerta>
      ) : activos.length === 0 ? (
        <Vacio
          icono={<WalletCards className="size-5" aria-hidden="true" />}
          titulo="No tienes métodos guardados"
        >
          Cuando pagues una factura en línea (en dólares, euros, pesos o soles), marca «Guardar este
          método para cobros automáticos» y aparecerá aquí.
        </Vacio>
      ) : (
        <ul className="grid gap-3.5">
          {activos.map((m) => (
            <Metodo key={m.id} m={m} servicios={servicios} />
          ))}
        </ul>
      )}

      </section>

      {historial.length > 0 && (
        <section aria-labelledby="titulo-revocados" className="grid gap-3.5">
          <h2 id="titulo-revocados" className="text-lg">
            Revocados o no válidos
          </h2>
          <ul className="grid gap-3.5">
            {historial.map((m) => (
              <Metodo key={m.id} m={m} servicios={servicios} />
            ))}
          </ul>
        </section>
      )}
      <p className="text-[0.8rem] text-tinta-tenue">
        Los datos de tu tarjeta o cuenta quedan en la pasarela: NV Streaming solo guarda una
        referencia para cobrar lo que autorizaste. Los pagos en bolívares no tienen cobro
        automático: se pagan con comprobante o con tu saldo.
      </p>
    </>
  );
}

/**
 * Las formas de pago activas de la tienda, agrupadas por moneda: con
 * comprobante (las revisa el equipo) o en línea (se confirman solas).
 */
function FormasDePago({
  formas,
  guardados,
}: {
  formas: MetodoCobroPublico[];
  guardados: number;
}) {
  const enLinea = formas.filter((f) => f.tipo === 'pasarela').length;
  return (
    <section aria-labelledby="titulo-formas" className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icono: Landmark, valor: formas.length, texto: 'formas de pago activas' },
          { icono: Zap, valor: enLinea, texto: 'se confirman al instante' },
          { icono: ShieldCheck, valor: guardados, texto: 'cobros automáticos tuyos' },
        ].map(({ icono: Icono, valor, texto }) => (
          <div
            key={texto}
            className="flex items-center gap-3 rounded-2xl border border-borde bg-[linear-gradient(135deg,rgb(79_141_255/0.12),transparent_60%),rgb(10_14_32/0.6)] p-4"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-marca/15 text-cian">
              <Icono className="size-5" aria-hidden="true" />
            </span>
            <span className="grid">
              <b className="font-titulo text-2xl leading-none tabular-nums">{valor}</b>
              <span className="text-sm text-tinta-suave">{texto}</span>
            </span>
          </div>
        ))}
      </div>

      <h2 id="titulo-formas" className="flex items-center gap-2 text-xl">
        <Landmark className="size-5 text-cian" aria-hidden="true" />
        Cómo puedes pagar
      </h2>
      {formas.length === 0 ? (
        <Vacio>El equipo todavía no publicó formas de pago. Escríbenos por Soporte.</Vacio>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {formas.map((f) => (
              <li
                key={f.id}
                className="grid content-start gap-3 rounded-[1.25rem] border border-borde bg-[rgb(10_14_32/0.6)] p-4 transition-colors hover:border-borde-fuerte"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
                      <Bandera moneda={f.moneda} grande decorativa />
                    </span>
                    <span className="grid min-w-0">
                  <b className="truncate text-base">{f.nombre}</b>
                  <span className="text-xs text-tinta-tenue">
                    {f.moneda === 'USD' ? 'Dólares' : INFO_MONEDA[f.moneda].nombre} · {f.moneda}
                  </span>
                </span>
                  </div>
                  {f.tipo === 'pasarela' ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-exito/15 px-2.5 py-1 text-xs font-semibold text-exito">
                      <Zap className="size-3" aria-hidden="true" /> Al instante
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-cian/10 px-2.5 py-1 text-xs font-semibold text-cian">
                      <Clock className="size-3" aria-hidden="true" /> Con comprobante
                    </span>
                  )}
                </div>
                <p className="flex items-start gap-1.5 text-sm text-tinta-suave">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-marca" aria-hidden="true" />
                  {f.tipo === 'pasarela'
                    ? 'Pagas en línea y tu servicio se activa solo.'
                    : f.requiereReferencia
                      ? 'Pagas, subes el comprobante con la referencia y el equipo lo confirma.'
                      : 'Pagas y subes el comprobante; el equipo lo confirma.'}
                </p>
                {f.instrucciones && f.tipo !== 'pasarela' && (
                  <details className="group text-sm">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-cian [&::-webkit-details-marker]:hidden">
                      Ver datos para pagar
                      <ChevronDown
                        className="size-4 transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </summary>
                    <p className="mt-2 rounded-xl border border-borde bg-white/[0.03] px-3 py-2.5 whitespace-pre-line text-tinta-suave">
                      {f.instrucciones}
                    </p>
                  </details>
                )}
              </li>
          ))}
        </ul>
      )}
      <p className="text-[0.8rem] text-tinta-tenue">
        Paga desde cada factura o recarga tu{' '}
        <Link href="/cuenta/billetera" className="font-semibold text-cian hover:underline">
          billetera
        </Link>{' '}
        y paga todo con tu saldo.
      </p>
    </section>
  );
}

function Metodo({ m, servicios }: { m: MetodoAutorizadoPublico; servicios: Servicios }) {
  const [estado, tono] = ESTADO[m.estado];
  return (
    <li className="grid min-w-0 gap-3 rounded-[1.25rem] border border-borde bg-[rgb(10_14_32/0.6)] p-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <span
          className="orbe orbe-sm size-[2.875rem] after:hidden"
          style={{ '--c': '#4f8dff' } as CSSProperties}
          aria-hidden="true"
        >
          <WalletCards className="size-5" />
        </span>
        <div className="grid min-w-0 gap-0.5">
          <small className="truncate text-xs text-tinta-suave">
            {nombrePasarela(m.pasarela)} · {m.moneda} · guardado el {fechaLarga(m.autorizadoEn)}
          </small>
          <h3 className="text-[1.0625rem] leading-tight break-words">{m.descripcion}</h3>
        </div>
        <span className="col-start-2 -mt-1 sm:col-start-auto sm:mt-0 sm:self-start">
          <PildoraEstado texto={estado} tono={tono} />
        </span>
      </div>

      {m.revocadoEn && (
        <p className="text-[0.84rem] text-tinta-tenue">
          {m.estado === 'revocado' ? 'Revocado' : 'Desactivado'} el{' '}
          {formatearFechaHora(m.revocadoEn)}
          {m.motivoEstado ? ` · ${m.motivoEstado}` : ''}
        </p>
      )}
      {!m.revocadoEn && m.motivoEstado && (
        <p className="text-[0.84rem] text-tinta-tenue">{m.motivoEstado}</p>
      )}

      {m.estado === 'activo' &&
        (m.suscripciones.length === 0 ? (
          <p className="text-[0.84rem] text-tinta-suave">
            Todavía no cobra ninguna renovación. Actívalo en un servicio desde{' '}
            <Link href="/cuenta" className="font-semibold text-cian hover:underline">
              Mis servicios
            </Link>
            .
          </p>
        ) : (
          <ul className={claseLista} aria-label="Renovaciones que cobra">
            {m.suscripciones.map((s) => {
              const sus = servicios.get(s.id);
              return (
                <li key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  {sus && (
                    <MiniaturaServicio
                      slug={sus.plan.servicioSlug}
                      categoria={sus.plan.categoria}
                      nombre={sus.plan.servicio}
                      className="size-[2.125rem] rounded-[0.625rem]"
                    />
                  )}
                  <span className="grid min-w-0 gap-0.5">
                    <b className="truncate text-[0.9rem] font-semibold">
                      {sus ? `${sus.plan.servicio} · ${s.plan}` : s.plan}
                    </b>
                    {s.venceEn && (
                      <small className="text-[0.8rem] text-tinta-suave">
                        Próximo cobro el {fechaLarga(s.venceEn)}
                      </small>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ))}

      <details className="group text-[0.84rem] text-tinta-suave">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-cian [&::-webkit-details-marker]:hidden">
          Texto que aceptaste
          <ChevronDown
            className="size-4 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="mt-2 grid gap-1.5 rounded-xl border border-borde bg-white/[0.03] px-3 py-2.5">
          <blockquote className="leading-relaxed break-words">{m.textoAceptado}</blockquote>
          <p className="text-xs text-tinta-tenue">
            Aceptado el {formatearFechaHora(m.autorizadoEn)} · versión {m.versionTexto}
          </p>
        </div>
      </details>

      {m.estado === 'activo' && (
        <RevocarMetodoCliente
          id={m.id}
          descripcion={m.descripcion}
          suscripciones={m.suscripciones.length}
        />
      )}
    </li>
  );
}
