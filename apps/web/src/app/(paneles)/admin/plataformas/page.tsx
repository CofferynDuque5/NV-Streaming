import type { Inventario, ServicioInventario, ServicioPublico } from '@nv/shared';
import { FileUp } from 'lucide-react';
import type { Metadata } from 'next';
import { CrearPlataforma } from '@/componentes/admin/crear-plataforma';
import { GrillaPlataformas } from '@/componentes/admin/plataformas';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Plataformas' };

const CONTEO_VACIO: ServicioInventario['conteo'] = {
  cuentas: 0,
  caidas: 0,
  perfiles: 0,
  libres: 0,
  ocupados: 0,
  bloqueados: 0,
  respaldos: 0,
  porVencer: 0,
  vencidos: 0,
};

/** Como el Gestor: una tarjeta por plataforma con sus clientes, por vencer y vencidos. */
export default async function Plataformas() {
  const sesion = await requerirSesion({ permiso: 'cuentas.ver' });
  const puede = (p: (typeof sesion.permisos)[number]) => sesion.permisos.includes(p);
  const [{ datos }, catalogo] = await Promise.all([
    leerApi<Inventario>('/cuentas/inventario/resumen'),
    puede('catalogo.ver')
      ? leerApi<ServicioPublico[]>('/catalogo/servicios')
      : Promise.resolve({ datos: null }),
  ]);
  // Las plataformas recién creadas (sin cuentas todavía) también salen, para agregarles cuentas.
  const conCuentas = new Set(datos?.servicios.map((s) => s.servicio.id));
  const servicios: ServicioInventario[] = datos
    ? [
        ...datos.servicios,
        ...(catalogo.datos ?? [])
          .filter((s) => s.activo && !conCuentas.has(s.id))
          .map((s) => ({
            servicio: { id: s.id, nombre: s.nombre, logoUrl: s.imagen?.url ?? null },
            cuentas: [],
            conteo: CONTEO_VACIO,
          })),
      ]
    : [];
  return (
    <>
      <CabeceraPagina
        titulo="Plataformas"
        descripcion="Toca una plataforma para ver sus cuentas completas e individuales, agregar clientes a los perfiles libres, avisar datos, mover o cortar."
        acciones={
          <div className="flex flex-wrap gap-2">
            {sesion.usuario.rol === 'admin' && puede('cuentas.gestionar') && (
              <BotonEnlace href="/admin/cuentas/gestor" tamano="sm" variante="secundario">
                <FileUp className="size-4" aria-hidden /> Importar del Gestor
              </BotonEnlace>
            )}
            {puede('catalogo.gestionar') && <CrearPlataforma />}
          </div>
        }
      />
      {datos ? (
        <GrillaPlataformas servicios={servicios} />
      ) : (
        <Alerta tono="peligro">No pudimos cargar las plataformas. Recarga la página.</Alerta>
      )}
    </>
  );
}
