import type { Metadata } from 'next';
import Link from 'next/link';
import { PanelAcceso } from '@/componentes/acceso/panel-acceso';
import { FormularioIngreso } from '@/componentes/acceso/formulario-ingreso';

export const metadata: Metadata = { title: 'Ingresar' };

export default async function Ingresar({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  const { siguiente } = await searchParams;
  return (
    <PanelAcceso
      titulo="Te damos la bienvenida"
      descripcion="Ingresa a tu cuenta de NV Streaming."
      pie={
        <>
          ¿Aún no tienes cuenta?{' '}
          <Link href="/registro" className="font-medium text-marca hover:underline">
            Crea una gratis
          </Link>
        </>
      }
    >
      <FormularioIngreso siguiente={siguiente} />
    </PanelAcceso>
  );
}
