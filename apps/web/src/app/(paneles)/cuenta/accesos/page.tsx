import type { AccesoServicio } from '@nv/shared';
import { Zap } from 'lucide-react';
import type { Metadata } from 'next';
import { TarjetaAccesoCliente } from '@/componentes/cliente/accesos-cliente';
import {
  CabeceraCuenta,
  fechaLarga,
  NotaSeguridad,
  Vacio,
} from '@/componentes/cliente/piezas-cuenta';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { leerApi } from '@/lib/api-servidor';
import { MOTIVO_ENTREGA } from '@/lib/entregas';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Mis accesos' };

function detalle(a: AccesoServicio): string {
  const partes = [MOTIVO_ENTREGA[a.motivo]];
  if (a.entregadaEn) partes.push(`entregado el ${fechaLarga(a.entregadaEn)}`);
  const s = a.suscripcion;
  if (s?.venceEn && !['pendiente_pago', 'cancelada'].includes(s.estado))
    partes.push(`vence el ${fechaLarga(s.venceEn)}`);
  return partes.join(' · ');
}

export default async function MisAccesos() {
  await requerirSesion({ roles: ['cliente'] });
  const { datos } = await leerApi<AccesoServicio[]>('/mi/accesos');
  const accesos = datos ?? [];
  const nota = (
    <NotaSeguridad>
      Te damos un código o un enlace para activar el servicio en <b>tu propia cuenta</b>. Nunca te
      enviamos usuarios ni contraseñas, y nunca te los vamos a pedir.
    </NotaSeguridad>
  );

  return (
    <>
      <CabeceraCuenta
        titulo="Mis accesos"
        descripcion={
          accesos.length
            ? 'Tus códigos y enlaces para activar cada servicio.'
            : 'Aquí aparecen los códigos y enlaces de tus servicios cuando estén listos.'
        }
      />
      {!datos && (
        <Alerta tono="peligro" titulo="No pudimos cargar tus accesos">
          Recarga la página en unos segundos.
        </Alerta>
      )}
      {datos && accesos.length === 0 ? (
        <>
          <Vacio
            icono={<Zap className="size-5" aria-hidden="true" />}
            color="#22d3ee"
            titulo="Todavía no tienes accesos"
            accion={
              <BotonEnlace href="/catalogo" variante="secundario">
                Ver el catálogo
              </BotonEnlace>
            }
          >
            Aparecen aquí cuando pagas un servicio.
          </Vacio>
          {nota}
        </>
      ) : (
        <>
          {nota}
          {accesos.map((a) => (
            <TarjetaAccesoCliente
              key={a.id}
              acceso={a}
              detalle={detalle(a)}
              visto={a.vistaEn ? fechaLarga(a.vistaEn) : null}
              pagoPendiente={a.suscripcion?.estado === 'pendiente_pago'}
            />
          ))}
        </>
      )}
    </>
  );
}
