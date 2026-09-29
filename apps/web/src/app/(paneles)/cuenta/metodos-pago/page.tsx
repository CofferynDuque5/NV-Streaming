import type { MetodoAutorizadoPublico, ResumenCliente } from '@nv/shared';
import { ChevronDown, WalletCards } from 'lucide-react';
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
import { Alerta } from '@/componentes/ui/alerta';
import { leerApi } from '@/lib/api-servidor';
import { formatearFechaHora } from '@/lib/formato';
import { leerPanelCliente } from '@/lib/panel-cliente';
import { nombrePasarela } from '@/lib/pagos-en-linea';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Métodos guardados' };

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
      titulo="Métodos de pago guardados"
      descripcion="Solo para cobros automáticos que tú autorizas. Los pagos con comprobante no se guardan."
    />
  );

  if (panel?.revendedor) {
    return (
      <>
        {cabecera}
        <Vacio>Tu revendedor gestiona tus pagos, así que no puedes guardar métodos.</Vacio>
      </>
    );
  }

  const [{ datos }, { datos: resumen }] = await Promise.all([
    leerApi<MetodoAutorizadoPublico[]>('/mi/metodos-autorizados'),
    leerApi<ResumenCliente>('/mi/resumen'),
  ]);
  const servicios: Servicios = new Map((resumen?.suscripciones ?? []).map((s) => [s.id, s]));
  const activos = datos?.filter((m) => m.estado === 'activo') ?? [];
  const historial = datos?.filter((m) => m.estado !== 'activo') ?? [];

  return (
    <>
      {cabecera}
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
