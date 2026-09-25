import { rutaInicio } from '@nv/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BotonCerrarSesion } from '@/componentes/panel/boton-cerrar-sesion';
import { ConfiguradorDosPasos } from '@/componentes/acceso/dos-pasos';
import { PanelAcceso } from '@/componentes/acceso/panel-acceso';
import { destinoSeguro } from '@/lib/destino';
import { obtenerSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Configura la verificación en dos pasos' };

export default async function ConfigurarDosPasos({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect('/ingresar');
  if (sesion.pendiente === 'verificar_2fa') redirect('/verificacion-2fa');
  if (sesion.pendiente !== 'configurar_2fa') redirect(rutaInicio(sesion.usuario.rol));
  const { siguiente } = await searchParams;

  return (
    <PanelAcceso
      titulo="Protege tu cuenta"
      descripcion={`Hola, ${sesion.usuario.nombre}. Tu rol exige verificación en dos pasos: además de tu contraseña, pediremos un código de tu teléfono.`}
      pie={<BotonCerrarSesion variante="enlace" />}
    >
      <ConfiguradorDosPasos destino={destinoSeguro(siguiente, sesion.usuario.rol)} />
    </PanelAcceso>
  );
}
