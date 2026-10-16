import {
  ESTADOS_SUSCRIPCION,
  listarSuscripcionesSchema,
  type Pagina,
  type SuscripcionPublica,
} from '@nv/shared';
import { CalendarClock, ChevronRight, Repeat } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FiltroSelector, Vencimiento } from '@/componentes/admin/piezas-crm';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoSuscripcionInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, EnlaceFila, Fila, Tabla } from '@/componentes/ui/tabla';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { ESTADO_SUSCRIPCION } from '@/lib/estados';
import { formatearDuracion } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Suscripciones' };

const PLAZOS = [7, 15, 30] as const;

export default async function Suscripciones({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requerirSesion({ permiso: 'suscripciones.ver' });
  const { filtro, consulta, parametros } = leerFiltro(
    listarSuscripcionesSchema,
    await searchParams,
    { porPagina: 20 },
  );
  const { datos } = await leerApi<Pagina<SuscripcionPublica>>(`/suscripciones?${consulta}`);
  const pagina = datos ?? { elementos: [], total: 0, pagina: 1, porPagina: 20 };
  const filtrando = Boolean(filtro.estado || filtro.vencenEnDias || filtro.clienteId);

  return (
    <>
      <CabeceraPagina
        titulo="Suscripciones"
        descripcion={
          sesion.usuario.rol === 'ventas'
            ? 'Los servicios contratados por los clientes de tu cartera, con su estado y vencimiento.'
            : 'Los servicios contratados por cada cliente, con su estado, vencimiento y factura pendiente.'
        }
      />

      <Tarjeta>
        <form
          className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4 sm:px-6"
          role="search"
          aria-label="Filtrar suscripciones"
        >
          <FiltroSelector
            id="filtro-estado"
            etiqueta="Estado"
            name="estado"
            defaultValue={filtro.estado ?? ''}
          >
            <option value="">Todos los estados</option>
            {ESTADOS_SUSCRIPCION.map((e) => (
              <option key={e} value={e}>
                {ESTADO_SUSCRIPCION[e].texto}
              </option>
            ))}
          </FiltroSelector>
          <FiltroSelector
            id="filtro-vencen"
            etiqueta="Vencimiento"
            name="vencenEnDias"
            defaultValue={filtro.vencenEnDias ? String(filtro.vencenEnDias) : ''}
          >
            <option value="">Cualquier vencimiento</option>
            {PLAZOS.map((d) => (
              <option key={d} value={d}>
                Vencen en los próximos {d} días
              </option>
            ))}
          </FiltroSelector>
          {filtro.clienteId && <input type="hidden" name="clienteId" value={filtro.clienteId} />}
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
          {filtrando && (
            <Link
              href="/admin/suscripciones"
              className="text-sm text-tinta-suave underline-offset-2 hover:text-tinta hover:underline"
            >
              Quitar filtros
            </Link>
          )}
          <p className="w-full text-sm text-tinta-tenue sm:ml-auto sm:w-auto">
            {pagina.total === 1 ? '1 suscripción' : `${pagina.total} suscripciones`}
          </p>
        </form>

        {pagina.elementos.length === 0 ? (
          filtro.vencenEnDias ? (
            <EstadoVacio
              icono={CalendarClock}
              titulo={`Nada vence en los próximos ${filtro.vencenEnDias} días`}
            >
              No hay suscripciones con ese vencimiento. Prueba con un plazo más largo.
            </EstadoVacio>
          ) : filtrando ? (
            <EstadoVacio icono={Repeat} titulo="No hay suscripciones con esos filtros">
              Cambia el estado o quita los filtros para ver todas.
            </EstadoVacio>
          ) : (
            <EstadoVacio icono={Repeat} titulo="Aún no hay suscripciones">
              Se crean desde la ficha de cada cliente o cuando un cliente contrata desde su panel.
            </EstadoVacio>
          )
        ) : (
          <Tabla minimo="54rem">
            <Encabezados
              columnas={[
                'Cliente',
                'Servicio · plan',
                'Estado',
                'Moneda',
                'Vence',
                'Factura abierta',
                { texto: 'Detalle', className: 'w-10 sr-only' },
              ]}
            />
            <Cuerpo>
              {pagina.elementos.map((s) => (
                <Fila key={s.id} href={`/admin/suscripciones/${s.id}`}>
                  <Celda primera>
                    <EnlaceFila href={`/admin/suscripciones/${s.id}`}>
                      <span className="font-medium">{s.cliente.nombre}</span>
                    </EnlaceFila>
                  </Celda>
                  <Celda>
                    <span className="grid">
                      <span>
                        {s.plan.servicio} · {s.plan.nombre}
                      </span>
                      <span className="text-xs text-tinta-tenue">
                        {formatearDuracion(s.plan.duracionCantidad, s.plan.duracionUnidad)}
                        {s.plan.renovable ? '' : ' · no renovable'}
                      </span>
                    </span>
                  </Celda>
                  <Celda>
                    <span className="flex flex-wrap gap-1.5">
                      <EstadoSuscripcionInsignia estado={s.estado} />
                      {s.cancelarAlVencer && <Insignia tono="aviso">Cancela al vencer</Insignia>}
                    </span>
                  </Celda>
                  <Celda>
                    <span className="font-mono text-xs text-tinta-suave">{s.moneda}</span>
                  </Celda>
                  <Celda>
                    <Vencimiento
                      iso={s.venceEn}
                      vacio={s.estado === 'pendiente_pago' ? 'Al pagar' : 'Sin fecha'}
                    />
                  </Celda>
                  <Celda>
                    {s.facturaAbierta ? (
                      <Link
                        href={`/admin/cobros/facturas/${s.facturaAbierta.id}`}
                        className="relative z-10 font-mono text-xs text-marca underline-offset-2 hover:underline"
                      >
                        {s.facturaAbierta.numero}
                      </Link>
                    ) : (
                      <span className="text-tinta-tenue">—</span>
                    )}
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
          ruta="/admin/suscripciones"
          parametros={parametros}
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
        />
      </Tarjeta>
    </>
  );
}
