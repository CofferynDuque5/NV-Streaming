import type { ServicioPublico } from '@nv/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ImportarCuentas } from '@/componentes/admin/importar-cuentas';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Verificar con TXT o CSV' };

export default async function VerificarCuentas() {
  const sesion = await requerirSesion({ permiso: 'cuentas.gestionar' });
  const servicios = sesion.permisos.includes('catalogo.ver')
    ? ((await leerApi<ServicioPublico[]>('/catalogo/servicios')).datos ?? [])
    : [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Link
        href="/admin/cuentas"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-tinta-suave hover:text-tinta"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Cuentas de servicio
      </Link>
      <CabeceraPagina
        titulo="Verificar con TXT o CSV"
        descripcion="Compara la lista de tu proveedor con tus cuentas: cuáles faltan, cuáles cambiaron de fecha o de clave y cuáles ya no vienen. Luego importa las nuevas y actualiza las que elijas."
      />
      {servicios.length === 0 ? (
        <Alerta tono="aviso">
          Primero crea el servicio en el catálogo, o pide permiso para ver el catálogo.
        </Alerta>
      ) : (
        <ImportarCuentas servicios={servicios.map((s) => ({ id: s.id, nombre: s.nombre }))} />
      )}
    </div>
  );
}
