import type { Metadata } from 'next';
import Link from 'next/link';
import { FormularioRegistro } from '@/componentes/acceso/formularios';
import { PanelAcceso } from '@/componentes/acceso/panel-acceso';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default async function Registro({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  const { siguiente } = await searchParams;
  const ingresar = siguiente ? `/ingresar?siguiente=${encodeURIComponent(siguiente)}` : '/ingresar';
  return (
    <PanelAcceso
      pie={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link href={ingresar} className="font-semibold text-cian hover:underline">
            Ingresa
          </Link>
        </>
      }
    >
      <FormularioRegistro siguiente={siguiente} />
    </PanelAcceso>
  );
}
