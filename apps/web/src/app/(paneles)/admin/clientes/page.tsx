import { type ClienteResumen, listarClientesSchema, type Pagina } from '@nv/shared';
import { ChevronRight, Plus, Search, UserRoundPlus, UsersRound } from 'lucide-react';
import type { Metadata } from 'next';
import { NuevoCliente } from '@/componentes/admin/clientes';
import { cargarEquipo } from '@/componentes/admin/equipo-servidor';
import {
  clasesFiltro,
  FiltroSelector,
  Iniciales,
  nombrePais,
  PanelAlta,
} from '@/componentes/admin/piezas-crm';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, EnlaceFila, Fila, Tabla } from '@/componentes/ui/tabla';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Clientes' };

export default async function Clientes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requerirSesion({ permiso: 'clientes.ver' });
  const puedeGestionar = sesion.permisos.includes('clientes.gestionar');
  const puedeElegirResponsable = sesion.permisos.includes('usuarios.ver');
  const crudo = await searchParams;
  const { filtro, consulta, parametros } = leerFiltro(listarClientesSchema, crudo, {
    porPagina: 20,
  });
  const nuevo = puedeGestionar && crudo.nuevo === '1';

  const [{ datos }, responsables] = await Promise.all([
    leerApi<Pagina<ClienteResumen>>(`/clientes?${consulta}`),
    nuevo && puedeElegirResponsable
      ? cargarEquipo(['ventas', 'operador', 'admin'])
      : Promise.resolve(null),
  ]);
  const pagina = datos ?? { elementos: [], total: 0, pagina: 1, porPagina: 20 };
  const archivados = filtro.estado === 'archivado';

  return (
    <>
      <CabeceraPagina
        titulo="Clientes"
        descripcion={
          sesion.usuario.rol === 'ventas'
            ? 'Tu cartera de clientes: sus datos, servicios contratados y acceso a su panel.'
            : 'Todas las personas que contratan con NV: sus datos, responsable, servicios y acceso a su panel.'
        }
        acciones={
          puedeGestionar && !nuevo ? (
            <BotonEnlace href="/admin/clientes?nuevo=1" scroll={false}>
              <UserRoundPlus className="size-4" aria-hidden="true" /> Nuevo cliente
            </BotonEnlace>
          ) : undefined
        }
      />

      {nuevo && (
        <PanelAlta
          titulo="Nuevo cliente"
          descripcion="Solo el nombre es obligatorio. Podrás completar el resto más tarde."
          cerrarHref="/admin/clientes"
        >
          <NuevoCliente responsables={responsables} responsablePorDefecto={sesion.usuario.id} />
        </PanelAlta>
      )}

      <Tarjeta>
        <form
          className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4 sm:px-6"
          role="search"
        >
          <div className="relative min-w-52 flex-1">
            <label htmlFor="busqueda" className="sr-only">
              Buscar por nombre, correo, documento o WhatsApp
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
              placeholder="Nombre, correo, documento o WhatsApp"
              className={`${clasesFiltro} pl-9`}
            />
          </div>
          <FiltroSelector
            id="filtro-estado"
            etiqueta="Estado"
            name="estado"
            defaultValue={filtro.estado ?? 'activo'}
          >
            <option value="activo">Activos</option>
            <option value="archivado">Archivados</option>
          </FiltroSelector>
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
          <p className="w-full text-sm text-tinta-tenue sm:ml-auto sm:w-auto">
            {pagina.total === 1 ? '1 cliente' : `${pagina.total} clientes`}
          </p>
        </form>

        {pagina.elementos.length === 0 ? (
          filtro.busqueda ? (
            <EstadoVacio icono={Search} titulo="No encontramos clientes con esa búsqueda">
              Prueba con otra parte del nombre, el correo, el documento o el número de WhatsApp.
            </EstadoVacio>
          ) : archivados ? (
            <EstadoVacio icono={UsersRound} titulo="No hay clientes archivados">
              Cuando archives a un cliente aparecerá aquí y podrás reactivarlo desde su ficha.
            </EstadoVacio>
          ) : (
            <EstadoVacio
              icono={UsersRound}
              titulo="Aún no hay clientes"
              accion={
                puedeGestionar && !nuevo ? (
                  <BotonEnlace href="/admin/clientes?nuevo=1" variante="secundario" scroll={false}>
                    <Plus className="size-4" aria-hidden="true" /> Crear el primero
                  </BotonEnlace>
                ) : undefined
              }
            >
              Los clientes que se registren en la web y los que crees aquí aparecerán en esta lista.
            </EstadoVacio>
          )
        ) : (
          <Tabla minimo="52rem">
            <Encabezados
              columnas={[
                'Cliente',
                'País',
                'Moneda',
                'Responsable',
                { texto: 'Servicios activos', className: 'text-right' },
                'Acceso al panel',
                { texto: 'Detalle', className: 'w-10 sr-only' },
              ]}
            />
            <Cuerpo>
              {pagina.elementos.map((c) => (
                <Fila key={c.id} href={`/admin/clientes/${c.id}`}>
                  <Celda primera>
                    <EnlaceFila href={`/admin/clientes/${c.id}`}>
                      <span className="flex items-center gap-3">
                        <Iniciales nombre={c.nombre} />
                        <span className="grid min-w-0">
                          <span className="flex items-center gap-2 font-medium">
                            <span className="truncate">{c.nombre}</span>
                            {c.estado === 'archivado' && <Insignia>Archivado</Insignia>}
                          </span>
                          <span className="truncate text-xs text-tinta-tenue">
                            {c.correo ?? 'Sin correo'}
                          </span>
                        </span>
                      </span>
                    </EnlaceFila>
                  </Celda>
                  <Celda className="text-tinta-suave">
                    {nombrePais(c.pais) ?? <span className="text-tinta-tenue">—</span>}
                  </Celda>
                  <Celda>
                    <span className="font-mono text-xs text-tinta-suave">{c.monedaPreferida}</span>
                  </Celda>
                  <Celda className="text-tinta-suave">
                    {c.asignadoA?.nombre ?? <span className="text-tinta-tenue">Sin asignar</span>}
                  </Celda>
                  <Celda className="text-right tabular-nums">
                    {c.suscripcionesActivas > 0 ? (
                      <span className="font-medium">{c.suscripcionesActivas}</span>
                    ) : (
                      <span className="text-tinta-tenue">0</span>
                    )}
                  </Celda>
                  <Celda>
                    {c.tieneAcceso ? <Insignia tono="exito">Sí</Insignia> : <Insignia>No</Insignia>}
                  </Celda>
                  <Celda className="text-tinta-tenue">
                    <ChevronRight className="size-4 group-hover:text-tinta" aria-hidden="true" />
                  </Celda>
                </Fila>
              ))}
            </Cuerpo>
          </Tabla>
        )}
        <Paginacion
          ruta="/admin/clientes"
          parametros={parametros}
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
        />
      </Tarjeta>
    </>
  );
}
