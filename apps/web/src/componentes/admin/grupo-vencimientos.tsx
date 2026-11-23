import type { SuscripcionPublica } from '@nv/shared';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Vencimiento } from '@/componentes/admin/piezas-crm';
import { EstadoSuscripcionInsignia } from '@/componentes/ui/estado';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';

/** Agrupa por plataforma (servicio), en orden alfabético. */
function porServicio(lista: SuscripcionPublica[]) {
  const mapa = new Map<string, SuscripcionPublica[]>();
  for (const s of lista) mapa.set(s.plan.servicio, [...(mapa.get(s.plan.servicio) ?? []), s]);
  return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
}

/**
 * Lista sencilla de suscripciones por plataforma, cada una con su enlace para
 * renovar o ver la factura abierta (Esta semana, vencidas sin perfil).
 */
export function GrupoVencimientos({
  titulo,
  descripcion,
  lista,
}: {
  titulo: string;
  descripcion: string;
  lista: SuscripcionPublica[];
}) {
  if (lista.length === 0) return null;
  return (
    <Tarjeta>
      <section aria-label={titulo}>
        <CabeceraTarjeta titulo={`${titulo} · ${lista.length}`} descripcion={descripcion} />
        {porServicio(lista).map(([servicio, filas]) => (
          <div key={servicio} className="border-b border-borde last:border-b-0">
            <h3 className="bg-white/[0.02] px-5 py-2 text-xs font-semibold tracking-wide text-tinta-suave uppercase sm:px-6">
              {servicio} · {filas.length}
            </h3>
            <ul className="divide-y divide-borde">
              {filas.map((s) => (
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
  );
}
