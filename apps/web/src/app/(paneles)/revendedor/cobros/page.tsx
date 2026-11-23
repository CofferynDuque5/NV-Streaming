import type { VencimientosCortes } from '@nv/shared';
import type { Metadata } from 'next';
import { CobrosRevendedor } from '@/componentes/revendedor/cobros';
import { CabeceraPanel, Nota, SinResumen } from '@/componentes/revendedor/panel';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Cobros' };

/**
 * Cobros del revendedor: a quién le vence hoy o mañana y quién ya venció, con
 * el mensaje de cobro listo para copiar o enviar por WhatsApp o Telegram.
 */
export default async function PaginaCobros({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirSesion({ roles: ['revendedor'] });
  const seccion = (await searchParams).seccion === 'cortes' ? 'cortes' : 'vencimientos';
  const { estado, datos } = await leerApi<VencimientosCortes>('/revendedor/cobros');
  const cabecera = (
    <CabeceraPanel
      titulo="Cobros"
      descripcion="Tus clientes que vencen hoy y mañana, y los que ya vencieron. Cóbrales con el mensaje listo."
    />
  );
  if (!datos) {
    return (
      <>
        {cabecera}
        <SinResumen estado={estado} />
      </>
    );
  }
  return (
    <>
      {cabecera}
      <CobrosRevendedor key={seccion} seccion={seccion} datos={datos} />
      <Nota>
        Al copiar o enviar el mensaje queda marcado como cobrado, y NV Streaming lo ve. Para renovar
        con tu saldo, ve a Renovaciones.
      </Nota>
    </>
  );
}
