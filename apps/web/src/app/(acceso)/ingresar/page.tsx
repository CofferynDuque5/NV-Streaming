import { rutaInicio } from '@nv/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FormularioIngreso } from '@/componentes/acceso/formulario-ingreso';
import { EncabezadoAcceso, PanelAcceso, PestanasAcceso } from '@/componentes/acceso/panel-acceso';
import { obtenerSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Ingresar' };

export default async function Ingresar({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  // Con la sesión ya iniciada no tiene sentido volver a entrar: a su panel.
  const sesion = await obtenerSesion();
  if (sesion && !sesion.pendiente) redirect(rutaInicio(sesion.usuario.rol));
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
