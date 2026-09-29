import type { Metadata } from 'next';
import { FaltaEnlace } from '@/componentes/acceso/falta-enlace';
import { FormularioRestablecer } from '@/componentes/acceso/formularios';
import { PanelAcceso } from '@/componentes/acceso/panel-acceso';

export const metadata: Metadata = { title: 'Nueva contraseña', referrer: 'no-referrer' };

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <PanelAcceso>
      {token ? (
        <FormularioRestablecer token={token} />
      ) : (
        <FaltaEnlace titulo="Tu contraseña nueva" />
      )}
    </PanelAcceso>
  );
}
