import type { PaginaCuentas, ServicioPublico } from '@nv/shared';
import { Boxes, Hourglass } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NuevaCuenta } from '@/componentes/admin/cuentas';
import { AnotarCuenta } from '@/componentes/admin/sin-anotar';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { diasHasta, formatearDia } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Cuentas sin anotar' };

/** Cuándo se libera, como en el Gestor: «Liberada», «Hoy» o «En N días». */
function Liberacion({ dia }: { dia: string | null }) {
  if (!dia) return <span className="text-tinta-tenue">Sin fecha de liberación</span>;
  const n = diasHasta(`${dia}T00:00:00-04:00`);
  const texto =
    n < 0 ? 'Liberada' : n === 0 ? 'Se libera hoy' : n === 1 ? 'En 1 día' : `En ${n} días`;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>Liberación {formatearDia(dia)}</span>
      <Insignia tono={n < 0 ? 'exito' : n === 0 ? 'aviso' : 'marca'}>{texto}</Insignia>
    </span>
  );
}

export default async function SinAnotar() {
  const sesion = await requerirSesion({ permiso: 'cuentas.ver' });
  const puedeGestionar = sesion.permisos.includes('cuentas.gestionar');
  const [{ datos }, servicios] = await Promise.all([
    leerApi<PaginaCuentas>('/cuentas?estado=en_espera&porPagina=100'),
    puedeGestionar && sesion.permisos.includes('catalogo.ver')
      ? leerApi<ServicioPublico[]>('/catalogo/servicios').then((r) => r.datos ?? [])
      : Promise.resolve([] as ServicioPublico[]),
  ]);
  // La que se libera antes, primero; las que no tienen fecha, al final.
  const cuentas = (datos?.elementos ?? []).toSorted((a, b) =>
    (a.liberacionEn ?? '9999').localeCompare(b.liberacionEn ?? '9999'),
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <CabeceraPagina
        titulo="Cuentas sin anotar"
        descripcion="Cuentas compradas que todavía no se pueden usar (geobloqueo, espera del proveedor). Quedan fuera del inventario y no se asignan hasta que las anotes."
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <BotonEnlace href="/admin/cuentas" variante="secundario">
              <Boxes className="size-4" aria-hidden="true" />
              Todas las cuentas
            </BotonEnlace>
            {puedeGestionar && (
              <NuevaCuenta
                servicios={servicios
                  .filter((s) => s.activo)
                  .map((s) => ({ id: s.id, nombre: s.nombre }))}
                enEspera
              />
            )}
          </div>
        }
      />
      {!datos ? (
        <Alerta tono="peligro">No pudimos cargar las cuentas. Recarga la página.</Alerta>
      ) : cuentas.length === 0 ? (
        <Tarjeta>
          <EstadoVacio icono={Hourglass} titulo="No hay cuentas sin anotar">
            Agrega aquí las cuentas que compraste y todavía esperan su liberación.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <Tarjeta>
          <CabeceraTarjeta
            titulo={
              cuentas.length === 1 ? '1 cuenta en espera' : `${cuentas.length} cuentas en espera`
            }
          />
          <ul className="divide-y divide-borde" aria-label="Cuentas sin anotar">
            {cuentas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                <div className="grid min-w-0 flex-1 basis-64 gap-1">
                  <p className="font-medium">
                    {c.servicio.nombre} ·{' '}
                    <Link href={`/admin/cuentas/${c.id}`} className="font-normal hover:text-marca">
                      {c.pista}
                    </Link>
                  </p>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-tinta-suave">
                    <Liberacion dia={c.liberacionEn} />
                    {c.facturaEn && <span>Vence {formatearDia(c.facturaEn)}</span>}
                    <span>
                      {c.modo === 'completa'
                        ? 'Cuenta completa'
                        : `${c.perfiles.total} ${c.perfiles.total === 1 ? 'perfil' : 'perfiles'}`}
                    </span>
                  </p>
                  {c.notas && <p className="text-sm text-tinta-tenue italic">{c.notas}</p>}
                </div>
                {puedeGestionar && <AnotarCuenta cuentaId={c.id} pista={c.pista} />}
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}
