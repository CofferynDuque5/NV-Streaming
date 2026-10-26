import type { AliasServicioPublico, PlanPublico } from '@nv/shared';
import type { Metadata } from 'next';
import { LectorPedidos } from '@/componentes/admin/lector-pedidos';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Leer pedido' };

export default async function LeerPedido() {
  await requerirSesion({ permiso: 'suscripciones.crear' });
  const [planes, alias] = await Promise.all([
    leerApi<PlanPublico[]>('/catalogo/planes'),
    leerApi<AliasServicioPublico[]>('/lector/alias'),
  ]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <CabeceraPagina
        titulo="Leer pedido"
        descripcion="Pega el mensaje del cliente o revendedor y te proponemos las suscripciones. Nada se crea hasta que lo confirmes."
      />
      <LectorPedidos
        planes={(planes.datos ?? []).filter((p) => p.activo)}
        aliasIniciales={alias.datos ?? []}
      />
    </div>
  );
}
