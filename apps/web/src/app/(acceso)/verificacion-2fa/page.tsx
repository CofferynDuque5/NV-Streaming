import { rutaInicio } from '@nv/shared';
import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BotonCerrarSesion } from '@/componentes/panel/boton-cerrar-sesion';
import { FormularioVerificacion } from '@/componentes/acceso/dos-pasos';
import { EncabezadoAcceso, OrbeAcceso, PanelAcceso } from '@/componentes/acceso/panel-acceso';
import { destinoSeguro } from '@/lib/destino';
import { obtenerSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Verificación en dos pasos' };

export default async function VerificacionDosPasos({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect('/ingresar');
  if (sesion.pendiente === 'configurar_2fa') redirect('/configurar-2fa');
  if (sesion.pendiente !== 'verificar_2fa') redirect(rutaInicio(sesion.usuario.rol));
  const { siguiente } = await searchParams;

  return (
    <PanelAcceso pie={<BotonCerrarSesion variante="enlace" />}>
      <EncabezadoAcceso
        icono={
          <OrbeAcceso color="#22d3ee" className="size-[3.25rem] text-[1.4rem]">
            <ShieldCheck />
          </OrbeAcceso>
        }
        titulo="Verificación en dos pasos"
        descripcion={
          'Escribe el código de 6 dígitos de tu app de autenticación. Si no tienes el teléfono, usa un código de respaldo.'
        }
      />
      <FormularioVerificacion destino={destinoSeguro(siguiente, sesion.usuario.rol)} />
    </PanelAcceso>
  );
}
