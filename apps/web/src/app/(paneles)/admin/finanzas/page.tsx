import {
  INFO_MONEDA,
  type MetodoCobroPublico,
  MONEDAS_CON_TASA,
  type TasaVigente,
} from '@nv/shared';
import clsx from 'clsx';
import type { Metadata } from 'next';
import { HistorialTasa, ListaMetodos, RegistrarTasa } from '@/componentes/admin/finanzas';
import { esDeHoy, formatearTasa, origenAutomatico } from '@/componentes/admin/formato-admin';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { haceCuanto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Monedas y cobro' };

export default async function Finanzas() {
  await requerirSesion({ permiso: 'finanzas.configurar' });
  const [{ datos: tasas }, { datos: metodos }] = await Promise.all([
    leerApi<TasaVigente[]>('/finanzas/tasas'),
    leerApi<MetodoCobroPublico[]>('/finanzas/metodos-cobro'),
  ]);
  const tasaDe = new Map((tasas ?? []).map((t) => [t.moneda, t]));
  const faltan = tasas ? MONEDAS_CON_TASA.filter((m) => !tasaDe.has(m)) : [];

  return (
    <>
      <CabeceraPagina
        titulo="Monedas y cobro"
        descripcion="Los precios se fijan en USD. Aquí registras la tasa del día de cada moneda y las formas en que los clientes pueden pagarte."
      />

      <section aria-labelledby="titulo-tasas" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="titulo-tasas" className="text-lg font-semibold">
            Tasas de cambio
          </h2>
          <p className="text-sm text-tinta-suave">
            Cada nueva tasa se aplica al instante a los precios del catálogo y a las facturas que se
            emitan desde ahora. Las facturas ya emitidas conservan su tasa.
          </p>
        </div>

        {!tasas && (
          <Alerta tono="peligro">No pudimos cargar las tasas vigentes. Recarga la página.</Alerta>
        )}
        {faltan.length > 0 && (
          <Alerta tono="aviso" titulo={`Falta la tasa de ${faltan.join(', ')}`}>
            Mientras falte, los planes sin precio fijo en esa moneda no se pueden facturar en ella.
          </Alerta>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {MONEDAS_CON_TASA.map((m) => {
            const t = tasaDe.get(m);
            const deHoy = t ? esDeHoy(t.vigenteDesde) : false;
            return (
              <Tarjeta
                key={m}
                className={clsx('flex flex-col', !t && 'border-aviso/40')}
                aria-labelledby={`tasa-${m}`}
              >
                <div className="flex items-start justify-between gap-3 px-5 pt-5">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid size-10 place-items-center rounded-xl border border-borde bg-hundida font-mono text-xs font-semibold text-marca"
                      aria-hidden="true"
                    >
                      {m}
                    </span>
                    <div className="grid">
                      <h3 id={`tasa-${m}`} className="text-sm font-semibold">
                        {INFO_MONEDA[m].nombre}
                      </h3>
                      <span className="text-xs text-tinta-tenue">{m}</span>
                    </div>
                  </div>
                  {!t ? (
                    <Insignia tono="aviso">Sin tasa</Insignia>
                  ) : deHoy ? (
                    <Insignia tono="exito">De hoy</Insignia>
                  ) : (
                    <Insignia tono="aviso">No es de hoy</Insignia>
                  )}
                </div>
                <div className="grid gap-1 px-5 pt-4 pb-5">
                  {t ? (
                    <>
                      <p className="font-titulo text-2xl font-semibold tabular-nums">
                        <span className="text-base font-medium text-tinta-tenue">1 USD = </span>
                        {formatearTasa(t.valor, m)}
                      </p>
                      <p className="text-xs text-tinta-tenue">
                        {origenAutomatico(t) ?? `Manual · ${t.autor?.nombre ?? 'Sistema'}`} ·{' '}
                        <time dateTime={t.vigenteDesde}>{haceCuanto(t.vigenteDesde)}</time>
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-tinta-suave">
                      Todavía no se ha registrado ninguna tasa para esta moneda.
                    </p>
                  )}
                </div>
                <div className="mt-auto grid gap-3 border-t border-borde bg-hundida/40 px-5 py-4">
                  <RegistrarTasa moneda={m} actual={t?.valor} />
                  <HistorialTasa moneda={m} />
                </div>
              </Tarjeta>
            );
          })}
        </div>
      </section>

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Métodos de cobro"
          descripcion="Cuentas y billeteras donde los clientes pagan, agrupadas por moneda. Solo los activos se ofrecen al pagar."
        />
        <div className="px-5 pt-4 sm:px-6">
          <Alerta tono="aviso">
            No escribas aquí contraseñas ni datos que no deba ver el cliente: estas instrucciones se
            muestran al pagar.
          </Alerta>
        </div>
        {metodos ? (
          <ListaMetodos metodos={metodos} />
        ) : (
          <div className="p-5 sm:p-6">
            <Alerta tono="peligro">
              No pudimos cargar los métodos de cobro. Recarga la página.
            </Alerta>
          </div>
        )}
      </Tarjeta>
    </>
  );
}
