import {
  INFO_MONEDA,
  MONEDAS_CON_TASA,
  type PlanPublico,
  type ProveedorPublico,
  type ServicioPublico,
} from '@nv/shared';
import { ChevronRight, Package } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CeldaPrecio,
  ListaProveedores,
  ListaServicios,
  NuevoPlan,
} from '@/componentes/admin/catalogo';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, Fila, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearDuracion, formatearMonto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Catálogo' };

export default async function Catalogo() {
  const sesion = await requerirSesion({ permiso: 'catalogo.ver' });
  const puedeGestionar = sesion.permisos.includes('catalogo.gestionar');

  const [rProveedores, rServicios, rPlanes] = await Promise.all([
    leerApi<ProveedorPublico[]>('/catalogo/proveedores'),
    leerApi<ServicioPublico[]>('/catalogo/servicios'),
    leerApi<PlanPublico[]>('/catalogo/planes'),
  ]);
  const proveedores = rProveedores.datos ?? [];
  const servicios = rServicios.datos ?? [];
  const planes = rPlanes.datos ?? [];
  const fallo = !rProveedores.datos || !rServicios.datos || !rPlanes.datos;

  // Planes agrupados por servicio, en el orden de la lista de servicios.
  const grupos = servicios
    .map((s) => ({ servicio: s, planes: planes.filter((p) => p.servicio.id === s.id) }))
    .filter((g) => g.planes.length > 0);
  const planesActivos = planes.filter((p) => p.activo).length;

  const resumen: [string, string, string][] = [
    [
      'Proveedores',
      String(proveedores.length),
      `${proveedores.filter((p) => p.activo).length} activos`,
    ],
    ['Servicios', String(servicios.length), `${servicios.filter((s) => s.activo).length} activos`],
    ['Planes', String(planes.length), `${planesActivos} a la venta`],
  ];

  return (
    <>
      <CabeceraPagina
        titulo="Catálogo"
        descripcion="Proveedores, servicios y planes que vende NV. El precio de cada plan se fija en USD y el resto de monedas sigue la tasa del día, salvo que fijes un precio."
      />

      {fallo && (
        <Alerta tono="peligro" titulo="No pudimos cargar todo el catálogo">
          Recarga la página en unos segundos. Si el problema sigue, avisa a administración.
        </Alerta>
      )}

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-nv border border-borde bg-borde shadow-nv">
        {resumen.map(([t, n, d]) => (
          <div key={t} className="grid gap-0.5 bg-superficie px-4 py-4 sm:px-6">
            <dt className="text-xs text-tinta-tenue">{t}</dt>
            <dd className="font-titulo text-2xl font-semibold tabular-nums">{n}</dd>
            <dd className="text-xs text-tinta-suave">{d}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Proveedores"
            descripcion="Quién presta cada servicio y en qué condiciones."
          />
          <ListaProveedores proveedores={proveedores} puedeGestionar={puedeGestionar} />
        </Tarjeta>
        <Tarjeta>
          <CabeceraTarjeta titulo="Servicios" descripcion="Cada servicio agrupa sus planes." />
          <ListaServicios
            servicios={servicios}
            proveedores={proveedores}
            puedeGestionar={puedeGestionar}
          />
        </Tarjeta>
      </div>

      <section aria-labelledby="titulo-planes" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1">
            <h2 id="titulo-planes" className="text-lg font-semibold">
              Planes
            </h2>
            <p className="text-sm text-tinta-suave">
              Precio en cada moneda según la tasa vigente. Abre un plan para fijar precios o ver su
              historial.
            </p>
          </div>
          {puedeGestionar && <NuevoPlan servicios={servicios} />}
        </div>

        {grupos.length === 0 ? (
          <Tarjeta>
            <EstadoVacio icono={Package} titulo="Todavía no hay planes">
              {servicios.length === 0
                ? 'Crea un proveedor y un servicio; después podrás añadir sus planes.'
                : 'Usa «Nuevo plan» para añadir el primero.'}
            </EstadoVacio>
          </Tarjeta>
        ) : (
          grupos.map(({ servicio, planes: lista }) => (
            <Tarjeta key={servicio.id}>
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-borde px-5 py-3.5 sm:px-6">
                <h3 className="text-base font-semibold">{servicio.nombre}</h3>
                <span className="text-sm text-tinta-tenue">{servicio.proveedor.nombre}</span>
                {!servicio.activo && <Insignia tono="aviso">Servicio inactivo</Insignia>}
                <span className="ml-auto text-xs text-tinta-tenue">
                  {lista.length === 1 ? '1 plan' : `${lista.length} planes`}
                </span>
              </header>
              <Tabla minimo="60rem">
                <Encabezados
                  columnas={[
                    'Plan',
                    { texto: 'USD', className: 'text-right' },
                    ...MONEDAS_CON_TASA.map((m) => ({
                      texto: m,
                      className: 'text-right',
                    })),
                    'Estado',
                    { texto: 'Detalle', className: 'w-10 text-transparent select-none' },
                  ]}
                />
                <Cuerpo>
                  {lista.map((p) => (
                    <Fila key={p.id} href={`/admin/catalogo/planes/${p.id}`}>
                      <Celda primera>
                        <Link
                          href={`/admin/catalogo/planes/${p.id}`}
                          className="grid after:absolute after:inset-0"
                        >
                          <span className="font-medium">{p.nombre}</span>
                          <span className="text-xs text-tinta-tenue">
                            {formatearDuracion(p.duracionCantidad, p.duracionUnidad)}
                          </span>
                        </Link>
                      </Celda>
                      <Celda className="text-right font-medium tabular-nums">
                        {formatearMonto(p.precioUsd, 'USD')}
                      </Celda>
                      {MONEDAS_CON_TASA.map((m) => (
                        <Celda
                          key={m}
                          className="text-right text-tinta-suave"
                          title={INFO_MONEDA[m].nombre}
                        >
                          <CeldaPrecio moneda={m} valor={p.precios[m]} />
                        </Celda>
                      ))}
                      <Celda>
                        <div className="flex flex-wrap gap-1">
                          {p.activo ? (
                            <Insignia tono="exito">Activo</Insignia>
                          ) : (
                            <Insignia>Inactivo</Insignia>
                          )}
                          {!p.visible && <Insignia tono="aviso">Oculto</Insignia>}
                          {p.revendible && <Insignia tono="acento">Revendible</Insignia>}
                        </div>
                      </Celda>
                      <Celda className="text-tinta-tenue">
                        <ChevronRight
                          className="size-4 group-hover:text-tinta"
                          aria-hidden="true"
                        />
                      </Celda>
                    </Fila>
                  ))}
                </Cuerpo>
              </Tabla>
            </Tarjeta>
          ))
        )}
      </section>
    </>
  );
}
