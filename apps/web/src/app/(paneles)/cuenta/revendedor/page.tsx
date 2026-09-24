import type { MiSolicitudRevendedor } from '@nv/shared';
import { BadgePercent, Clock, Users, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import { FormularioSolicitud } from '@/componentes/revendedor/formularios';
import { EstadoRevendedorInsignia } from '@/componentes/revendedor/piezas';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearFecha } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Ser revendedor' };

const VENTAJAS = [
  { icono: BadgePercent, texto: 'Precios mayoristas según tu nivel en los planes revendibles.' },
  { icono: Wallet, texto: 'Recargas saldo con Pago Móvil u otros métodos y compras al momento.' },
  { icono: Users, texto: 'Llevas tu propia cartera de clientes y renuevas sus servicios.' },
];

export default async function SerRevendedor() {
  await requerirSesion({ permiso: 'revendedor.solicitar' });
  const { datos, estado } = await leerApi<{ solicitud: MiSolicitudRevendedor | null }>(
    '/revendedor/solicitud',
  );
  const s = datos?.solicitud ?? null;

  return (
    <>
      <CabeceraPagina
        titulo="Ser revendedor"
        descripcion="Vende los servicios de NV a tus propios clientes con precios mayoristas."
      />

      {!datos && estado !== 404 && (
        <Alerta tono="peligro">No pudimos cargar tu solicitud. Recarga la página.</Alerta>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Tarjeta>
          {s?.estado === 'solicitud' ? (
            <>
              <CabeceraTarjeta
                titulo="Solicitud en revisión"
                accion={<EstadoRevendedorInsignia estado={s.estado} />}
              />
              <div className="grid gap-4 px-5 py-5 text-sm sm:px-6">
                <p className="inline-flex items-start gap-2 text-tinta-suave">
                  <Clock className="mt-0.5 size-4 shrink-0 text-marca" aria-hidden="true" />
                  Recibimos tu solicitud el {formatearFecha(s.creadoEn)}. El equipo la revisará y te
                  avisaremos. Cuando la aprueben tendrás que iniciar sesión de nuevo para entrar a
                  tu panel de revendedor.
                </p>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Dato etiqueta="Negocio" valor={s.nombreComercial} />
                  <Dato etiqueta="Documento" valor={s.documento} />
                  <Dato etiqueta="Teléfono" valor={s.telefono} />
                  <Dato etiqueta="País" valor={s.pais} />
                  {s.mensaje && (
                    <div className="sm:col-span-2">
                      <Dato etiqueta="Mensaje" valor={s.mensaje} />
                    </div>
                  )}
                </dl>
              </div>
            </>
          ) : s?.estado === 'aprobado' || s?.estado === 'suspendido' ? (
            <>
              <CabeceraTarjeta
                titulo="Tu solicitud fue aprobada"
                accion={<EstadoRevendedorInsignia estado={s.estado} />}
              />
              <p className="px-5 py-5 text-sm text-tinta-suave sm:px-6">
                Cierra sesión y vuelve a entrar para abrir tu panel de revendedor.
              </p>
            </>
          ) : (
            <>
              <CabeceraTarjeta
                titulo={s ? 'Envía tu solicitud de nuevo' : 'Solicitud'}
                descripcion="Revisamos cada solicitud a mano. Los datos solo los ve el equipo de NV."
                accion={s ? <EstadoRevendedorInsignia estado={s.estado} /> : undefined}
              />
              <div className="grid gap-4 px-5 py-5 sm:px-6">
                {s?.estado === 'rechazado' && (
                  <Alerta tono="aviso" titulo="Tu solicitud anterior no fue aprobada">
                    {s.motivoEstado ? `Motivo: ${s.motivoEstado}. ` : ''}Puedes corregir los datos y
                    enviarla otra vez.
                  </Alerta>
                )}
                <FormularioSolicitud previa={s} />
              </div>
            </>
          )}
        </Tarjeta>

        <Tarjeta>
          <CabeceraTarjeta titulo="Qué obtienes" />
          <ul className="grid gap-4 px-5 py-5 text-sm sm:px-6">
            {VENTAJAS.map(({ icono: Icono, texto }) => (
              <li key={texto} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-borde bg-hundida text-marca">
                  <Icono className="size-4" aria-hidden="true" />
                </span>
                <span className="text-tinta-suave">{texto}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-borde px-5 py-4 text-xs text-tinta-tenue sm:px-6">
            Tus servicios actuales como cliente se mantienen igual.
          </p>
        </Tarjeta>
      </div>
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-tinta-tenue">{etiqueta}</dt>
      <dd className="break-words">{valor || '—'}</dd>
    </div>
  );
}
