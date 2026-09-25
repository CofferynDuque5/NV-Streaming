import type { ConfigEntregaProveedor } from '@nv/shared';
import { Layers } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InsigniaTipoProveedor } from '@/componentes/admin/catalogo';
import {
  ClaveFirma,
  FormularioEntrega,
  ProbarWebhook,
} from '@/componentes/admin/entrega-proveedor';
import { Volver } from '@/componentes/admin/piezas-crm';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, Fila, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { ADAPTADOR_ENTREGA, ESTADO_ENTREGA } from '@/lib/entregas';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Entrega del proveedor' };

export default async function EntregaProveedor({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requerirSesion({ permiso: 'catalogo.ver' });
  const puedeGestionar = sesion.permisos.includes('catalogo.gestionar');
  const verEntregas = sesion.permisos.includes('entregas.ver');
  const { id } = await params;
  const { estado, datos: c } = await leerApi<ConfigEntregaProveedor>(
    `/catalogo/proveedores/${encodeURIComponent(id)}/entrega`,
  );
  if (estado === 404 || estado === 400 || !c) notFound();

  return (
    <>
      <Volver href="/admin/catalogo">Catálogo</Volver>
      <CabeceraPagina
        titulo={`Entrega de ${c.proveedor.nombre}`}
        descripcion="Cómo recibe el cliente el servicio al pagar: NV solo vende su servicio propio y activaciones oficiales de distribuidores. Nunca se entregan usuarios ni contraseñas de cuentas."
        acciones={
          <span className="flex flex-wrap items-center gap-2">
            <InsigniaTipoProveedor tipo={c.proveedor.tipo} />
            <Insignia tono="marca">{ADAPTADOR_ENTREGA[c.adaptador].nombre}</Insignia>
            {!c.proveedor.activo && <Insignia>Inactivo</Insignia>}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Entrega"
            descripcion="Se aplica a las entregas nuevas. Las pendientes se reintentan con la forma actual."
          />
          <FormularioEntrega config={c} puedeGestionar={puedeGestionar} />
        </Tarjeta>

        <div className="grid gap-6">
          {c.adaptador === 'webhook' && (
            <Tarjeta>
              <CabeceraTarjeta
                titulo="Firma del webhook"
                descripcion="Cada envío lleva la cabecera NV-Firma (HMAC-SHA256). El proveedor la verifica con esta clave."
              />
              <div className="grid gap-5 p-5 sm:p-6">
                {puedeGestionar ? (
                  <>
                    <ClaveFirma
                      proveedorId={c.proveedor.id}
                      tieneSecreto={c.tieneSecreto}
                      rotadoEn={c.secretoRotadoEn}
                    />
                    {c.webhookUrl && c.tieneSecreto && (
                      <ProbarWebhook proveedorId={c.proveedor.id} />
                    )}
                  </>
                ) : (
                  <p className="text-sm text-tinta-suave">
                    {c.tieneSecreto ? 'Hay una clave de firma activa.' : 'Falta la clave de firma.'}
                  </p>
                )}
                <p className="text-xs text-tinta-tenue">
                  El contrato completo (eventos, respuestas y un ejemplo de verificación) está en el
                  README, sección «Entregas y proveedores».
                </p>
              </div>
            </Tarjeta>
          )}
          {c.adaptador === 'codigos' && (
            <Alerta tono="info" titulo="Códigos de inventario">
              Sube los códigos de cada plan en{' '}
              <Link href="/admin/inventario" className="underline">
                Inventario de códigos
              </Link>
              .
            </Alerta>
          )}
          <Tarjeta>
            <CabeceraTarjeta titulo="Entregas de este proveedor" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 p-5 text-sm sm:p-6">
              {(['pendiente', 'fallida', 'entregada', 'revocada'] as const).map((e) => (
                <div key={e} className="contents">
                  <dt className="text-tinta-tenue">{ESTADO_ENTREGA[e].texto}</dt>
                  <dd className="text-right tabular-nums">
                    {verEntregas ? (
                      <Link
                        href={`/admin/entregas?estado=${e}&proveedorId=${c.proveedor.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {c.contadores[e]}
                      </Link>
                    ) : (
                      c.contadores[e]
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Tarjeta>
        </div>
      </div>

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Planes y referencias del proveedor"
          descripcion="La referencia (SKU) viaja en el webhook para que el proveedor sepa qué activar. Se edita en cada plan."
        />
        {c.planes.length === 0 ? (
          <EstadoVacio icono={Layers} titulo="Este proveedor aún no tiene planes" />
        ) : (
          <Tabla minimo="32rem">
            <Encabezados columnas={['Plan', 'Referencia (SKU)']} />
            <Cuerpo>
              {c.planes.map((p) => (
                <Fila key={p.id}>
                  <Celda primera>
                    <Link
                      href={`/admin/catalogo/planes/${p.id}`}
                      className="text-marca underline-offset-2 hover:underline"
                    >
                      {p.servicio} · {p.nombre}
                    </Link>
                  </Celda>
                  <Celda>
                    {p.skuProveedor ? (
                      <code className="font-mono text-xs">{p.skuProveedor}</code>
                    ) : (
                      <span className="text-tinta-tenue">Sin referencia</span>
                    )}
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
