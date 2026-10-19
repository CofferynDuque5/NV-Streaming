import type { Metadata } from 'next';
import Link from 'next/link';
import { FormularioRecuperar } from '@/componentes/acceso/formularios';
import { PanelAcceso } from '@/componentes/acceso/panel-acceso';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export default function Recuperar() {
  return (
    <PanelAcceso
      pie={
        <Link href="/ingresar" className="font-semibold text-cian hover:underline">
          Volver a ingresar
        </Link>
      }
    >
      <FormularioRecuperar />
    </PanelAcceso>
  );
}
