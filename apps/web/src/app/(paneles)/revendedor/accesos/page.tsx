import type { AccesoServicio } from '@nv/shared';
import { KeyRound } from 'lucide-react';
import type { Metadata } from 'next';
import { TarjetaAcceso } from '@/componentes/accesos';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Accesos de clientes' };

export default async function AccesosClientes() {
  await requerirSesion({ roles: ['revendedor'] });
  const { datos } = await leerApi<AccesoServicio[]>('/revendedor/accesos');
  const accesos = datos ?? [];

  return (
    <>
      <CabeceraPagina
        titulo="Accesos de clientes"
        descripcion="Las activaciones de las compras que hiciste para tus clientes. Muestra el código solo cuando vayas a entregárselo a tu cliente."
      />
      {!datos && (
        <Alerta tono="peligro" titulo="No pudimos cargar los accesos">
          Recarga la página en unos segundos.
        </Alerta>
      )}
      {datos && accesos.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            icono={KeyRound}
            titulo="Todavía no hay accesos"
            accion={<BotonEnlace href="/revendedor/catalogo">Ver catálogo mayorista</BotonEnlace>}
          >
            Cuando compres una activación para un cliente, aquí verás cómo activarla.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <div className="grid gap-4">
          {accesos.map((a) => (
            <TarjetaAcceso key={a.id} acceso={a} vista="revendedor" />
          ))}
        </div>
      )}
    </>
  );
}
