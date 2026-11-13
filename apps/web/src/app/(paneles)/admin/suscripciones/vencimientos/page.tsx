import type { SuscripcionPublica, VencimientosEquipo } from '@nv/shared';
import { CalendarCheck, ChevronRight, List } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Vencimiento } from '@/componentes/admin/piezas-crm';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoSuscripcionInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Vencimientos y cortes' };

const GRUPOS: { clave: keyof VencimientosEquipo; titulo: string; descripcion: string }[] = [
  {
    clave: 'vencidas',
    titulo: 'Vencidas sin resolver',
    descripcion:
      'En gracia, suspendidas o vencidas hace menos de 30 días. Renueva desde hoy o corta el acceso.',
  },
  {
    clave: 'hoy',
    titulo: 'Vencen hoy',
    descripcion: 'Avísales hoy para que no pierdan el acceso.',
  },
  { clave: 'manana', titulo: 'Vencen mañana', descripcion: 'Buen momento para enviar el cobro.' },
  { clave: 'semana', titulo: 'Esta semana', descripcion: 'Del pasado mañana a 7 días.' },
];

/** Agrupa por plataforma (servicio), en orden alfabético. */
function porServicio(lista: SuscripcionPublica[]) {
  const mapa = new Map<string, SuscripcionPublica[]>();
  for (const s of lista) mapa.set(s.plan.servicio, [...(mapa.get(s.plan.servicio) ?? []), s]);
  return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
}

export default async function Vencimientos() {
  await requerirSesion({ permiso: 'suscripciones.ver' });
  const { datos } = await leerApi<VencimientosEquipo>('/suscripciones/vencimientos');
  const total = datos ? GRUPOS.reduce((n, g) => n + datos[g.clave].length, 0) : 0;

  return (
    <>
      <CabeceraPagina
        titulo="Vencimientos y cortes"
        descripcion="Lo que vence hoy, mañana y esta semana, y lo vencido que falta renovar o cortar, por plataforma."
        acciones={
          <BotonEnlace href="/admin/suscripciones" variante="secundario">
            <List className="size-4" aria-hidden="true" />
            Todas las suscripciones
          </BotonEnlace>
        }
      />
      {!datos ? (
        <Alerta tono="peligro">No pudimos cargar los vencimientos. Recarga la página.</Alerta>
      ) : total === 0 ? (
        <Tarjeta>
          <EstadoVacio icono={CalendarCheck} titulo="Nada vence esta semana">
            No hay suscripciones vencidas ni por vencer en los próximos 7 días.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <div className="grid gap-5">
          {GRUPOS.filter((g) => datos[g.clave].length > 0).map((g) => (
            <Tarjeta key={g.clave}>
              <section aria-label={g.titulo}>
                <CabeceraTarjeta
                  titulo={`${g.titulo} · ${datos[g.clave].length}`}
                  descripcion={g.descripcion}
                />
                {porServicio(datos[g.clave]).map(([servicio, lista]) => (
                  <div key={servicio} className="border-b border-borde last:border-b-0">
                    <h3 className="bg-white/[0.02] px-5 py-2 text-xs font-semibold tracking-wide text-tinta-suave uppercase sm:px-6">
                      {servicio} · {lista.length}
                    </h3>
                    <ul className="divide-y divide-borde">
                      {lista.map((s) => (
                        <li key={s.id}>
                          <Link
                            href={`/admin/suscripciones/${s.id}`}
                            className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 hover:bg-white/[0.03] sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_auto_auto_auto] sm:px-6"
                          >
                            <span className="min-w-0 truncate font-medium">{s.cliente.nombre}</span>
                            <span className="hidden min-w-0 truncate text-sm text-tinta-suave sm:block">
                              {s.plan.nombre}
                            </span>
                            <span className="text-sm">
                              <Vencimiento iso={s.venceEn} />
                            </span>
                            <span className="hidden sm:block">
                              <EstadoSuscripcionInsignia estado={s.estado} />
                            </span>
                            <span className="hidden items-center gap-1 text-sm text-marca sm:flex">
                              {s.facturaAbierta ? `Factura ${s.facturaAbierta.numero}` : 'Renovar'}
                              <ChevronRight className="size-4" aria-hidden="true" />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            </Tarjeta>
          ))}
        </div>
      )}
    </>
  );
}
