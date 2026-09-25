import type { Metadata } from 'next';
import Link from 'next/link';
import { FormularioRecuperar } from '@/componentes/acceso/formularios';
import { PanelAcceso } from '@/componentes/acceso/panel-acceso';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export default function Recuperar() {
  return (
    <PanelAcceso
      titulo="Recupera tu contraseña"
      descripcion="Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una nueva."
      pie={
        <Link href="/ingresar" className="font-medium text-marca hover:underline">
          Volver a ingresar
        </Link>
      }
    >
      <FormularioRecuperar />
    </PanelAcceso>
  );
}
