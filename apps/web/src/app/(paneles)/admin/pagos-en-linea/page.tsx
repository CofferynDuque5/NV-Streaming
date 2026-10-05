import {
  ESTADOS_EVENTO_PASARELA,
  type EstadoPasarela,
  type EventoPasarelaResumen,
  filtroEventosPasarelaSchema,
  INFO_MONEDA,
  type Pagina,
  PASARELAS,
} from '@nv/shared';
import clsx from 'clsx';
import { Globe, Inbox, KeyRound, Repeat, Webhook } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TablaCobrosAutomaticos } from '@/componentes/admin/cobros-automaticos';
import { CopiarTexto, ReprocesarEvento } from '@/componentes/admin/pagos-en-linea';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { clasesEntrada } from '@/componentes/ui/clases';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, Fila, Tabla } from '@/componentes/ui/tabla';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { formatearFechaHora, haceCuanto } from '@/lib/formato';
import { AYUDA_PASARELA, ESTADO_EVENTO_PASARELA, nombrePasarela } from '@/lib/pagos-en-linea';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Pagos en línea' };

type Vista = 'pasarelas' | 'cobros' | 'eventos';
type Crudo = Record<string, string | string[] | undefined>;
const RUTA = '/admin/pagos-en-linea';

export default async function PagosEnLinea({ searchParams }: { searchParams: Promise<Crudo> }) {
  await requerirSesion({ permiso: 'pasarelas.configurar' });
  const crudo = await searchParams;
  const vista: Vista =
    crudo.vista === 'cobros' || crudo.vista === 'eventos' ? crudo.vista : 'pasarelas';

  return (
    <>
      <CabeceraPagina
        titulo="Pagos en línea"
        descripcion="Pasarelas de pago, cobros automáticos que autorizaron los clientes y avisos que envían las pasarelas. Los bolívares siguen con pago manual."
      />
      <Pestanas vista={vista} />
      {vista === 'pasarelas' && <Pasarelas />}
      {vista === 'cobros' && (
        <TablaCobrosAutomaticos crudo={crudo} ruta={RUTA} fijos={{ vista: 'cobros' }} />
      )}
      {vista === 'eventos' && <Eventos crudo={crudo} />}
    </>
  );
}

function Pestanas({ vista }: { vista: Vista }) {
  const pestanas: { id: Vista; texto: string; icono: typeof Globe }[] = [
    { id: 'pasarelas', texto: 'Pasarelas', icono: Globe },
    { id: 'cobros', texto: 'Cobros automáticos', icono: Repeat },
    { id: 'eventos', texto: 'Avisos de pasarelas', icono: Webhook },
  ];
  return (
    <nav aria-label="Vistas de pagos en línea" className="-mt-2 max-w-full overflow-x-auto">
      <ul className="inline-flex gap-1 rounded-xl border border-borde bg-hundida p-1">
        {pestanas.map(({ id, texto, icono: Icono }) => {
          const activa = vista === id;
          return (
            <li key={id}>
              <Link
                href={`${RUTA}?vista=${id}`}
                aria-current={activa ? 'page' : undefined}
                className={clsx(
                  'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
                  activa
                    ? 'bg-superficie text-tinta shadow-nv'
                    : 'text-tinta-suave hover:bg-superficie/60 hover:text-tinta',
                )}
              >
                <Icono className={clsx('size-4', activa && 'text-marca')} aria-hidden="true" />
                {texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ── Pasarelas ────────────────────────────────────────────────────────────────

async function Pasarelas() {
  const { datos } = await leerApi<EstadoPasarela[]>('/pasarelas');
  if (!datos) {
    return (
      <Alerta tono="peligro" titulo="No pudimos cargar el estado de las pasarelas">
        Recarga la página. Si sigue fallando, revisa que la API esté en marcha.
      </Alerta>
    );
  }
  // Las pasarelas que la API no devuelve (p. ej. la de pruebas en producción) no se muestran.
  const orden = (p: string) => PASARELAS.indexOf(p as (typeof PASARELAS)[number]);
  const lista = [...datos].sort((a, b) => orden(a.pasarela) - orden(b.pasarela));

  return (
    <>
      <Alerta tono="info" titulo="Las credenciales nunca se escriben en el panel">
        Cada pasarela se conecta con variables de entorno del servidor de la API; al reiniciarla,
        aparece aquí como configurada. Después crea un método de cobro de tipo «Pago en línea» en{' '}
        <Link href="/admin/finanzas" className="font-medium text-marca hover:underline">
          Monedas y cobro
        </Link>{' '}
        para ofrecerla a los clientes.
      </Alerta>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {lista.map((p) => {
          const ayuda = AYUDA_PASARELA[p.pasarela];
          return (
            <Tarjeta
              key={p.pasarela}
              className="flex min-w-0 flex-col"
              aria-labelledby={`pasarela-${p.pasarela}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
                <div className="flex items-center gap-3">
                  <span
                    className="grid size-10 place-items-center rounded-xl border border-borde bg-hundida text-marca"
                    aria-hidden="true"
                  >
                    <Globe className="size-5" />
                  </span>
                  <h2 id={`pasarela-${p.pasarela}`} className="text-base font-semibold">
                    {p.nombre || nombrePasarela(p.pasarela)}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.configurada ? (
                    <Insignia tono="exito">Configurada</Insignia>
                  ) : (
                    <Insignia tono="aviso">Sin configurar</Insignia>
                  )}
                  {p.modo === 'produccion' ? (
                    <Insignia tono="marca">Producción</Insignia>
                  ) : (
                    <Insignia>Pruebas</Insignia>
                  )}
                </div>
              </div>
              <dl className="grid gap-3 px-5 pt-4 pb-5 text-sm">
                <div className="grid gap-0.5">
                  <dt className="text-xs text-tinta-tenue">Monedas</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {p.monedas.map((m) => (
                      <span
                        key={m}
                        title={INFO_MONEDA[m].nombre}
                        className="rounded-md border border-borde bg-hundida px-1.5 py-0.5 font-mono text-xs"
                      >
                        {m}
                      </span>
                    ))}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-tinta-tenue">Cobro automático</dt>
                  <dd>
                    {p.admiteCobroRecurrente
                      ? 'Sí: puede guardar el método si el cliente lo autoriza.'
                      : 'No: solo pagos únicos.'}
                  </dd>
                </div>
                <div className="grid min-w-0 gap-1">
                  <dt className="text-xs text-tinta-tenue">URL de avisos (webhook)</dt>
                  <dd className="min-w-0">
                    <CopiarTexto
                      texto={p.urlWebhook}
                      etiqueta={`la URL de avisos de ${p.nombre}`}
                    />
                  </dd>
                </div>
              </dl>
              <div className="mt-auto grid gap-2 border-t border-borde bg-hundida/40 px-5 py-4 text-sm">
                <p className="flex items-center gap-1.5 font-medium">
                  <KeyRound className="size-4 text-marca" aria-hidden="true" /> Cómo conectarla
                </p>
                <p className="text-tinta-suave">{ayuda.pasos}</p>
                <ul className="flex flex-wrap gap-1.5" aria-label="Variables de entorno">
                  {ayuda.variables.map((v) => (
                    <li
                      key={v}
                      className="rounded-md border border-borde bg-superficie px-1.5 py-0.5 font-mono text-[0.7rem] break-all"
                    >
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            </Tarjeta>
          );
        })}
      </div>
    </>
  );
}

// ── Avisos de las pasarelas ──────────────────────────────────────────────────

async function Eventos({ crudo }: { crudo: Crudo }) {
  const { filtro, parametros } = leerFiltro(filtroEventosPasarelaSchema, crudo);
  const consulta = new URLSearchParams({
    ...(filtro.pasarela ? { pasarela: filtro.pasarela } : {}),
    ...(filtro.estado ? { estado: filtro.estado } : {}),
    pagina: String(filtro.pagina),
  });
  const { datos } = await leerApi<Pagina<EventoPasarelaResumen>>(`/eventos-pasarela?${consulta}`);
  const pagina = datos ?? { elementos: [], total: 0, pagina: 1, porPagina: 20 };
  const hayFiltros = Boolean(filtro.pasarela || filtro.estado);

  return (
    <Tarjeta>
      <form
        className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4 sm:px-6"
        role="search"
        aria-label="Filtrar avisos"
        action={RUTA}
      >
        <input type="hidden" name="vista" value="eventos" />
        <label htmlFor="filtro-pasarela" className="sr-only">
          Pasarela
        </label>
        <select
          id="filtro-pasarela"
          name="pasarela"
          defaultValue={filtro.pasarela ?? ''}
          className={`${clasesEntrada} w-auto`}
        >
          <option value="">Todas las pasarelas</option>
          {PASARELAS.map((p) => (
            <option key={p} value={p}>
              {nombrePasarela(p)}
            </option>
          ))}
        </select>
        <label htmlFor="filtro-evento-estado" className="sr-only">
          Estado
        </label>
        <select
          id="filtro-evento-estado"
          name="estado"
          defaultValue={filtro.estado ?? ''}
          className={`${clasesEntrada} w-auto`}
        >
          <option value="">Todos los estados</option>
          {ESTADOS_EVENTO_PASARELA.map((e) => (
            <option key={e} value={e}>
              {ESTADO_EVENTO_PASARELA[e].texto}
            </option>
          ))}
        </select>
        <Boton type="submit" variante="secundario">
          Filtrar
        </Boton>
        {hayFiltros && (
          <Link
            href={`${RUTA}?vista=eventos`}
            className="text-sm text-tinta-suave hover:text-tinta hover:underline"
          >
            Quitar filtros
          </Link>
        )}
        <p className="ml-auto text-sm text-tinta-tenue tabular-nums">
          {pagina.total === 1 ? '1 aviso' : `${pagina.total} avisos`}
        </p>
      </form>
      {!datos ? (
        <div className="p-5 sm:p-6">
          <Alerta tono="peligro">No pudimos cargar los avisos. Recarga la página.</Alerta>
        </div>
      ) : pagina.elementos.length === 0 ? (
        <EstadoVacio icono={Inbox} titulo="No hay avisos de pasarelas">
          {hayFiltros
            ? 'Prueba con otros filtros.'
            : 'Las pasarelas envían un aviso a la URL de webhook cada vez que cambia un pago.'}
        </EstadoVacio>
      ) : (
        <Tabla minimo="58rem">
          <Encabezados
            columnas={[
              'Recibido',
              'Pasarela',
              'Tipo',
              'Firma',
              'Estado',
              { texto: '', className: 'text-right' },
            ]}
          />
          <Cuerpo>
            {pagina.elementos.map((ev) => {
              const e = ESTADO_EVENTO_PASARELA[ev.estado];
              return (
                <Fila key={ev.id}>
                  <Celda primera>
                    <time dateTime={ev.recibidoEn} className="block">
                      {formatearFechaHora(ev.recibidoEn)}
                    </time>
                    <span className="block text-xs text-tinta-tenue">
                      {haceCuanto(ev.recibidoEn)}
                    </span>
                  </Celda>
                  <Celda>{nombrePasarela(ev.pasarela)}</Celda>
                  <Celda>
                    <span className="block font-mono text-xs">{ev.tipo}</span>
                    <span className="block max-w-56 truncate font-mono text-xs text-tinta-tenue">
                      {ev.idRecurso ?? ev.idEvento}
                    </span>
                  </Celda>
                  <Celda>
                    {ev.firmaValida ? (
                      <Insignia tono="exito">Válida</Insignia>
                    ) : (
                      <Insignia tono="peligro">No válida</Insignia>
                    )}
                  </Celda>
                  <Celda>
                    <Insignia tono={e.tono}>{e.texto}</Insignia>
                    {ev.error && (
                      <span className="mt-1 block max-w-64 text-xs text-peligro">{ev.error}</span>
                    )}
                  </Celda>
                  <Celda className="pr-5 text-right sm:pr-6">
                    {(ev.estado === 'error' || ev.estado === 'recibido') && ev.firmaValida && (
                      <ReprocesarEvento id={ev.id} />
                    )}
                  </Celda>
                </Fila>
              );
            })}
          </Cuerpo>
        </Tabla>
      )}
      <Paginacion
        ruta={RUTA}
        parametros={{ vista: 'eventos', ...parametros }}
        pagina={pagina.pagina}
        porPagina={pagina.porPagina}
        total={pagina.total}
      />
    </Tarjeta>
  );
}
