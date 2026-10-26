import {
  type CuentaServicioResumen,
  ESTADOS_CUENTA_SERVICIO,
  ETIQUETA_ESTADO_CUENTA,
  formatearMonto,
  listarCuentasSchema,
  type PaginaCuentas,
  type PorPagar,
  type ServicioPublico,
} from '@nv/shared';
import { FileCheck2, KeyRound, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NuevaCuenta } from '@/componentes/admin/cuentas';
import { PorPagarTarjeta } from '@/componentes/admin/por-pagar';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { clasesEntrada } from '@/componentes/ui/clases';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { ESTADO_CUENTA_SERVICIO } from '@/lib/estados';
import { formatearDia } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Cuentas de servicio' };

const POR_PAGINA = 50;

/** Días hasta el próximo cobro del proveedor (negativo: ya pasó). */
function diasHasta(fecha: string) {
  const hoy = new Date();
  const base = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((new Date(`${fecha}T00:00:00Z`).getTime() - base) / 86_400_000);
}

function Perfiles({ c }: { c: CuentaServicioResumen }) {
  const p = c.perfiles;
  if (c.modo === 'completa') {
    return <span>{p.asignados ? 'Vendida' : p.bloqueados ? 'Bloqueada' : 'Libre'}</span>;
  }
  return (
    <span className="tabular-nums">
      <span className={p.libres ? 'font-semibold text-exito' : 'text-tinta-tenue'}>
        {p.libres} libres
      </span>
      <span className="text-tinta-tenue">
        {' '}
        · {p.asignados} de {p.total} vendidos
      </span>
    </span>
  );
}

export default async function Cuentas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sesion = await requerirSesion({ permiso: 'cuentas.ver' });
  const puedeGestionar = sesion.permisos.includes('cuentas.gestionar');
  const crudo = await searchParams;
  const filtro = listarCuentasSchema.safeParse({
    ...Object.fromEntries(Object.entries(crudo).filter(([, v]) => v)),
    porPagina: POR_PAGINA,
  });
  const f = filtro.success ? filtro.data : listarCuentasSchema.parse({ porPagina: POR_PAGINA });
  const parametros = {
    busqueda: f.busqueda,
    estado: f.estado,
    servicioId: f.servicioId,
    conLibres: f.conLibres ? 'true' : undefined,
  };
  const q = new URLSearchParams(
    Object.entries({
      ...parametros,
      pagina: String(f.pagina),
      porPagina: String(f.porPagina),
    }).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const filtrado = Boolean(f.busqueda || f.estado || f.servicioId || f.conLibres);

  const [{ datos: cuentas }, servicios, { datos: porPagar }] = await Promise.all([
    leerApi<PaginaCuentas>(`/cuentas?${q}`),
    sesion.permisos.includes('catalogo.ver')
      ? leerApi<ServicioPublico[]>('/catalogo/servicios').then((r) => r.datos ?? [])
      : Promise.resolve([] as ServicioPublico[]),
    leerApi<PorPagar>('/balance/por-pagar'),
  ]);
  const lista = cuentas?.elementos ?? [];
  const opcionesServicio = servicios.map((s) => ({ id: s.id, nombre: s.nombre }));

  return (
    // minmax(0,1fr): la tabla ancha se desplaza dentro de su tarjeta y no ensancha la página en el teléfono.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <CabeceraPagina
        titulo="Cuentas de servicio"
        descripcion="Las cuentas que revendes, con sus perfiles. Asigna cada perfil a la suscripción de un cliente. El correo, la clave y los PIN van cifrados y solo se ven con «Ver credenciales»."
        acciones={
          puedeGestionar ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/cuentas/importar"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-borde px-4 text-sm font-medium hover:border-borde-fuerte"
              >
                <FileCheck2 className="size-4" aria-hidden="true" />
                Verificar con TXT o CSV
              </Link>
              <NuevaCuenta servicios={opcionesServicio} />
            </div>
          ) : undefined
        }
      />

      {porPagar && !filtrado && <PorPagarTarjeta datos={porPagar} />}

      <Tarjeta>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold">
            {filtrado ? 'Cuentas encontradas' : 'Todas las cuentas'}
          </h2>
          {cuentas && (
            <p className="text-sm text-tinta-tenue tabular-nums">
              {cuentas.total === 1 ? '1 cuenta' : `${cuentas.total} cuentas`}
            </p>
          )}
        </header>
        <form
          className="flex flex-wrap items-end gap-3 border-b border-borde px-5 py-4 sm:px-6"
          role="search"
        >
          <div className="relative min-w-52 flex-1">
            <label htmlFor="busqueda" className="sr-only">
              Buscar por correo
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-tenue"
              aria-hidden="true"
            />
            <input
              id="busqueda"
              name="busqueda"
              defaultValue={f.busqueda}
              placeholder="Correo completo, parte de la pista o nota"
              className={`${clasesEntrada} pl-9`}
            />
          </div>
          {opcionesServicio.length > 0 && (
            <>
              <label className="sr-only" htmlFor="filtro-servicio">
                Filtrar por servicio
              </label>
              <select
                id="filtro-servicio"
                name="servicioId"
                defaultValue={f.servicioId ?? ''}
                className={`${clasesEntrada} w-auto`}
              >
                <option value="">Todos los servicios</option>
                {opcionesServicio.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </>
          )}
          <label className="sr-only" htmlFor="filtro-estado">
            Filtrar por estado
          </label>
          <select
            id="filtro-estado"
            name="estado"
            defaultValue={f.estado ?? ''}
            className={`${clasesEntrada} w-auto`}
          >
            <option value="">Todos los estados</option>
            {ESTADOS_CUENTA_SERVICIO.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_CUENTA[e]}
              </option>
            ))}
          </select>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="conLibres" value="true" defaultChecked={f.conLibres} />
            Con perfiles libres
          </label>
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
        </form>
        {!cuentas ? (
          <div className="p-5 sm:p-6">
            <Alerta tono="peligro">No pudimos cargar las cuentas. Recarga la página.</Alerta>
          </div>
        ) : lista.length === 0 && filtrado ? (
          <EstadoVacio icono={KeyRound} titulo="No hay cuentas con esos filtros" />
        ) : lista.length === 0 ? (
          <EstadoVacio icono={KeyRound} titulo="Todavía no hay cuentas">
            {puedeGestionar
              ? 'Guarda la primera con «Nueva cuenta». Luego asigna sus perfiles a las suscripciones de tus clientes.'
              : 'Cuando el equipo guarde cuentas aparecerán aquí.'}
          </EstadoVacio>
        ) : (
          <Tabla minimo="56rem">
            <Encabezados
              columnas={[
                'Cuenta',
                'Perfiles',
                { texto: 'Costo', className: 'text-right' },
                'Próximo cobro',
                'Estado',
              ]}
            />
            <Cuerpo>
              {lista.map((c) => {
                const dias = c.facturaEn ? diasHasta(c.facturaEn) : null;
                return (
                  <tr key={c.id}>
                    <Celda primera>
                      <Link
                        href={`/admin/cuentas/${c.id}`}
                        className="block font-medium hover:text-marca"
                      >
                        {c.servicio.nombre}
                      </Link>
                      <span className="block font-mono text-xs text-tinta-tenue">{c.pista}</span>
                    </Celda>
                    <Celda>
                      <Perfiles c={c} />
                    </Celda>
                    <Celda className="text-right tabular-nums">
                      {formatearMonto(c.costoUsd, 'USD')}
                    </Celda>
                    <Celda>
                      {c.facturaEn ? (
                        <>
                          <span className="block">{formatearDia(c.facturaEn)}</span>
                          {dias !== null && dias <= 3 && c.estado === 'activa' && (
                            <span className="block text-xs text-aviso">
                              {dias < 0 ? 'Ya pasó' : dias === 0 ? 'Hoy' : `En ${dias} días`}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-tinta-tenue">Sin fecha</span>
                      )}
                    </Celda>
                    <Celda>
                      <Insignia tono={ESTADO_CUENTA_SERVICIO[c.estado].tono}>
                        {ESTADO_CUENTA_SERVICIO[c.estado].texto}
                      </Insignia>
                    </Celda>
                  </tr>
                );
              })}
            </Cuerpo>
          </Tabla>
        )}
        {cuentas && (
          <Paginacion
            ruta="/admin/cuentas"
            parametros={parametros}
            pagina={cuentas.pagina}
            porPagina={cuentas.porPagina}
            total={cuentas.total}
          />
        )}
      </Tarjeta>
    </div>
  );
}
