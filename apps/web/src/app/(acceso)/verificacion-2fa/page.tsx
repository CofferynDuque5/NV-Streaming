import { rutaInicio } from '@nv/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BotonCerrarSesion } from '@/componentes/panel/boton-cerrar-sesion';
import { FormularioVerificacion } from '@/componentes/acceso/dos-pasos';
import { PanelAcceso } from '@/componentes/acceso/panel-acceso';
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
    <PanelAcceso
      titulo="Verifica que eres tú"
      descripcion="Abre tu aplicación de autenticación y escribe el código de NV Streaming."
      pie={<BotonCerrarSesion variante="enlace" />}
    >
      <FormularioVerificacion destino={destinoSeguro(siguiente, sesion.usuario.rol)} />
    </PanelAcceso>
  );
}
