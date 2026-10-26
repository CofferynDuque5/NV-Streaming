import { type CuentaServicioDetalle, formatearMonto, type PagoCuentaPublico } from '@nv/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AccionesPerfil, EditarCuenta, VerCredenciales } from '@/componentes/admin/cuentas';
import { AnularPagoCuenta, RegistrarPagoCuenta } from '@/componentes/admin/pagos-cuenta';
import { Volver } from '@/componentes/admin/piezas-crm';
import { Alerta } from '@/componentes/ui/alerta';
import { EstadoSuscripcionInsignia } from '@/componentes/ui/estado';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { ESTADO_CUENTA_SERVICIO, ESTADO_PERFIL } from '@/lib/estados';
import { formatearDia, formatearFecha, textoCiclo } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Cuenta de servicio' };

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-tinta-tenue">{etiqueta}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function FichaCuenta({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requerirSesion({ permiso: 'cuentas.ver' });
  const { id } = await params;
  const puedeGestionar = sesion.permisos.includes('cuentas.gestionar');
  const puedeRevelar = sesion.permisos.includes('cuentas.revelar');
  const verClientes = sesion.permisos.includes('clientes.ver');

  const [r, rp] = await Promise.all([
    leerApi<CuentaServicioDetalle>(`/cuentas/${encodeURIComponent(id)}`),
    leerApi<PagoCuentaPublico[]>(`/cuentas/${encodeURIComponent(id)}/pagos`),
  ]);
  if (r.estado === 404 || r.estado === 400) notFound();
  const c = r.datos;
  const pagos = rp.datos;
  if (!c) {
    return <Alerta tono="peligro">No pudimos cargar la cuenta. Recarga la página.</Alerta>;
  }
  const estado = ESTADO_CUENTA_SERVICIO[c.estado];
  const terminadas = c.listaPerfiles.filter((p) => p.asignacion?.terminada).length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Volver href="/admin/cuentas">Cuentas de servicio</Volver>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="font-titulo text-2xl font-bold">{c.servicio.nombre}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
            <span className="font-mono">{c.pista}</span>
            <Insignia tono={estado.tono}>{estado.texto}</Insignia>
            {c.modo === 'completa' && <Insignia>Cuenta completa</Insignia>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeRevelar && <VerCredenciales cuentaId={c.id} />}
          {puedeGestionar && <EditarCuenta cuenta={c} />}
        </div>
      </header>

      {c.estado === 'caida' && (
        <Alerta tono="aviso">
          Esta cuenta está marcada como caída: no se le asignan perfiles nuevos. Cambia la clave o
          pasa a sus clientes a otra cuenta.
        </Alerta>
      )}
      {terminadas > 0 && (
        <Alerta tono="info">
          {terminadas === 1
            ? 'Un perfil está asignado a una suscripción que ya terminó. Libéralo para venderlo de nuevo.'
            : `${terminadas} perfiles están asignados a suscripciones que ya terminaron. Libéralos para venderlos de nuevo.`}
        </Alerta>
      )}

      <Tarjeta>
        <CabeceraTarjeta titulo="Datos de la cuenta" />
        <dl className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
          <Dato etiqueta="Plan">{c.plan ?? '—'}</Dato>
          <Dato etiqueta="Costo">
            {formatearMonto(c.costoUsd, 'USD')} · {textoCiclo(c.cicloMeses).toLowerCase()}
          </Dato>
          <Dato etiqueta="Próximo cobro del proveedor">
            {c.facturaEn ? formatearDia(c.facturaEn) : '—'}
          </Dato>
          <Dato etiqueta="Cómo se paga">{c.metodoPago ?? '—'}</Dato>
          <Dato etiqueta="Dónde se compró">{c.proveedor ?? '—'}</Dato>
          <Dato etiqueta="País">{c.pais ?? '—'}</Dato>
          <Dato etiqueta="Guardada">
            {formatearFecha(c.creadoEn)}
            {c.creadoPor ? ` por ${c.creadoPor.nombre}` : ''}
          </Dato>
          {c.notas && (
            <div className="sm:col-span-2">
              <Dato etiqueta="Notas">
                <span className="whitespace-pre-line">{c.notas}</span>
              </Dato>
            </div>
          )}
        </dl>
      </Tarjeta>

      <Tarjeta>
        <CabeceraTarjeta
          titulo={c.modo === 'completa' ? 'Cupo' : 'Perfiles'}
          descripcion={`${c.perfiles.libres} libres · ${c.perfiles.asignados} asignados · ${c.perfiles.bloqueados} bloqueados`}
        />
        <Tabla minimo="48rem">
          <Encabezados
            columnas={[
              'Perfil',
              'Estado',
              'Cliente',
              ...(puedeGestionar
                ? [{ texto: 'Acciones', className: 'pr-5 text-right sm:pr-6' }]
                : []),
            ]}
          />
          <Cuerpo>
            {c.listaPerfiles.map((p) => {
              const e = ESTADO_PERFIL[p.estado];
              const a = p.asignacion;
              return (
                <tr key={p.id}>
                  <Celda primera>
                    <span className="block font-medium">{p.nombre}</span>
                    <span className="block text-xs text-tinta-tenue">
                      N.º {p.numero}
                      {p.tienePin ? ' · con PIN' : ''}
                    </span>
                  </Celda>
                  <Celda>
                    <Insignia tono={e.tono}>{e.texto}</Insignia>
                  </Celda>
                  <Celda>
                    {a ? (
                      <div className="grid gap-1">
                        {verClientes ? (
                          <Link
                            href={`/admin/clientes/${a.cliente.id}`}
                            className="font-medium hover:text-marca"
                          >
                            {a.cliente.nombre}
                          </Link>
                        ) : (
                          <span className="font-medium">{a.cliente.nombre}</span>
                        )}
                        <span className="flex flex-wrap items-center gap-2 text-xs text-tinta-tenue">
                          {a.plan.nombre}
                          <EstadoSuscripcionInsignia estado={a.estado} />
                          {a.venceEn ? `vence el ${formatearFecha(a.venceEn)}` : ''}
                        </span>
                      </div>
                    ) : (
                      <span className="text-tinta-tenue">—</span>
                    )}
                  </Celda>
                  {puedeGestionar && (
                    <Celda className="pr-5 text-right sm:pr-6">
                      <AccionesPerfil
                        cuentaId={c.id}
                        perfil={p}
                        cuentaActiva={c.estado === 'activa'}
                      />
                    </Celda>
                  )}
                </tr>
              );
            })}
          </Cuerpo>
        </Tabla>
      </Tarjeta>

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Pagos al proveedor"
          descripcion="Lo que pagaste por esta cuenta. Suma en los costos del balance."
          accion={
            puedeGestionar && c.estado !== 'retirada' ? <RegistrarPagoCuenta cuenta={c} /> : null
          }
        />
        {!pagos ? (
          <div className="p-5 sm:p-6">
            <Alerta tono="peligro">No pudimos cargar los pagos. Recarga la página.</Alerta>
          </div>
        ) : pagos.length === 0 ? (
          <p className="p-5 text-sm text-tinta-suave sm:p-6">Todavía no hay pagos registrados.</p>
        ) : (
          <Tabla minimo="44rem">
            <Encabezados
              columnas={[
                'Día',
                'Monto',
                'Cubre',
                'Detalle',
                ...(puedeGestionar
                  ? [{ texto: 'Acciones', className: 'pr-5 text-right sm:pr-6' }]
                  : []),
              ]}
            />
            <Cuerpo>
              {pagos.map((p) => (
                <tr key={p.id} className={p.anulacion ? 'opacity-60' : undefined}>
                  <Celda primera>
                    <span className="block font-medium">{formatearDia(p.pagadoEl)}</span>
                    <span className="block text-xs text-tinta-tenue">
                      por {p.registradoPor.nombre}
                    </span>
                  </Celda>
                  <Celda>
                    <span className={p.anulacion ? 'line-through' : undefined}>
                      {formatearMonto(p.montoUsd, 'USD')}
                    </span>
                    {p.anulacion && (
                      <span className="mt-1 block">
                        <Insignia tono="peligro">Anulado</Insignia>
                      </span>
                    )}
                  </Celda>
                  <Celda>
                    <span className="block text-sm">
                      {p.facturaCubierta ? formatearDia(p.facturaCubierta) : 'Sin fecha'} →{' '}
                      {formatearDia(p.siguienteCobro)}
                    </span>
                  </Celda>
                  <Celda>
                    <span className="block text-sm">{p.metodoPago ?? '—'}</span>
                    {p.nota && <span className="block text-xs text-tinta-tenue">{p.nota}</span>}
                    {p.anulacion && (
                      <span className="block text-xs text-tinta-tenue">
                        Anulado{p.anulacion.por ? ` por ${p.anulacion.por.nombre}` : ''}:{' '}
                        {p.anulacion.motivo}
                      </span>
                    )}
                  </Celda>
                  {puedeGestionar && (
                    <Celda className="pr-5 text-right sm:pr-6">
                      {!p.anulacion && (
                        <AnularPagoCuenta
                          cuentaId={c.id}
                          pagoId={p.id}
                          revierteCobro={p.revierteCobro}
                        />
                      )}
                    </Celda>
                  )}
                </tr>
              ))}
            </Cuerpo>
          </Tabla>
        )}
      </Tarjeta>
    </div>
  );
}
