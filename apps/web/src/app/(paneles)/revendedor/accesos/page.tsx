import type { AccesoServicio } from '@nv/shared';
import { Zap } from 'lucide-react';
import type { Metadata } from 'next';
import { TarjetaAccesoCliente } from '@/componentes/cliente/accesos-cliente';
import { fechaLarga, NotaSeguridad, Vacio } from '@/componentes/cliente/piezas-cuenta';
import { CabeceraPanel } from '@/componentes/revendedor/panel';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { leerApi } from '@/lib/api-servidor';
import { MOTIVO_ENTREGA } from '@/lib/entregas';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Accesos de clientes' };

/** «Para María · Alta · 3 de octubre». */
function detalle(a: AccesoServicio): string {
  const partes = [`Para ${a.cliente?.nombre ?? 'tu cliente'}`, MOTIVO_ENTREGA[a.motivo]];
  if (a.entregadaEn) partes.push(fechaLarga(a.entregadaEn));
  return partes.join(' · ');
}

export default async function AccesosClientes() {
  await requerirSesion({ roles: ['revendedor'] });
  const { datos } = await leerApi<AccesoServicio[]>('/revendedor/accesos');
  const accesos = datos ?? [];
  const nota = (
    <NotaSeguridad>
      Son códigos o enlaces para activar el servicio en <b>la cuenta propia de tu cliente</b>.
      Entrégaselos solo a él. Nunca entregamos usuarios ni contraseñas.
    </NotaSeguridad>
  );

  return (
    <>
      <CabeceraPanel
        titulo="Accesos de clientes"
        descripcion={
          accesos.length
            ? 'Los códigos y enlaces para entregar a cada cliente.'
            : 'Aquí aparecen los códigos y enlaces de lo que actives.'
        }
      />
      {!datos && (
        <Alerta tono="peligro" titulo="No pudimos cargar los accesos">
          Recarga la página en unos segundos.
        </Alerta>
      )}
      {nota}
      {datos && accesos.length === 0 ? (
        <Vacio
          icono={<Zap className="size-5" aria-hidden="true" />}
          color="#22d3ee"
          titulo="Todavía no hay accesos"
          accion={
            <BotonEnlace href="/revendedor/catalogo" variante="secundario">
              Nueva venta
            </BotonEnlace>
          }
        >
          Cuando vendas una activación, aquí verás cómo la activa tu cliente.
        </Vacio>
      ) : (
        accesos.map((a) => (
          <TarjetaAccesoCliente
            key={a.id}
            acceso={a}
            vista="revendedor"
            detalle={detalle(a)}
            visto={a.vistaEn ? fechaLarga(a.vistaEn) : null}
            pagoPendiente={false}
          />
        ))
      )}
    </>
  );
}
