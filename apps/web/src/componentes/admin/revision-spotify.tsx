'use client';

import type { RevisionSpotifyPublica, SituacionSpotify } from '@nv/shared';
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { clasesEntrada } from '@/componentes/ui/clases';
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
  if (!r || r.estado === 'pendiente') return <span className="text-tinta-tenue">Sin revisar</span>;
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

/** Pasos para copiar la cookie sp_dc desde el navegador donde la cuenta ya inició sesión. */
function PasosSesion() {
  return (
    <ol className="list-decimal space-y-1 pl-4 text-xs text-tinta-suave">
      <li>
        En tu PC, abre Chrome en una ventana de incógnito y entra a <b>spotify.com</b> con esa
        cuenta (te pedirá el código del correo y quizá un captcha: lo resuelves tú).
      </li>
      <li>
        Pulsa <b>F12</b> → pestaña <b>Application</b> (Aplicación) → <b>Cookies</b> →{' '}
        <b>https://www.spotify.com</b>.
      </li>
      <li>
        Busca la fila <b>sp_dc</b>, haz doble clic en su valor, cópialo y pégalo aquí.
      </li>
      <li>
        Cierra la ventana de incógnito <b>sin cerrar sesión</b> (si cierras sesión, la cookie deja
        de servir).
      </li>
    </ol>
  );
}

/** Formulario para pegar la cookie sp_dc de una cuenta. Se guarda cifrada en el servidor. */
function PegarSesion({
  cuentaId,
  pista,
  alCerrar,
}: {
  cuentaId: string;
  pista: string;
  alCerrar: () => void;
}) {
  const { cargando, error, ejecutar } = useAccion();
  const [valor, setValor] = useState('');
  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    const r = await ejecutar('POST', `/codigos/spotify/${cuentaId}/sesion`, { spDc: valor });
    if (r) {
      setValor('');
      alCerrar();
    }
  }
  return (
    <form
      onSubmit={(ev) => void guardar(ev)}
      className="mt-2 grid max-w-sm gap-2 rounded-xl bg-white/[0.03] p-3"
    >
      <p className="text-xs font-semibold text-tinta">Pegar sesión de {pista}</p>
      <PasosSesion />
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        aria-label={`Cookie sp_dc de ${pista}`}
        placeholder="Valor de sp_dc"
        className={clasesEntrada}
        value={valor}
        onChange={(ev) => setValor(ev.target.value)}
      />
      <ErrorGeneral error={error} />
      <div className="flex gap-2">
        <Boton type="submit" tamano="sm" cargando={cargando} disabled={valor.trim().length < 40}>
          Guardar sesión
        </Boton>
        <Boton type="button" tamano="sm" variante="fantasma" onClick={alCerrar}>
          Cancelar
        </Boton>
      </div>
    </form>
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
  const [pegando, setPegando] = useState<string | null>(null);
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
        <details className="text-sm text-tinta-suave">
          <summary className="cursor-pointer font-medium text-tinta">
            ¿Spotify pide captcha? Pega la sesión de la cuenta
          </summary>
          <p className="mt-2 text-xs">
            Spotify pide captcha a los inicios de sesión que vienen de servidores. Si pegas la
            sesión de una cuenta (la cookie sp_dc), el robot entra directo sin código ni captcha. Se
            guarda cifrada y dura meses. Usa «Pegar sesión» debajo de cada cuenta:
          </p>
          <div className="mt-2">
            <PasosSesion />
          </div>
        </details>
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
                  {c.conSesion ? (
                    <span className="block text-xs text-exito">Sesión guardada</span>
                  ) : null}
                  {puedeRevisar &&
                    !['en_cola', 'revisando'].includes(c.revision?.estado ?? '') &&
                    (pegando === c.cuentaId ? (
                      <PegarSesion
                        cuentaId={c.cuentaId}
                        pista={c.pista}
                        alCerrar={() => setPegando(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="mt-1 text-xs text-marca hover:underline"
                        onClick={() => setPegando(c.cuentaId)}
                      >
                        {c.conSesion ? 'Cambiar sesión' : 'Pegar sesión'}
                      </button>
                    ))}
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
