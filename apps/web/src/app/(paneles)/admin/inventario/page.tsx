import type { InventarioDetalle, InventarioPlan } from '@nv/shared';
import { ChevronRight, Tickets } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AnularCodigo, SubirLote } from '@/componentes/admin/inventario';
import { FiltroSelector } from '@/componentes/admin/piezas-crm';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, EnlaceFila, Fila, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { ADAPTADOR_ENTREGA, ESTADO_CODIGO } from '@/lib/entregas';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Inventario de códigos' };

const RUTA = '/admin/inventario';
const ESTADOS = ['disponible', 'entregado', 'anulado'] as const;

export default async function Inventario({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirSesion({ permiso: 'inventario.gestionar' });
  const q = await searchParams;
  const planId = typeof q.plan === 'string' && /^[0-9a-f-]{36}$/i.test(q.plan) ? q.plan : null;
  if (planId) {
    const estado =
      typeof q.estado === 'string' && (ESTADOS as readonly string[]).includes(q.estado)
        ? q.estado
        : undefined;
    const pagina = Math.max(1, Number(q.pagina) || 1);
    return <DetallePlan planId={planId} estado={estado} pagina={pagina} />;
  }

  const { datos } = await leerApi<InventarioPlan[]>('/inventario');
  const planes = datos ?? [];

  return (
    <>
      <CabeceraPagina
        titulo="Inventario de códigos"
        descripcion="Códigos, tarjetas o activaciones que NV compra como distribuidor oficial, por plan. Se guardan cifrados: el equipo ve cuántos hay, nunca los códigos."
      />
      {!datos && (
        <Alerta tono="peligro" titulo="No pudimos cargar el inventario">
          Recarga la página en unos segundos.
        </Alerta>
      )}
      <Tarjeta>
        {planes.length === 0 ? (
          <EstadoVacio icono={Tickets} titulo="Ningún plan entrega códigos todavía">
            Elige «Códigos de inventario» en la entrega de un proveedor (Catálogo → Proveedores →
            Entrega) y sus planes aparecerán aquí.
          </EstadoVacio>
        ) : (
          <Tabla minimo="46rem">
            <Encabezados
              columnas={[
                'Plan',
                { texto: 'Disponibles', className: 'text-right' },
                { texto: 'Entregados', className: 'text-right' },
                { texto: 'Esperando', className: 'text-right' },
                'Estado',
                { texto: 'Detalle', className: 'w-10 sr-only' },
              ]}
            />
            <Cuerpo>
              {planes.map((p) => (
                <Fila key={p.plan.id} href={`${RUTA}?plan=${p.plan.id}`}>
                  <Celda primera>
                    <EnlaceFila href={`${RUTA}?plan=${p.plan.id}`}>
                      <span className="font-medium">
                        {p.plan.servicio} · {p.plan.nombre}
                      </span>
                      <span className="text-xs text-tinta-tenue">{p.proveedor.nombre}</span>
                    </EnlaceFila>
                  </Celda>
                  <Celda className="text-right font-medium tabular-nums">{p.disponibles}</Celda>
                  <Celda className="text-right tabular-nums text-tinta-suave">{p.entregados}</Celda>
                  <Celda className="text-right tabular-nums">
                    {p.pendientes > 0 ? (
                      <span className="font-medium text-aviso">{p.pendientes}</span>
                    ) : (
                      <span className="text-tinta-tenue">0</span>
                    )}
                  </Celda>
                  <Celda>
                    <span className="flex flex-wrap gap-1">
                      {p.proveedor.adaptador !== 'codigos' && (
                        <Insignia>{ADAPTADOR_ENTREGA[p.proveedor.adaptador].nombre}</Insignia>
                      )}
                      {p.disponibles === 0 ? (
                        <Insignia tono="peligro">Sin códigos</Insignia>
                      ) : p.pendientes > 0 ? (
                        <Insignia tono="aviso">Entregas esperando</Insignia>
                      ) : (
                        <Insignia tono="exito">Con existencias</Insignia>
                      )}
                      {p.vencidos > 0 && <Insignia tono="aviso">{p.vencidos} vencidos</Insignia>}
                      {!p.plan.activo && <Insignia>Plan inactivo</Insignia>}
                    </span>
                  </Celda>
                  <Celda className="text-tinta-tenue">
                    <ChevronRight className="size-4 group-hover:text-tinta" aria-hidden="true" />
                  </Celda>
                </Fila>
              ))}
            </Cuerpo>
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}

async function DetallePlan({
  planId,
  estado,
  pagina,
}: {
  planId: string;
  estado: string | undefined;
  pagina: number;
}) {
  const consulta = new URLSearchParams({ pagina: String(pagina), ...(estado ? { estado } : {}) });
  const { datos: d } = await leerApi<InventarioDetalle>(`/inventario/planes/${planId}?${consulta}`);
  if (!d) {
    return (
      <>
        <CabeceraPagina titulo="Inventario de códigos" />
        <Alerta tono="peligro" titulo="Este plan no existe o no se pudo cargar">
          <Link href={RUTA} className="underline">
            Volver al inventario
          </Link>
        </Alerta>
      </>
    );
  }
  const resumen: [string, number][] = [
    ['Disponibles', d.disponibles],
    ['Entregados', d.entregados],
    ['Esperando códigos', d.pendientes],
    ['Anulados o vencidos', d.anulados + d.vencidos],
  ];

  return (
    <>
      <Link href={RUTA} className="text-sm text-tinta-suave hover:text-tinta">
        ← Inventario
      </Link>
      <CabeceraPagina
        titulo={`${d.plan.servicio} · ${d.plan.nombre}`}
        descripcion={`Proveedor: ${d.proveedor.nombre} (${ADAPTADOR_ENTREGA[d.proveedor.adaptador].nombre.toLowerCase()}). Las entregas toman el código disponible más antiguo.`}
      />
      {d.proveedor.adaptador !== 'codigos' && (
        <Alerta tono="aviso">
          Este proveedor no entrega con códigos de inventario: los códigos de este plan no se usarán
          hasta que cambies su forma de entrega en el catálogo.
        </Alerta>
      )}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-nv border border-borde bg-borde shadow-nv sm:grid-cols-4">
        {resumen.map(([t, n]) => (
          <div key={t} className="grid gap-0.5 bg-superficie px-4 py-4 sm:px-6">
            <dt className="text-xs text-tinta-tenue">{t}</dt>
            <dd className="font-titulo text-2xl font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      <SubirLote planId={planId} />

      <Tarjeta>
        <CabeceraTarjeta titulo="Lotes" descripcion="Los últimos 50 lotes subidos." />
        {d.lotes.length === 0 ? (
          <EstadoVacio icono={Tickets} titulo="Todavía no hay lotes">
            Sube el primero con los códigos que te entregó el distribuidor.
          </EstadoVacio>
        ) : (
          <Tabla minimo="40rem">
            <Encabezados
              columnas={[
                'Lote',
                { texto: 'Añadidos', className: 'text-right' },
                { texto: 'Disponibles', className: 'text-right' },
                'Vencen',
                'Subido',
              ]}
            />
            <Cuerpo>
              {d.lotes.map((l) => (
                <Fila key={l.id}>
                  <Celda primera>
                    <span className="grid">
                      <span className="font-medium">{l.nombre}</span>
                      {l.repetidos > 0 && (
                        <span className="text-xs text-tinta-tenue">
                          {l.repetidos} repetidos descartados
                        </span>
                      )}
                    </span>
                  </Celda>
                  <Celda className="text-right tabular-nums">{l.cantidad}</Celda>
                  <Celda className="text-right tabular-nums">{l.disponibles}</Celda>
                  <Celda className="text-tinta-suave">
                    {l.venceEn ? formatearFecha(l.venceEn) : 'No vencen'}
                  </Celda>
                  <Celda className="text-tinta-suave">
                    <span className="grid">
                      <span>{formatearFechaHora(l.creadoEn)}</span>
                      <span className="text-xs text-tinta-tenue">{l.subidoPor.nombre}</span>
                    </span>
                  </Celda>
                </Fila>
              ))}
            </Cuerpo>
          </Tabla>
        )}
      </Tarjeta>

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Códigos"
          descripcion="Identificados por el inicio de su huella: el código no se muestra nunca."
        />
        <form
          className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4 sm:px-6"
          role="search"
          aria-label="Filtrar códigos"
        >
          <input type="hidden" name="plan" value={planId} />
          <FiltroSelector
            id="filtro-estado-codigo"
            etiqueta="Estado"
            name="estado"
            defaultValue={estado ?? ''}
          >
            <option value="">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {ESTADO_CODIGO[e].texto}
              </option>
            ))}
          </FiltroSelector>
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
          <p className="w-full text-sm text-tinta-tenue sm:ml-auto sm:w-auto">
            {d.codigos.total === 1 ? '1 código' : `${d.codigos.total} códigos`}
          </p>
        </form>
        {d.codigos.elementos.length === 0 ? (
          <EstadoVacio icono={Tickets} titulo="No hay códigos con ese estado" />
        ) : (
          <Tabla minimo="44rem">
            <Encabezados columnas={['Huella', 'Estado', 'Lote', 'Fecha', 'Acción']} />
            <Cuerpo>
              {d.codigos.elementos.map((c) => (
                <Fila key={c.id}>
                  <Celda primera>
                    <code className="font-mono text-xs">{c.huella}…</code>
                  </Celda>
                  <Celda>
                    <span className="grid justify-items-start gap-1">
                      <Insignia tono={ESTADO_CODIGO[c.estado].tono}>
                        {ESTADO_CODIGO[c.estado].texto}
                      </Insignia>
                      {c.motivoAnulacion && (
                        <span className="text-xs text-tinta-tenue">{c.motivoAnulacion}</span>
                      )}
                    </span>
                  </Celda>
                  <Celda className="text-tinta-suave">{c.lote.nombre}</Celda>
                  <Celda className="text-tinta-suave">
                    {c.entregadoEn ? (
                      <Link
                        href={`/admin/entregas?id=${c.entregaId}`}
                        className="text-marca underline-offset-2 hover:underline"
                      >
                        Entregado {formatearFecha(c.entregadoEn)}
                      </Link>
                    ) : c.anuladoEn ? (
                      `Anulado ${formatearFecha(c.anuladoEn)}`
                    ) : c.venceEn ? (
                      `Vence ${formatearFecha(c.venceEn)}`
                    ) : (
                      `Subido ${formatearFecha(c.creadoEn)}`
                    )}
                  </Celda>
                  <Celda>
                    {c.estado === 'disponible' ? (
                      <AnularCodigo id={c.id} huella={c.huella} />
                    ) : (
                      <span className="text-tinta-tenue">—</span>
                    )}
                  </Celda>
                </Fila>
              ))}
            </Cuerpo>
          </Tabla>
        )}
        <Paginacion
          ruta={RUTA}
          parametros={{ plan: planId, estado }}
          pagina={d.codigos.pagina}
          porPagina={d.codigos.porPagina}
          total={d.codigos.total}
        />
      </Tarjeta>
    </>
  );
}
