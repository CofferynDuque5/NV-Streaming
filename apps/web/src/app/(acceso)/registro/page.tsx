import { rutaInicio } from '@nv/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FormularioRegistro } from '@/componentes/acceso/formularios';
import { PanelAcceso } from '@/componentes/acceso/panel-acceso';
import { obtenerSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default async function Registro({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  // Con la sesión ya iniciada no tiene sentido volver a entrar: a su panel.
  const sesion = await obtenerSesion();
  if (sesion && !sesion.pendiente) redirect(rutaInicio(sesion.usuario.rol));
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
