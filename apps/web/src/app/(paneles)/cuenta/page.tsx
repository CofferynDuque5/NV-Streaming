import { Receipt } from 'lucide-react';
import type { Metadata } from 'next';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Mis servicios' };

export default async function MisServicios() {
  const sesion = await requerirSesion({ roles: ['cliente'] });
  return (
    <>
      <CabeceraPagina
        titulo={`Hola, ${sesion.usuario.nombre.split(' ')[0]}`}
        descripcion="Aquí verás tus servicios activos, renovaciones y pagos."
      />
      <Tarjeta>
        <EstadoVacio
          icono={Receipt}
          titulo="Todavía no tienes servicios"
          accion={
            <BotonEnlace href="/ajustes" variante="secundario">
              Proteger mi cuenta
            </BotonEnlace>
          }
        >
          El catálogo abrirá pronto y te avisaremos por correo. Mientras tanto, puedes activar la
          verificación en dos pasos.
        </EstadoVacio>
      </Tarjeta>
    </>
  );
}
