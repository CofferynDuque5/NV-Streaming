import type {
  ClienteDetalle,
  FacturaPublica,
  NotaPublica,
  Pagina,
  PlanPublico,
  SuscripcionPublica,
  TicketResumen,
} from '@nv/shared';
import {
  ChevronRight,
  Clock,
  KeyRound,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  DatosCliente,
  EstadoClienteAcciones,
  InvitarCliente,
  NuevaNota,
  NuevaSuscripcion,
} from '@/componentes/admin/clientes';
import { cargarEquipo } from '@/componentes/admin/equipo-servidor';
import {
  Iniciales,
  nombrePais,
  relativoDias,
  VacioCompacto,
  Volver,
} from '@/componentes/admin/piezas-crm';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import {
  EstadoFacturaInsignia,
  EstadoSuscripcionInsignia,
  EstadoTicketInsignia,
} from '@/componentes/ui/estado';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { CATEGORIA_TICKET } from '@/lib/estados';
import { formatearFecha, formatearFechaHora, formatearMonto, haceCuanto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Ficha del cliente' };

const ETIQUETA_CONTACTO = { correo: 'Correo', whatsapp: 'WhatsApp', telefono: 'Teléfono' };
const ICONO_CONTACTO = { correo: Mail, whatsapp: MessageCircle, telefono: Phone };

/** Fila de una lista compacta dentro de una tarjeta, enlazada a su detalle. */
function FilaEnlace({
  href,
  titulo,
  detalle,
  lateral,
}: {
  href: string;
  titulo: ReactNode;
  detalle: ReactNode;
  lateral: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-hundida/60 sm:px-6"
      >
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-sm font-medium">{titulo}</span>
          <span className="truncate text-xs text-tinta-tenue">{detalle}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">{lateral}</span>
        <ChevronRight
          className="size-4 shrink-0 text-tinta-tenue group-hover:text-tinta"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

export default async function FichaCliente({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requerirSesion({ permiso: 'clientes.ver' });
  const { id } = await params;
  const ruta = encodeURIComponent(id);
  const puede = (p: (typeof sesion.permisos)[number]) => sesion.permisos.includes(p);
  const puedeGestionar = puede('clientes.gestionar');
  const puedeReasignar = puedeGestionar && puede('usuarios.ver');

  const [clienteR, suscripcionesR, facturasR, ticketsR, notasR, planesR, responsables] =
    await Promise.all([
      leerApi<ClienteDetalle>(`/clientes/${ruta}`),
      puede('suscripciones.ver')
        ? leerApi<Pagina<SuscripcionPublica>>(`/suscripciones?clienteId=${ruta}&porPagina=50`)
        : null,
      puede('facturas.ver')
        ? leerApi<Pagina<FacturaPublica>>(`/facturas?clienteId=${ruta}&porPagina=5`)
        : null,
      puede('tickets.ver')
        ? leerApi<Pagina<TicketResumen>>(`/tickets?clienteId=${ruta}&porPagina=5`)
        : null,
      puede('clientes.notas') ? leerApi<NotaPublica[]>(`/clientes/${ruta}/notas`) : null,
      puede('suscripciones.crear') ? leerApi<PlanPublico[]>('/catalogo/planes') : null,
      puedeReasignar ? cargarEquipo(['ventas', 'operador', 'admin']) : Promise.resolve(null),
    ]);

  const c = clienteR.datos;
  if (clienteR.estado === 404 || clienteR.estado === 400 || !c) notFound();

  const suscripciones = suscripcionesR?.datos?.elementos ?? [];
  const facturas = facturasR?.datos?.elementos ?? [];
  const tickets = ticketsR?.datos?.elementos ?? [];
  const notas = notasR?.datos ?? [];
  const planes = (planesR?.datos ?? [])
    .filter((p) => p.activo)
    .sort(
      (a, b) =>
        a.servicio.nombre.localeCompare(b.servicio.nombre, 'es') ||
        a.orden - b.orden ||
        a.nombre.localeCompare(b.nombre, 'es'),
    );
  const archivado = c.estado === 'archivado';
  const pais = nombrePais(c.pais);

  return (
    <>
      <Volver href="/admin/clientes">Clientes</Volver>

      <header className="flex flex-wrap items-center gap-4">
        <Iniciales nombre={c.nombre} tamano="lg" />
        <div className="grid min-w-0 gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold sm:text-[1.75rem]">{c.nombre}</h1>
            {archivado ? <Insignia>Archivado</Insignia> : <Insignia tono="exito">Activo</Insignia>}
            {c.usuario && (
              <Insignia tono="marca">
                <KeyRound className="size-3" aria-hidden="true" /> Con acceso al panel
              </Insignia>
            )}
            {c.suscripcionesActivas > 0 && (
              <Insignia tono="acento">
                {c.suscripcionesActivas === 1
                  ? '1 servicio activo'
                  : `${c.suscripcionesActivas} servicios activos`}
              </Insignia>
            )}
          </div>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-tinta-suave">
            {c.correo && <span className="break-all">{c.correo}</span>}
            {pais && <span>{pais}</span>}
            <span>Cliente desde {formatearFecha(c.creadoEn)}</span>
            {c.asignadoA && <span>Responsable: {c.asignadoA.nombre}</span>}
          </p>
        </div>
      </header>

      {archivado && (
        <Alerta tono="aviso" titulo="Cliente archivado">
          No aparece en las listas ni se le pueden crear suscripciones. Reactívalo al final de esta
          página si vuelve a contratar.
        </Alerta>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Columna principal: actividad del cliente */}
        <div className="grid min-w-0 gap-6">
          {suscripcionesR && (
            <Tarjeta>
              <CabeceraTarjeta
                titulo="Suscripciones"
                descripcion={
                  suscripciones.length > 0
                    ? `${suscripciones.length} en total, de la más reciente a la más antigua.`
                    : undefined
                }
              />
              {suscripciones.length === 0 ? (
                <VacioCompacto>
                  Todavía no tiene suscripciones.
                  {puede('suscripciones.crear') && !archivado
                    ? ' Crea la primera aquí debajo: se emitirá su factura al momento.'
                    : ''}
                </VacioCompacto>
              ) : (
                <ul className="divide-y divide-borde">
                  {suscripciones.map((s) => {
                    const vence = s.venceEn ? relativoDias(s.venceEn) : null;
                    return (
                      <FilaEnlace
                        key={s.id}
                        href={`/admin/suscripciones/${s.id}`}
                        titulo={`${s.plan.servicio} · ${s.plan.nombre}`}
                        detalle={
                          s.venceEn && vence
                            ? `Vence el ${formatearFecha(s.venceEn)} (${vence.texto}) · ${s.moneda}`
                            : `Creada el ${formatearFecha(s.creadoEn)} · ${s.moneda}`
                        }
                        lateral={
                          <>
                            {s.cancelarAlVencer && (
                              <Insignia tono="aviso" className="hidden sm:inline-flex">
                                Cancela al vencer
                              </Insignia>
                            )}
                            <EstadoSuscripcionInsignia estado={s.estado} />
                          </>
                        }
                      />
                    );
                  })}
                </ul>
              )}
              {puede('suscripciones.crear') &&
                (archivado ? (
                  <p className="border-t border-borde px-5 py-4 text-sm text-tinta-tenue sm:px-6">
                    Reactiva al cliente para crearle una suscripción.
                  </p>
                ) : (
                  <NuevaSuscripcion
                    clienteId={c.id}
                    planes={planes}
                    monedaPreferida={c.monedaPreferida}
                  />
                ))}
            </Tarjeta>
          )}

          {facturasR && (
            <Tarjeta>
              <CabeceraTarjeta titulo="Facturas recientes" descripcion="Las cinco últimas." />
              {facturas.length === 0 ? (
                <VacioCompacto>Aún no se le ha emitido ninguna factura.</VacioCompacto>
              ) : (
                <ul className="divide-y divide-borde">
                  {facturas.map((f) => (
                    <FilaEnlace
                      key={f.id}
                      href={`/admin/cobros/facturas/${f.id}`}
                      titulo={
                        <span className="flex items-baseline gap-2">
                          <span className="font-mono">{f.numero}</span>
                          <span className="font-normal text-tinta-suave">
                            {f.concepto === 'alta' ? 'Alta' : 'Renovación'}
                          </span>
                        </span>
                      }
                      detalle={`Emitida el ${formatearFecha(f.creadoEn)} · vence el ${formatearFecha(f.venceEn)}`}
                      lateral={
                        <>
                          <span className="text-sm font-medium tabular-nums">
                            {formatearMonto(f.total, f.moneda)}
                          </span>
                          <EstadoFacturaInsignia estado={f.estado} vencida={f.vencida} />
                        </>
                      }
                    />
                  ))}
                </ul>
              )}
            </Tarjeta>
          )}

          {ticketsR && (
            <Tarjeta>
              <CabeceraTarjeta
                titulo="Tickets de soporte"
                descripcion="Los cinco con actividad más reciente."
                accion={
                  puede('tickets.gestionar') ? (
                    <BotonEnlace
                      href={`/admin/soporte?nuevo=1&cliente=${c.id}`}
                      variante="secundario"
                      tamano="sm"
                    >
                      <Plus className="size-4" aria-hidden="true" /> Abrir ticket
                    </BotonEnlace>
                  ) : undefined
                }
              />
              {tickets.length === 0 ? (
                <VacioCompacto>No ha abierto ningún ticket de soporte.</VacioCompacto>
              ) : (
                <ul className="divide-y divide-borde">
                  {tickets.map((t) => (
                    <FilaEnlace
                      key={t.id}
                      href={`/admin/soporte/${t.id}`}
                      titulo={
                        <>
                          <span className="font-mono text-tinta-tenue">#{t.numero}</span> {t.asunto}
                        </>
                      }
                      detalle={`${CATEGORIA_TICKET[t.categoria]} · actividad ${haceCuanto(t.actualizadoEn)}`}
                      lateral={<EstadoTicketInsignia estado={t.estado} />}
                    />
                  ))}
                </ul>
              )}
            </Tarjeta>
          )}

          {notasR && (
            <Tarjeta>
              <CabeceraTarjeta
                titulo="Notas internas"
                descripcion="Contexto para el equipo. El cliente nunca las ve."
              />
              <NuevaNota clienteId={c.id} />
              {notas.length > 0 && (
                <ol className="divide-y divide-borde border-t border-borde">
                  {notas.map((n) => (
                    <li key={n.id} className="flex gap-3 px-5 py-4 sm:px-6">
                      <Iniciales nombre={n.autor.nombre} tamano="sm" />
                      <div className="grid min-w-0 flex-1 gap-1">
                        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                          <span className="font-medium">{n.autor.nombre}</span>
                          <time
                            dateTime={n.creadoEn}
                            title={formatearFechaHora(n.creadoEn)}
                            className="text-xs text-tinta-tenue"
                          >
                            {haceCuanto(n.creadoEn)}
                          </time>
                        </p>
                        <p className="text-sm break-words whitespace-pre-line text-tinta-suave">
                          {n.texto}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Tarjeta>
          )}
        </div>

        {/* Columna lateral: ficha */}
        <div className="grid min-w-0 gap-6">
          <DatosCliente
            cliente={c}
            puedeEditar={puedeGestionar}
            responsables={puedeReasignar ? (responsables ?? []) : null}
          />

          <Tarjeta>
            <CabeceraTarjeta titulo="Contactos" />
            {c.contactos.length === 0 ? (
              <VacioCompacto>Sin contactos adicionales. Añade su WhatsApp en Datos.</VacioCompacto>
            ) : (
              <ul className="divide-y divide-borde">
                {c.contactos.map((ct) => {
                  const Icono = ICONO_CONTACTO[ct.tipo];
                  return (
                    <li key={ct.id} className="flex items-start gap-3 px-5 py-3.5 sm:px-6">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-borde bg-hundida text-tinta-suave">
                        <Icono className="size-4" aria-hidden="true" />
                      </span>
                      <div className="grid min-w-0 gap-0.5">
                        <span className="text-xs text-tinta-tenue">
                          {ETIQUETA_CONTACTO[ct.tipo]}
                        </span>
                        <span className="text-sm break-all">{ct.valor}</span>
                        {ct.tipo !== 'correo' &&
                          (ct.consentimientoEn ? (
                            <span className="inline-flex items-center gap-1 text-xs text-exito">
                              <ShieldCheck className="size-3.5" aria-hidden="true" />
                              Aceptó mensajes el {formatearFecha(ct.consentimientoEn)}
                            </span>
                          ) : (
                            <span className="text-xs text-aviso">
                              Sin consentimiento para mensajes
                            </span>
                          ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta titulo="Acceso al panel" />
            <div className="grid gap-3 px-5 py-5 sm:px-6">
              {c.usuario ? (
                <>
                  <p className="flex items-start gap-2 text-sm">
                    <KeyRound className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
                    <span>
                      Entra con <span className="font-medium break-all">{c.usuario.correo}</span>{' '}
                      para ver sus servicios, pagar y pedir soporte.
                    </span>
                  </p>
                  <p className="flex items-center gap-2 text-xs text-tinta-tenue">
                    <Clock className="size-3.5" aria-hidden="true" />
                    {c.usuario.ultimoAccesoEn
                      ? `Último acceso ${haceCuanto(c.usuario.ultimoAccesoEn)}`
                      : 'Aún no ha entrado: la invitación está pendiente.'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-tinta-suave">
                    Todavía no tiene acceso. Con la invitación recibe un enlace en su correo para
                    crear su contraseña y ver sus servicios, facturas y tickets.
                  </p>
                  {puedeGestionar && !archivado && <InvitarCliente id={c.id} correo={c.correo} />}
                </>
              )}
            </div>
          </Tarjeta>

          {puedeGestionar && (
            <Tarjeta>
              <CabeceraTarjeta titulo={archivado ? 'Reactivar cliente' : 'Archivar cliente'} />
              <EstadoClienteAcciones id={c.id} estado={c.estado} />
            </Tarjeta>
          )}
        </div>
      </div>
    </>
  );
}
