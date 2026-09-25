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

export const metadata: Metadata = { title: 'Mis accesos' };

export default async function MisAccesos() {
  await requerirSesion({ roles: ['cliente'] });
  const { datos } = await leerApi<AccesoServicio[]>('/mi/accesos');
  const accesos = datos ?? [];

  return (
    <>
      <CabeceraPagina
        titulo="Mis accesos"
        descripcion="Cómo activar cada servicio que pagaste: pasos, enlace o código de activación oficial. El código solo se muestra aquí, cuando lo pides."
      />
      {!datos && (
        <Alerta tono="peligro" titulo="No pudimos cargar tus accesos">
          Recarga la página en unos segundos.
        </Alerta>
      )}
      {datos && accesos.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            icono={KeyRound}
            titulo="Todavía no tienes accesos"
            accion={<BotonEnlace href="/cuenta/planes">Ver planes</BotonEnlace>}
          >
            Cuando confirmemos el pago de un servicio, aquí verás cómo activarlo.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <div className="grid gap-4">
          {accesos.map((a) => (
            <TarjetaAcceso key={a.id} acceso={a} vista="cliente" />
          ))}
        </div>
      )}
    </>
  );
}
