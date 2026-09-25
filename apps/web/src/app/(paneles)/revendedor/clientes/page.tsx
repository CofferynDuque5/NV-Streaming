import {
  type CatalogoMayorista,
  type ClienteCartera,
  listarCarteraSchema,
  type Pagina,
  type ResumenRevendedor,
  type SuscripcionPublica,
} from '@nv/shared';
import { Search, UsersRound } from 'lucide-react';
import type { Metadata } from 'next';
import { clasesFiltro } from '@/componentes/admin/piezas-crm';
import { Paginacion } from '@/componentes/panel/paginacion';
import { RenovarSuscripcion } from '@/componentes/revendedor/formularios';
import { AvisosRevendedor, motivoBloqueo, SinFicha } from '@/componentes/revendedor/piezas';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoSuscripcionInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { diasHasta, formatearFecha } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Mis clientes' };

type Crudo = Record<string, string | string[] | undefined>;

const RENOVABLES: SuscripcionPublica['estado'][] = ['activa', 'en_gracia', 'suspendida', 'vencida'];

function vencimiento(s: SuscripcionPublica): string {
  if (!s.venceEn) return 'Sin fecha de vencimiento';
  const dias = diasHasta(s.venceEn);
  const fecha = formatearFecha(s.venceEn);
  if (dias < 0) return `Venció el ${fecha}`;
  if (dias === 0) return `Vence hoy (${fecha})`;
  return `Vence el ${fecha} · ${dias === 1 ? 'mañana' : `en ${dias} días`}`;
}

export default async function Clientes({ searchParams }: { searchParams: Promise<Crudo> }) {
  await requerirSesion({ roles: ['revendedor'] });
  const { filtro, consulta, parametros } = leerFiltro(listarCarteraSchema, await searchParams, {
    porPagina: 20,
  });
  const [{ estado, datos: resumen }, { datos: pagina }, { datos: catalogo }] = await Promise.all([
    leerApi<ResumenRevendedor>('/revendedor/resumen'),
    leerApi<Pagina<ClienteCartera>>(`/revendedor/clientes?${consulta}`),
    leerApi<CatalogoMayorista>('/revendedor/catalogo'),
  ]);
  const cabecera = (
    <CabeceraPagina
      titulo="Mis clientes"
      descripcion="Tus clientes y sus servicios. Renueva antes de que venzan para que no pierdan el acceso."
      acciones={<BotonEnlace href="/revendedor/catalogo">Nueva activación</BotonEnlace>}
    />
  );
  if (estado === 404) {
    return (
      <>
        {cabecera}
        <SinFicha />
      </>
    );
  }
  if (!resumen || !pagina) {
    return (
      <>
        {cabecera}
        <Alerta tono="peligro">No pudimos cargar tus clientes. Recarga la página.</Alerta>
      </>
    );
  }
  const bloqueo = motivoBloqueo(resumen.revendedor);
  const precios = new Map((catalogo?.planes ?? []).map((p) => [p.id, p.precioUsd]));

  return (
    <>
      {cabecera}
      <AvisosRevendedor revendedor={resumen.revendedor} />

      <Tarjeta>
        <form
          className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4 sm:px-6"
          role="search"
        >
          <div className="relative min-w-0 flex-1 basis-52">
            <label htmlFor="busqueda" className="sr-only">
              Buscar por nombre, documento, correo o WhatsApp
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-tenue"
              aria-hidden="true"
            />
            <input
              id="busqueda"
              name="busqueda"
              type="search"
              defaultValue={filtro.busqueda}
              placeholder="Nombre, documento, correo o WhatsApp"
              className={`${clasesFiltro} pl-9`}
            />
          </div>
          <Boton type="submit" variante="secundario">
            Buscar
          </Boton>
          <p className="w-full text-sm text-tinta-tenue sm:ml-auto sm:w-auto">
            {pagina.total === 1 ? '1 cliente' : `${pagina.total} clientes`}
          </p>
        </form>

        {pagina.elementos.length === 0 ? (
          filtro.busqueda ? (
            <EstadoVacio icono={Search} titulo="No encontramos clientes con esa búsqueda" />
          ) : (
            <EstadoVacio
              icono={UsersRound}
              titulo="Aún no tienes clientes"
              accion={<BotonEnlace href="/revendedor/catalogo">Comprar una activación</BotonEnlace>}
            >
              Cada activación que compres para un cliente nuevo lo añade a tu cartera.
            </EstadoVacio>
          )
        ) : (
          <ul className="divide-y divide-borde">
            {pagina.elementos.map((c) => (
              <li key={c.id} className="grid gap-3 px-5 py-4 sm:px-6">
                <div className="grid gap-0.5">
                  <h2 className="text-sm font-semibold break-words">{c.nombre}</h2>
                  <p className="text-xs break-words text-tinta-tenue">
                    {[c.documento, c.correo, c.whatsapp].filter(Boolean).join(' · ') ||
                      'Sin datos de contacto'}
                  </p>
                </div>
                {c.suscripciones.length === 0 ? (
                  <p className="text-sm text-tinta-suave">Sin servicios.</p>
                ) : (
                  <ul className="grid gap-2">
                    {c.suscripciones.map((s) => {
                      const renovable =
                        RENOVABLES.includes(s.estado) &&
                        s.plan.renovable &&
                        !s.cancelarAlVencer &&
                        !s.facturaAbierta;
                      return (
                        <li
                          key={s.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-hundida/50 px-3.5 py-3"
                        >
                          <div className="grid min-w-0 gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">
                                {s.plan.servicio} · {s.plan.nombre}
                              </span>
                              <EstadoSuscripcionInsignia estado={s.estado} />
                            </div>
                            <span className="text-xs text-tinta-suave">
                              {s.estado === 'cancelada'
                                ? `Cancelada${s.canceladaEn ? ` el ${formatearFecha(s.canceladaEn)}` : ''}`
                                : vencimiento(s)}
                              {s.cancelarAlVencer ? ' · no se renovará' : ''}
                            </span>
                          </div>
                          {renovable && (
                            <RenovarSuscripcion
                              suscripcionId={s.id}
                              descripcion={`${s.plan.nombre} de ${c.nombre}`}
                              precioUsd={precios.get(s.plan.id) ?? null}
                              bloqueado={bloqueo}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <Paginacion
          ruta="/revendedor/clientes"
          parametros={parametros}
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
        />
      </Tarjeta>
    </>
  );
}
