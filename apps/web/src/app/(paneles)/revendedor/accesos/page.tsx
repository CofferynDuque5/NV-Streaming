import type { AccesoServicio, PerfilDelCliente } from '@nv/shared';
import { etiquetaPerfil } from '@nv/shared';
import { Zap } from 'lucide-react';
import type { Metadata } from 'next';
import { TarjetaAccesoCliente } from '@/componentes/cliente/accesos-cliente';
import { TarjetaPerfilCliente } from '@/componentes/cliente/perfil-cliente';
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
  const [{ datos }, { datos: perfiles }] = await Promise.all([
    leerApi<AccesoServicio[]>('/revendedor/accesos'),
    leerApi<PerfilDelCliente[]>('/revendedor/perfiles'),
  ]);
  const accesos = datos ?? [];
  const listaPerfiles = perfiles ?? [];
  const nota = (
    <NotaSeguridad>
      Los códigos y enlaces se activan en <b>la cuenta propia de tu cliente</b>. Los perfiles y
      cuentas de NV traen su contrato listo para enviárselo. Entrégaselos solo a él.
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
      {listaPerfiles.map((p) => (
        <TarjetaPerfilCliente
          key={p.suscripcionId}
          perfil={p}
          ruta="/revendedor/perfiles"
          detalle={[
            `Para ${p.cliente?.nombre ?? 'tu cliente'}`,
            p.modo === 'completa'
              ? 'Cuenta completa'
              : etiquetaPerfil(p.tipo, p.perfil.numero, p.perfil.nombre),
            p.venceEn ? `vence el ${fechaLarga(p.venceEn)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      ))}
      {datos && accesos.length === 0 && listaPerfiles.length === 0 ? (
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
