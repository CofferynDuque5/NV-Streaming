import type { AccesoServicio, PerfilDelCliente } from '@nv/shared';
import { Zap } from 'lucide-react';
import type { Metadata } from 'next';
import { TarjetaAccesoCliente } from '@/componentes/cliente/accesos-cliente';
import { TarjetaPerfilCliente } from '@/componentes/cliente/perfil-cliente';
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
  const [{ datos }, { datos: perfiles }] = await Promise.all([
    leerApi<AccesoServicio[]>('/mi/accesos'),
    leerApi<PerfilDelCliente[]>('/mi/perfiles'),
  ]);
  const accesos = datos ?? [];
  const listaPerfiles = perfiles ?? [];
  const total = accesos.length + listaPerfiles.length;
  const nota = (
    <NotaSeguridad>
      Según el servicio te damos un código o un enlace para activarlo en tu propia cuenta, o el
      correo, la clave y el PIN de tu perfil en una cuenta que administramos. Son solo para ti: no
      los compartas. Nunca te vamos a pedir tu contraseña.
    </NotaSeguridad>
  );

  return (
    <>
      <CabeceraCuenta
        titulo="Mis accesos"
        descripcion={
          total
            ? 'Tus códigos, enlaces y perfiles de cada servicio.'
            : 'Aquí aparecen los códigos, enlaces y perfiles de tus servicios cuando estén listos.'
        }
      />
      {!datos && (
        <Alerta tono="peligro" titulo="No pudimos cargar tus accesos">
          Recarga la página en unos segundos.
        </Alerta>
      )}
      {datos && total === 0 ? (
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
          {listaPerfiles.map((p) => (
            <TarjetaPerfilCliente
              key={p.suscripcionId}
              perfil={p}
              detalle={[
                p.modo === 'completa' ? 'Cuenta completa' : p.perfil.nombre,
                p.venceEn && p.estado !== 'pendiente_pago'
                  ? `vence el ${fechaLarga(p.venceEn)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
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
