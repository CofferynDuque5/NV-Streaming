import type { Metadata } from 'next';
import Link from 'next/link';
import { FormularioIngreso } from '@/componentes/acceso/formulario-ingreso';
import { EncabezadoAcceso, PanelAcceso, PestanasAcceso } from '@/componentes/acceso/panel-acceso';

export const metadata: Metadata = { title: 'Ingresar' };

export default async function Ingresar({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  const { siguiente } = await searchParams;
  const registro = siguiente ? `/registro?siguiente=${encodeURIComponent(siguiente)}` : '/registro';
  return (
    <PanelAcceso
      pie={
        <>
          ¿No tienes cuenta?{' '}
          <Link href={registro} className="font-semibold text-cian hover:underline">
            Crea una gratis
          </Link>
        </>
      }
    >
      <PestanasAcceso activa="ingresar" siguiente={siguiente} />
      <EncabezadoAcceso
        titulo="Qué bueno verte"
        descripcion="Ingresa para ver tus servicios, pagos y billetera."
      />
      <FormularioIngreso siguiente={siguiente} />
    </PanelAcceso>
  );
}
