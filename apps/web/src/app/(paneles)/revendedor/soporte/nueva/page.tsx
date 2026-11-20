import type { Metadata } from 'next';
import { CabeceraCuenta, Volver } from '@/componentes/cliente/piezas-cuenta';
import { NuevaSolicitud } from '@/componentes/cliente/soporte';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Nueva solicitud' };

/** El revendedor escribe al equipo: sin elegir servicio (los suyos son de sus clientes). */
export default async function NuevaSolicitudRevendedor({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  await requerirSesion({ roles: ['revendedor'] });
  const { categoria } = await searchParams;
  return (
    <>
      <Volver href="/revendedor/soporte">Mis solicitudes</Volver>
      <CabeceraCuenta
        titulo="Nueva solicitud"
        descripcion="Te respondemos por aquí y te avisamos por correo."
      />
      <NuevaSolicitud servicios={[]} categoria={categoria} base="/revendedor/soporte" />
    </>
  );
}
