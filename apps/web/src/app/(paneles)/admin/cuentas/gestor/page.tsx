import type { LoteGestorPublico, PlanPublico, ServicioPublico } from '@nv/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ImportarGestor } from '@/componentes/admin/importar-gestor';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Importar del Gestor' };

export default async function ImportarDelGestor() {
  const sesion = await requerirSesion({ permiso: 'cuentas.gestionar' });
  const admin = sesion.usuario.rol === 'admin';
  const [servicios, planes, lotes] = admin
    ? await Promise.all([
        leerApi<ServicioPublico[]>('/catalogo/servicios'),
        leerApi<PlanPublico[]>('/catalogo/planes'),
        leerApi<LoteGestorPublico[]>('/cuentas/gestor/lotes'),
      ])
    : [null, null, null];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Link
        href="/admin/plataformas"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-tinta-suave hover:text-tinta"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Plataformas
      </Link>
      <CabeceraPagina
        titulo="Importar del Gestor"
        descripcion="Pasa las cuentas, perfiles y clientes del Gestor viejo al panel, plataforma por plataforma. Primero se simula y se cuadra; cada importación se puede deshacer."
      />
      {!admin ? (
        <Alerta tono="aviso">Solo la administración puede importar el Gestor.</Alerta>
      ) : (
        <ImportarGestor
          servicios={(servicios?.datos ?? []).map((s) => ({
            id: s.id,
            nombre: s.nombre,
            conLogo: !!s.imagen,
          }))}
          planes={planes?.datos ?? []}
          lotes={lotes?.datos ?? []}
        />
      )}
    </div>
  );
}
