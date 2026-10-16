import type { Pagina, SuscripcionPublica } from '@nv/shared';
import type { Metadata } from 'next';
import { CabeceraCuenta, Volver } from '@/componentes/cliente/piezas-cuenta';
import { NuevaSolicitud } from '@/componentes/cliente/soporte';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Nueva solicitud' };

export default async function NuevaSolicitudPagina({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  await requerirSesion({ roles: ['cliente'] });
  const [{ datos }, { categoria }] = await Promise.all([
    leerApi<Pagina<SuscripcionPublica>>('/mi/suscripciones?porPagina=50'),
    searchParams,
  ]);
  const servicios = (datos?.elementos ?? []).map((s) => ({
    id: s.id,
    nombre: `${s.plan.servicio} · ${s.plan.nombre}`,
  }));
  return (
    <>
      <Volver href="/cuenta/soporte">Mis solicitudes</Volver>
      <CabeceraCuenta
        titulo="Nueva solicitud"
        descripcion="Te respondemos por aquí y te avisamos por correo."
      />
      <NuevaSolicitud servicios={servicios} categoria={categoria} />
    </>
  );
}
