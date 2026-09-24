import type { Metadata } from 'next';
import Link from 'next/link';
import { FormularioRegistro } from '@/componentes/acceso/formularios';
import { PanelAcceso } from '@/componentes/acceso/panel-acceso';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default function Registro() {
  return (
    <PanelAcceso
      titulo="Crea tu cuenta"
      descripcion="Gestiona tus servicios, pagos y soporte desde un solo lugar."
      pie={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link href="/ingresar" className="font-medium text-marca hover:underline">
            Ingresa
          </Link>
        </>
      }
    >
      <FormularioRegistro />
    </PanelAcceso>
  );
}
