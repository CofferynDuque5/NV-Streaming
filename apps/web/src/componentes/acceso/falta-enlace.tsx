import { Link2Off } from 'lucide-react';
import { Alerta } from '@/componentes/ui/alerta';
import { EncabezadoAcceso, OrbeAcceso } from './panel-acceso';

/** Página de acceso abierta sin el enlace del correo (falta el token). */
export function FaltaEnlace({ titulo }: { titulo: string }) {
  return (
    <>
      <EncabezadoAcceso
        icono={
          <OrbeAcceso color="#f87171" className="size-[3.25rem] text-[1.4rem]">
            <Link2Off />
          </OrbeAcceso>
        }
        titulo={titulo}
      />
      <Alerta tono="peligro" titulo="Falta el enlace">
        Abre esta página desde el enlace que te enviamos por correo.
      </Alerta>
    </>
  );
}
