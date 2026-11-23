'use client';

import { type EntregaWebServicio, type LugarEntregaWeb, TEXTOS_PLATAFORMA } from '@nv/shared';
import { CheckCheck, CircleCheck, CircleSlash, PackageCheck, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { refrescarExistencias } from '@/app/(paneles)/admin/sitio/acciones';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { llamarApi } from '@/lib/api-cliente';
import { formatearDia } from '@/lib/formato';

/** Qué recibe el cliente: un perfil de una cuenta compartida, la cuenta entera o el cupo titular. */
function queEs(l: LugarEntregaWeb, tipo: EntregaWebServicio['tipo']): string {
  if (l.individual) return 'Cuenta individual';
  if (tipo === 'familiar') return 'Cuenta principal (titular)';
  return `${TEXTOS_PLATAFORMA[tipo].lugar} compartido`;
}

function Lugar({
  l,
  tipo,
  destacado = false,
}: {
  l: LugarEntregaWeb;
  tipo: EntregaWebServicio['tipo'];
  destacado?: boolean;
}) {
  const textos = TEXTOS_PLATAFORMA[tipo];
  return (
    <div className="grid min-w-0 gap-0.5">
      <Link
        href={`/admin/cuentas/${l.cuentaId}`}
        className={
          destacado
            ? 'truncate font-mono text-base font-semibold hover:text-marca'
            : 'truncate font-mono text-sm hover:text-marca'
        }
      >
        {l.pista}
      </Link>
      <span className="text-xs text-tinta-tenue">
        {queEs(l, tipo)} · {textos.lugar} {l.numero}
        {l.nombre && l.nombre !== `${textos.lugar} ${l.numero}` ? ` (${l.nombre})` : ''} · la cuenta
        vence {formatearDia(l.facturaEn)}
        {textos.usaPin ? (l.conPin ? ' · con PIN' : ' · sin PIN') : ''}
      </span>
    </div>
  );
}

/**
 * Entrega web: por plataforma, el lugar que recibiría quien compre ahora, los
 * que siguen (mismo orden que la entrega automática) y lo libre que falta
 * revisar. Solo se entrega lo que el equipo marcó como apto.
 */
export function EntregaWeb({
  servicios,
  puedeGestionar,
}: {
  servicios: EntregaWebServicio[];
  puedeGestionar: boolean;
}) {
  const [busqueda, setBusqueda] = useState('');
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? servicios.filter((s) => s.servicio.toLowerCase().includes(q)) : servicios;
  }, [busqueda, servicios]);
  const agotados = servicios.filter((s) => s.aptos === 0).length;
  const porRevisar = servicios.reduce((n, s) => n + s.porRevisar.length, 0);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-tenue"
            aria-hidden="true"
          />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.currentTarget.value)}
            placeholder="Buscar plataforma"
            aria-label="Buscar plataforma"
            className="h-11 w-full rounded-xl border border-borde bg-hundida pr-3 pl-9 text-sm"
          />
        </div>
        <p className="text-sm text-tinta-suave">
          {agotados > 0 && (
            <>
              <b className="text-aviso">{agotados}</b> {agotados === 1 ? 'agotada' : 'agotadas'} en
              la web ·{' '}
            </>
          )}
          <b className="text-tinta">{porRevisar}</b> por revisar
        </p>
      </div>
      {visibles.map((s) => (
        <ServicioEntrega key={s.servicioId} s={s} puedeGestionar={puedeGestionar} />
      ))}
    </div>
  );
}

function ServicioEntrega({
  s,
  puedeGestionar,
}: {
  s: EntregaWebServicio;
  puedeGestionar: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textos = TEXTOS_PLATAFORMA[s.tipo];
  const [ahora, ...despues] = s.siguientes;

  async function marcar(clave: string, perfilIds: string[], apto: boolean) {
    setOcupado(clave);
    setError(null);
    const r = await llamarApi('POST', '/cuentas/entrega-web/aptos', { perfilIds, apto });
    setOcupado(null);
    if (!r.ok) return setError(r.error.mensaje);
    // La tienda deja de mostrar «agotado» (o lo muestra) en la siguiente visita.
    await refrescarExistencias().catch(() => false);
    router.refresh();
  }

  // Lo que falta revisar, junto por cuenta (para marcar la cuenta entera de una vez).
  const porCuenta = useMemo(() => {
    const m = new Map<string, LugarEntregaWeb[]>();
    for (const l of s.porRevisar) m.set(l.cuentaId, [...(m.get(l.cuentaId) ?? []), l]);
    return [...m.values()];
  }, [s.porRevisar]);

  return (
    <Tarjeta className="min-w-0">
      <CabeceraTarjeta
        titulo={s.servicio}
        descripcion={
          <span className="flex flex-wrap gap-2">
            <Insignia tono={s.aptos > 0 ? 'exito' : 'aviso'}>
              {s.aptos > 0
                ? `${s.aptos} ${s.aptos === 1 ? 'apto' : 'aptos'} para vender`
                : 'Agotado en la web'}
            </Insignia>
            {s.porRevisar.length > 0 && (
              <Insignia tono="neutro">{s.porRevisar.length} por revisar</Insignia>
            )}
          </span>
        }
      />
      <div className="grid gap-4 px-5 py-4 sm:px-6">
        {error && <Alerta tono="peligro">{error}</Alerta>}
        {ahora ? (
          <section className="grid gap-2" aria-label="Se entregaría ahora">
            <h3 className="text-xs font-semibold tracking-wide text-tinta-tenue uppercase">
              Si alguien compra ahora recibe
            </h3>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-exito/30 bg-exito-suave/40 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <PackageCheck className="size-5 shrink-0 text-exito" aria-hidden="true" />
                <Lugar l={ahora} tipo={s.tipo} destacado />
              </div>
              {puedeGestionar && (
                <Boton
                  tamano="sm"
                  variante="fantasma"
                  icono={<CircleSlash className="size-3.5" />}
                  cargando={ocupado === ahora.perfilId}
                  onClick={() => void marcar(ahora.perfilId, [ahora.perfilId], false)}
                >
                  Quitar de la web
                </Boton>
              )}
            </div>
            {despues.length > 0 && (
              <>
                <h3 className="mt-2 text-xs font-semibold tracking-wide text-tinta-tenue uppercase">
                  Después siguen
                </h3>
                <ol className="grid gap-2">
                  {despues.map((l, i) => (
                    <li
                      key={l.perfilId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-5 text-right text-sm text-tinta-tenue tabular-nums">
                          {i + 2}.
                        </span>
                        <Lugar l={l} tipo={s.tipo} />
                      </div>
                      {puedeGestionar && (
                        <Boton
                          tamano="sm"
                          variante="fantasma"
                          icono={<CircleSlash className="size-3.5" />}
                          cargando={ocupado === l.perfilId}
                          onClick={() => void marcar(l.perfilId, [l.perfilId], false)}
                        >
                          Quitar
                        </Boton>
                      )}
                    </li>
                  ))}
                </ol>
                {s.aptos > s.siguientes.length && (
                  <p className="text-xs text-tinta-tenue">
                    Y {s.aptos - s.siguientes.length} más aptos después.
                  </p>
                )}
              </>
            )}
          </section>
        ) : (
          <Alerta tono="aviso">
            No hay {textos.lugares.toLowerCase()} revisados y aptos: la web lo muestra agotado.
            {s.porRevisar.length > 0
              ? ' Revisa los de abajo y márcalos como aptos.'
              : ' Agrega una cuenta o libera un lugar.'}
          </Alerta>
        )}

        {s.porRevisar.length > 0 && (
          <section className="grid gap-2" aria-label="Por revisar">
            <h3 className="text-xs font-semibold tracking-wide text-tinta-tenue uppercase">
              Por revisar (libres y vigentes, la web no los entrega)
            </h3>
            {porCuenta.map((grupo) => {
              const c = grupo[0]!;
              return (
                <div key={c.cuentaId} className="grid gap-1 rounded-xl border border-borde p-2">
                  {grupo.length > 1 && puedeGestionar && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                      <span className="font-mono text-sm">{c.pista}</span>
                      <Boton
                        tamano="sm"
                        variante="secundario"
                        icono={<CheckCheck className="size-3.5" />}
                        cargando={ocupado === c.cuentaId}
                        onClick={() =>
                          void marcar(
                            c.cuentaId,
                            grupo.map((l) => l.perfilId),
                            true,
                          )
                        }
                      >
                        Toda la cuenta apta ({grupo.length})
                      </Boton>
                    </div>
                  )}
                  <ul className="grid gap-1">
                    {grupo.map((l) => (
                      <li
                        key={l.perfilId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-1 py-1.5"
                      >
                        <Lugar l={l} tipo={s.tipo} />
                        {puedeGestionar && (
                          <Boton
                            tamano="sm"
                            variante="secundario"
                            icono={<CircleCheck className="size-3.5" />}
                            cargando={ocupado === l.perfilId}
                            onClick={() => void marcar(l.perfilId, [l.perfilId], true)}
                          >
                            Apto
                          </Boton>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </Tarjeta>
  );
}
