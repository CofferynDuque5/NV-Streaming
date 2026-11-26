'use client';

import type { RevisionSpotifyPublica, SituacionSpotify } from '@nv/shared';
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { formatearDia, formatearFechaHora } from '@/lib/formato';
import { ErrorGeneral, useAccion } from './piezas';

type Tono = 'neutro' | 'exito' | 'aviso' | 'peligro';

const SITUACION: Record<SituacionSpotify, { texto: string; tono: Tono }> = {
  al_dia: { texto: 'Al día', tono: 'exito' },
  pago_fallido: { texto: 'Pago fallido', tono: 'peligro' },
  pausa: { texto: 'En pausa', tono: 'peligro' },
  caida: { texto: 'Sin Premium (caída)', tono: 'peligro' },
  desconocida: { texto: 'No se reconoció', tono: 'aviso' },
};

/** Cada cuánto se refresca la lista mientras el robot está revisando. */
const REFRESCO_MS = 15_000;

function Resultado({ c }: { c: RevisionSpotifyPublica }) {
  const r = c.revision;
  if (!r) return <span className="text-tinta-tenue">Sin revisar</span>;
  if (r.estado === 'en_cola') return <Insignia>En cola</Insignia>;
  if (r.estado === 'revisando') return <Insignia tono="aviso">Revisando…</Insignia>;
  if (r.estado === 'error') {
    return (
      <span className="grid gap-1">
        <Insignia tono="peligro">No se pudo revisar</Insignia>
        {r.ultimoError && <span className="text-xs text-peligro">{r.ultimoError}</span>}
      </span>
    );
  }
  const s = SITUACION[r.situacion ?? 'desconocida'];
  return (
    <span className="grid gap-1">
      <Insignia tono={s.tono}>{s.texto}</Insignia>
      {r.plan && <span className="text-xs text-tinta-tenue">{r.plan}</span>}
      {r.ultimoError && <span className="text-xs text-aviso">{r.ultimoError}</span>}
    </span>
  );
}

function Vencimiento({ c }: { c: RevisionSpotifyPublica }) {
  const r = c.revision;
  const visto = r?.estado === 'lista' ? r.vencimiento : null;
  return (
    <span className="grid gap-0.5">
      <span>
        <span className="text-xs text-tinta-tenue">Web: </span>
        {c.facturaEn ? formatearDia(c.facturaEn) : 'Sin fecha'}
      </span>
      {visto && (
        <span>
          <span className="text-xs text-tinta-tenue">Spotify: </span>
          {formatearDia(visto)}
        </span>
      )}
      {r?.estado === 'lista' && r.fechaAplicada && (
        <span className="text-xs text-exito">
          Actualizada{r.fechaAnterior ? ` (antes ${formatearDia(r.fechaAnterior)})` : ''}
        </span>
      )}
      {visto && !r?.fechaAplicada && visto !== c.facturaEn && r?.situacion !== 'al_dia' && (
        <span className="text-xs text-peligro">No se cambió: la cuenta no está al día</span>
      )}
    </span>
  );
}

function Cupos({ c }: { c: RevisionSpotifyPublica }) {
  const r = c.revision;
  if (r?.estado !== 'lista' || r.cuposTotal === null)
    return <span className="text-tinta-tenue">—</span>;
  if (r.cuposUsados === null) {
    return <span className="text-tinta-tenue">De {r.cuposTotal}: no se pudo contar</span>;
  }
  const libres = Math.max(0, r.cuposTotal - r.cuposUsados);
  return (
    <span className="grid gap-0.5">
      <span className="tabular-nums">
        {r.cuposUsados}/{r.cuposTotal} ocupados
      </span>
      <span className={libres ? 'text-xs text-exito' : 'text-xs text-aviso'}>
        {libres ? `${libres} libre${libres === 1 ? '' : 's'}` : 'Llena'}
      </span>
    </span>
  );
}

/** Lista de cuentas Spotify del dominio propio con el botón para revisarlas ahora. */
export function RevisionSpotify({
  dominio,
  corriendo,
  cuentas,
  puedeRevisar,
}: {
  dominio: string;
  corriendo: boolean;
  cuentas: RevisionSpotifyPublica[];
  puedeRevisar: boolean;
}) {
  const router = useRouter();
  const { cargando, error, ejecutar } = useAccion();
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const pendientes = useMemo(
    () =>
      cuentas.filter((c) => c.revision && ['en_cola', 'revisando'].includes(c.revision.estado))
        .length,
    [cuentas],
  );
  const ocupado = corriendo || pendientes > 0;

  // Mientras revisa, la lista se refresca sola para ver avanzar cada cuenta.
  useEffect(() => {
    if (!ocupado) return;
    const t = setInterval(() => router.refresh(), REFRESCO_MS);
    return () => clearInterval(t);
  }, [ocupado, router]);

  const alertas = cuentas.filter(
    (c) =>
      c.revision?.estado === 'lista' &&
      c.revision.situacion !== null &&
      ['pago_fallido', 'pausa', 'caida'].includes(c.revision.situacion),
  ).length;

  const alternar = (id: string) =>
    setElegidas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function revisar(ids: string[] | null) {
    const r = await ejecutar('POST', '/codigos/spotify/revisar', ids ? { cuentaIds: ids } : {});
    if (r) setElegidas(new Set());
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <p className="text-sm text-tinta-suave">
          {cuentas.length} cuenta{cuentas.length === 1 ? '' : 's'} de Spotify con correo @{dominio}.
          Se revisan una por una, con una pausa de 1 a 2 minutos entre cada una para no parecer un
          robot. Si Spotify pide un captcha, se detiene.
        </p>
        {alertas > 0 && (
          <Alerta tono="peligro">
            {alertas === 1
              ? '1 cuenta tiene pago fallido, está en pausa o sin Premium.'
              : `${alertas} cuentas tienen pago fallido, están en pausa o sin Premium.`}
          </Alerta>
        )}
        {ocupado && (
          <Alerta tono="aviso">
            Revisando… {pendientes > 0 ? `faltan ${pendientes}. ` : ''}Puedes cerrar esta página: el
            servidor sigue solo.
          </Alerta>
        )}
        {puedeRevisar && cuentas.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Boton
              cargando={cargando}
              disabled={elegidas.size === 0}
              icono={<RefreshCw className="size-3.5" />}
              onClick={() => void revisar([...elegidas])}
            >
              Revisar las elegidas ({elegidas.size})
            </Boton>
            <Boton variante="secundario" cargando={cargando} onClick={() => void revisar(null)}>
              Revisar todas
            </Boton>
          </div>
        )}
        <ErrorGeneral error={error} />
        {cuentas.length === 0 && (
          <Alerta tono="aviso">
            No hay cuentas de Spotify con correo @{dominio}. Revisa que el servicio se llame
            «Spotify…» y que el correo de la cuenta termine en @{dominio}.
          </Alerta>
        )}
      </div>
      {cuentas.length > 0 && (
        <Tabla minimo="56rem">
          <Encabezados
            columnas={[
              ...(puedeRevisar ? [''] : []),
              'Cuenta',
              'Resultado',
              'Vencimiento',
              'Cupos',
              'Revisada',
            ]}
          />
          <Cuerpo>
            {cuentas.map((c) => (
              <tr key={c.cuentaId}>
                {puedeRevisar && (
                  <Celda primera className="w-10">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--nv-marca,#22d3ee)]"
                      aria-label={`Elegir ${c.pista}`}
                      checked={elegidas.has(c.cuentaId)}
                      onChange={() => alternar(c.cuentaId)}
                    />
                  </Celda>
                )}
                <Celda primera={!puedeRevisar}>
                  <Link
                    href={`/admin/cuentas/${c.cuentaId}`}
                    className="block font-medium hover:text-marca"
                  >
                    {c.servicio}
                  </Link>
                  <span className="block font-mono text-xs text-tinta-tenue">{c.pista}</span>
                </Celda>
                <Celda>
                  <Resultado c={c} />
                </Celda>
                <Celda>
                  <Vencimiento c={c} />
                </Celda>
                <Celda>
                  <Cupos c={c} />
                </Celda>
                <Celda className="text-xs text-tinta-tenue">
                  {c.revision?.revisadaEn ? formatearFechaHora(c.revision.revisadaEn) : '—'}
                  {c.revision?.diagnostico && (
                    <details className="mt-1">
                      <summary className="cursor-pointer">Lo que vio</summary>
                      <p className="mt-1 max-w-xs text-[0.7rem] break-words whitespace-pre-line">
                        {c.revision.diagnostico.url}
                        {'\n'}
                        {c.revision.diagnostico.textos.slice(0, 15).join('\n')}
                      </p>
                    </details>
                  )}
                </Celda>
              </tr>
            ))}
          </Cuerpo>
        </Tabla>
      )}
    </div>
  );
}
