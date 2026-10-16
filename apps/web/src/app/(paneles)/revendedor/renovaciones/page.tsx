import { type ListaRenovaciones, listarRenovacionesSchema } from '@nv/shared';
import type { Metadata } from 'next';
import { AvisosRevendedor, CabeceraPanel, Nota, SinResumen } from '@/componentes/revendedor/panel';
import { Renovaciones } from '@/componentes/revendedor/renovaciones';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { bloqueoVenta, leerResumenRevendedor } from '@/lib/panel-revendedor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Renovaciones' };

export default async function PaginaRenovaciones({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirSesion({ roles: ['revendedor'] });
  const { filtro } = leerFiltro(listarRenovacionesSchema, await searchParams);
  const [{ estado, datos: r }, { datos: lista }] = await Promise.all([
    leerResumenRevendedor(),
    leerApi<ListaRenovaciones>(`/revendedor/renovaciones?filtro=${filtro.filtro}`),
  ]);
  const cabecera = (
    <CabeceraPanel
      titulo="Renovaciones"
      descripcion="Elige varios servicios y renuévalos de una vez con tu saldo."
    />
  );
  if (!r || !lista) {
    return (
      <>
        {cabecera}
        <SinResumen estado={r ? 500 : estado} />
      </>
    );
  }
  return (
    <>
      {cabecera}
      <AvisosRevendedor revendedor={r.revendedor} soloEstado />
      <Renovaciones
        // Al cambiar de filtro o tras renovar se empieza con la selección vacía.
        key={lista.filtro}
        lista={lista}
        saldoUsd={r.revendedor.saldoUsd}
        bloqueo={bloqueoVenta(r.revendedor)}
      />
      <Nota>
        Cada renovación se cobra de tu saldo al precio de tu nivel y suma un periodo al servicio de
        tu cliente.
      </Nota>
    </>
  );
}
