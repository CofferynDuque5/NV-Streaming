import type { Metadata } from 'next';
import { ConfirmarCorreo } from '@/componentes/acceso/formularios';
import { PanelAcceso } from '@/componentes/acceso/panel-acceso';
import { Alerta } from '@/componentes/ui/alerta';

export const metadata: Metadata = { title: 'Confirmar correo', referrer: 'no-referrer' };

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <PanelAcceso titulo="Confirma tu correo">
      {token ? (
        <ConfirmarCorreo token={token} />
      ) : (
        <Alerta tono="peligro" titulo="Falta el enlace">
          Abre esta página desde el enlace que te enviamos por correo.
        </Alerta>
      )}
    </PanelAcceso>
  );
}
