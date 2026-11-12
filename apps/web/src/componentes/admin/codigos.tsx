'use client';

import {
  type AsuntoCodigoPublico,
  type BuzonPublico,
  type CuentaServicioResumen,
  type Pagina,
  MINUTOS_CODIGO,
  PROVEEDORES_IMAP,
  type ResultadoCodigo,
} from '@nv/shared';
import clsx from 'clsx';
import {
  ExternalLink,
  Inbox,
  KeyRound,
  LoaderCircle,
  MailSearch,
  Pencil,
  Plug,
  Plus,
  Sparkles,
  Timer,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { BotonCopiar } from '@/componentes/accesos';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Casilla, Selector } from '@/componentes/ui/selector';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { formatearFechaHora, haceCuanto } from '@/lib/formato';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

const TEXTO_ENLACE = {
  hogar: 'Abrir enlace del Hogar',
  verificar: 'Abrir enlace de verificación',
  acceso: 'Abrir enlace de acceso',
} as const;

const textoMinutos = (m: number) =>
  m < 60 ? `${m} minutos` : m === 60 ? '1 hora' : m < 1440 ? `${m / 60} horas` : '24 horas';

// ── Buscar el último código ──────────────────────────────────────────────────

export function BuscarCodigo({
  cuenta,
  servicios,
}: {
  /** Cuenta elegida desde el inventario o la ficha de la cuenta. */
  cuenta: { id: string; pista: string; servicio: string } | null;
  servicios: { id: string; nombre: string }[];
}) {
  const [elegida, setElegida] = useState(cuenta);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [resultado, setResultado] = useState<ResultadoCodigo | null>(null);
  const [correo, setCorreo] = useState('');
  const [sugeridas, setSugeridas] = useState<CuentaServicioResumen[]>([]);
  // Espera: vuelve a buscar cada 20 s hasta que llegue un código nuevo o pasen 3 minutos.
  const [espera, setEspera] = useState<{ hasta: number; desde: number } | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const ultima = useRef<Record<string, unknown> | null>(null);
  const campos = erroresPorCampo(error);

  // Cuentas del inventario que coinciden con lo escrito (por correo o pista).
  useEffect(() => {
    const q = correo.trim();
    if (elegida || q.length < 3) return;
    let vigente = true;
    const t = setTimeout(() => {
      void llamarApi<Pagina<CuentaServicioResumen>>(
        'GET',
        `/cuentas?busqueda=${encodeURIComponent(q)}&porPagina=6`,
      ).then((r) => {
        if (vigente) setSugeridas(r.ok ? r.datos.elementos : []);
      });
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [correo, elegida]);

  async function consultar(cuerpo: Record<string, unknown>): Promise<ResultadoCodigo | null> {
    setCargando(true);
    setError(null);
    const r = await llamarApi<ResultadoCodigo>('POST', '/codigos/buscar', cuerpo);
    setCargando(false);
    if (r.ok) {
      setResultado(r.datos);
      return r.datos;
    }
    setError(r.error);
    setResultado(null);
    setEspera(null);
    return null;
  }

  async function buscar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const cuerpo = {
      ...(elegida
        ? { cuentaId: elegida.id }
        : { correo: textoDe(d, 'correo') ?? '', servicioId: textoDe(d, 'servicioId') }),
      minutos: Number(d.get('minutos') || 60),
    };
    ultima.current = cuerpo;
    setEspera(null);
    await consultar(cuerpo);
  }

  const llegoNuevo = (r: ResultadoCodigo | null, desde: number) =>
    Boolean(
      r?.mensajes.some((m) => (m.codigo || m.enlace) && Date.parse(m.recibidoEn) >= desde - 60_000),
    );

  useEffect(() => {
    if (!espera) return;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    const ronda = setInterval(() => {
      if (Date.now() > espera.hasta || !ultima.current) {
        setEspera(null);
        return;
      }
      void consultar(ultima.current).then((r) => {
        if (llegoNuevo(r, espera.desde)) setEspera(null);
      });
    }, 20_000);
    return () => {
      clearInterval(reloj);
      clearInterval(ronda);
    };
  }, [espera]);

  function esperar() {
    const inicio = Date.now();
    setAhora(inicio);
    setEspera({ desde: inicio, hasta: inicio + 3 * 60_000 });
  }

  const quedan = espera ? Math.max(0, Math.ceil((espera.hasta - ahora) / 1000)) : 0;

  return (
    <div className="grid gap-5">
      <form onSubmit={buscar} className="@container grid gap-4" noValidate autoComplete="off">
        <div className="grid gap-4 @2xl:grid-cols-[1fr_1fr_auto]">
          {elegida ? (
            <div className="grid content-start gap-1.5 @2xl:col-span-2">
              <span className="text-sm font-medium">Cuenta</span>
              <div className="flex h-11 items-center justify-between gap-2 rounded-[0.8rem] border border-borde-fuerte bg-hundida px-3.5">
                <span className="truncate">
                  <span className="font-mono">{elegida.pista}</span>
                  <span className="text-tinta-tenue"> · {elegida.servicio}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setElegida(null);
                    setResultado(null);
                    setEspera(null);
                  }}
                  className="rounded-md p-1 text-tinta-tenue hover:text-tinta"
                  aria-label="Buscar otro correo"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid content-start gap-1.5">
                <Campo
                  etiqueta="Correo de la cuenta"
                  name="correo"
                  type="email"
                  required
                  spellCheck={false}
                  placeholder="cuenta@tudominio.com"
                  value={correo}
                  onChange={(e) => setCorreo(e.currentTarget.value)}
                  ayuda="Escribe parte del correo para elegirla del inventario."
                  error={campos.correo}
                />
                {sugeridas.length > 0 && correo.trim().length >= 3 && (
                  <ul className="grid gap-1" aria-label="Cuentas del inventario">
                    {sugeridas.map((k) => (
                      <li key={k.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setElegida({ id: k.id, pista: k.pista, servicio: k.servicio.nombre });
                            setSugeridas([]);
                            setCorreo('');
                          }}
                          className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-borde px-3 text-left text-sm hover:border-cian"
                        >
                          <KeyRound className="size-4 shrink-0 text-cian" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate font-mono">{k.pista}</span>
                          <span className="text-xs text-tinta-tenue">{k.servicio.nombre}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Selector
                etiqueta="Servicio"
                name="servicioId"
                defaultValue=""
                ayuda="Filtra por sus asuntos."
              >
                <option value="">Cualquier correo</option>
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Selector>
            </>
          )}
          <Selector etiqueta="Desde hace" name="minutos" defaultValue="60">
            {MINUTOS_CODIGO.map((m) => (
              <option key={m} value={m}>
                {textoMinutos(m)}
              </option>
            ))}
          </Selector>
        </div>
        {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
        <div className="flex flex-wrap items-center gap-2.5">
          <Boton
            type="submit"
            cargando={cargando && !espera}
            icono={<MailSearch className="size-4" />}
          >
            Buscar código
          </Boton>
          {resultado &&
            (espera ? (
              <Boton
                variante="secundario"
                onClick={() => setEspera(null)}
                icono={<X className="size-4" />}
              >
                Dejar de esperar
              </Boton>
            ) : (
              <Boton variante="secundario" onClick={esperar} icono={<Timer className="size-4" />}>
                Esperar el código nuevo
              </Boton>
            ))}
          {espera && (
            <p className="flex items-center gap-2 text-sm text-tinta-suave" role="status">
              <LoaderCircle className="size-4 animate-spin text-cian" aria-hidden="true" />
              Revisando cada 20 s · {Math.floor(quedan / 60)}:{String(quedan % 60).padStart(2, '0')}
            </p>
          )}
        </div>
        {resultado && !espera && (
          <p className="text-xs text-tinta-tenue">
            ¿Pediste un código nuevo en la app? Pulsa «Esperar el código nuevo»: buscamos sola
            durante 3 minutos y paramos cuando llegue.
          </p>
        )}
      </form>

      {resultado && (
        <div className="grid gap-3" aria-live="polite">
          {resultado.buzonesConError.map((b) => (
            <Alerta key={b.nombre} tono="aviso" titulo={`No se pudo leer «${b.nombre}»`}>
              {b.error}
            </Alerta>
          ))}
          {resultado.mensajes.length === 0 ? (
            <EstadoVacio icono={Inbox} titulo="No llegó ningún código en ese tiempo">
              Pide el código otra vez en la app del servicio, espera un minuto y vuelve a buscar. Si
              nunca aparece, revisa que ese correo llegue a uno de tus buzones.
            </EstadoVacio>
          ) : (
            <ul className="grid gap-3">
              {resultado.mensajes.map((m, i) => (
                <li
                  key={`${m.recibidoEn}-${i}`}
                  className={clsx(
                    'grid gap-3 rounded-2xl border p-4',
                    i === 0 ? 'border-cian/40 bg-acento-suave/40' : 'border-borde',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="grid min-w-0 gap-0.5">
                      <span className="font-medium break-words">{m.asunto || '(sin asunto)'}</span>
                      <span className="truncate text-xs text-tinta-tenue">{m.de}</span>
                    </div>
                    <span
                      className="text-xs text-tinta-suave"
                      title={formatearFechaHora(m.recibidoEn)}
                    >
                      {haceCuanto(m.recibidoEn)}
                    </span>
                  </div>
                  {(m.codigo || m.enlace) && (
                    <div className="flex flex-wrap items-center gap-3">
                      {m.codigo && (
                        <>
                          <span className="rounded-xl border border-borde-fuerte bg-hundida px-4 py-2 font-mono text-3xl font-bold tracking-[0.25em] tabular-nums select-all">
                            {m.codigo}
                          </span>
                          <BotonCopiar texto={m.codigo} que="el código" />
                        </>
                      )}
                      {m.enlace && (
                        <a
                          href={m.enlace.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex h-9 items-center gap-2 rounded-[0.875rem] border border-borde-fuerte px-3.5 text-sm font-semibold hover:border-cian"
                        >
                          <ExternalLink className="size-4" aria-hidden />
                          {TEXTO_ENLACE[m.enlace.tipo]}
                        </a>
                      )}
                      {m.enlace && <BotonCopiar texto={m.enlace.url} que="el enlace" />}
                    </div>
                  )}
                  <details className="text-sm">
                    <summary className="cursor-pointer text-tinta-suave hover:text-tinta">
                      Ver el texto del correo
                    </summary>
                    <p className="mt-2 whitespace-pre-line text-tinta-suave">{m.extracto}</p>
                  </details>
                </li>
              ))}
            </ul>
          )}
          {resultado.sinFiltroAsunto && resultado.mensajes.length > 0 && (
            <p className="text-xs text-tinta-tenue">
              Se muestran todos los correos para esa dirección porque el servicio no tiene asuntos
              guardados.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Buzones ──────────────────────────────────────────────────────────────────

function FormularioBuzon({ buzon, onListo }: { buzon?: BuzonPublico; onListo: () => void }) {
  const { cargando, error, campos, ejecutar } = useAccion();
  const [proveedor, setProveedor] = useState<string>('');
  const [host, setHost] = useState(buzon?.host ?? '');
  const [puerto, setPuerto] = useState(String(buzon?.puerto ?? 993));
  const elegido = PROVEEDORES_IMAP.find((p) => p.clave === proveedor);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const cuerpo = {
      nombre: textoDe(d, 'nombre') ?? '',
      host: textoDe(d, 'host') ?? '',
      puerto: Number(d.get('puerto') || 993),
      seguro: d.get('seguro') === 'on',
      carpeta: textoDe(d, 'carpeta') ?? 'INBOX',
      activo: d.get('activo') === 'on',
      ...(buzon
        ? {
            ...(textoDe(d, 'usuario') ? { usuario: textoDe(d, 'usuario') } : {}),
            clave: String(d.get('clave') ?? ''),
          }
        : { usuario: textoDe(d, 'usuario') ?? '', clave: String(d.get('clave') ?? '') }),
    };
    const r = buzon
      ? await ejecutar('PATCH', `/codigos/buzones/${buzon.id}`, cuerpo)
      : await ejecutar<BuzonPublico>('POST', '/codigos/buzones', cuerpo);
    if (r) {
      // Al crear, se prueba la conexión enseguida.
      if (!buzon && r.datos && typeof r.datos === 'object' && 'id' in r.datos) {
        await ejecutar('POST', `/codigos/buzones/${(r.datos as BuzonPublico).id}/probar`);
      }
      onListo();
    }
  }

  return (
    <form onSubmit={enviar} className="@container grid gap-4" noValidate autoComplete="off">
      {!buzon && (
        <Selector
          etiqueta="Tipo de correo"
          value={proveedor}
          onChange={(e) => {
            const v = e.currentTarget.value;
            setProveedor(v);
            const p = PROVEEDORES_IMAP.find((x) => x.clave === v);
            if (p) {
              setHost(p.host);
              setPuerto(String(p.puerto));
            }
          }}
          ayuda={elegido?.ayuda}
        >
          <option value="">Otro (escribo el servidor)</option>
          {PROVEEDORES_IMAP.map((p) => (
            <option key={p.clave} value={p.clave}>
              {p.nombre}
            </option>
          ))}
        </Selector>
      )}
      <div className="grid gap-4 @xl:grid-cols-2">
        <Campo
          etiqueta="Nombre"
          name="nombre"
          required
          maxLength={60}
          defaultValue={buzon?.nombre}
          placeholder="Gmail de códigos"
          error={campos.nombre}
        />
        <Campo
          etiqueta={buzon ? `Correo del buzón (ahora ${buzon.pista})` : 'Correo del buzón'}
          name="usuario"
          required={!buzon}
          spellCheck={false}
          autoComplete="off"
          placeholder={buzon ? 'Vacío: se queda igual' : 'codigos@gmail.com'}
          error={campos.usuario}
        />
        <Campo
          etiqueta={buzon ? 'Clave nueva' : 'Clave o contraseña de aplicación'}
          name="clave"
          type="password"
          required={!buzon}
          autoComplete="new-password"
          placeholder={buzon ? 'Vacío: se queda igual' : undefined}
          error={campos.clave}
        />
        <Campo
          etiqueta="Servidor IMAP"
          name="host"
          required
          spellCheck={false}
          value={host}
          onChange={(e) => setHost(e.currentTarget.value)}
          placeholder="imap.gmail.com"
          error={campos.host}
        />
        <Campo
          etiqueta="Puerto"
          name="puerto"
          type="number"
          min={1}
          max={65535}
          value={puerto}
          onChange={(e) => setPuerto(e.currentTarget.value)}
          error={campos.puerto}
        />
        <Campo
          etiqueta="Carpeta"
          name="carpeta"
          defaultValue={buzon?.carpeta ?? 'INBOX'}
          ayuda="INBOX es la bandeja de entrada."
          error={campos.carpeta}
        />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Casilla
          name="seguro"
          etiqueta="Conexión segura (TLS)"
          ayuda="Déjala marcada con el puerto 993."
          defaultChecked={buzon?.seguro ?? true}
        />
        <Casilla
          name="activo"
          etiqueta="Activo"
          ayuda="Los buzones inactivos no se leen."
          defaultChecked={buzon?.activo ?? true}
        />
      </div>
      <p className="text-xs text-tinta-tenue">
        El correo y la clave se guardan cifrados y solo se usan para leer (nunca se borra ni se
        marca nada como leído).
      </p>
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" cargando={cargando}>
          {buzon ? 'Guardar cambios' : 'Agregar y probar'}
        </Boton>
        <Boton variante="fantasma" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

function AccionesBuzon({ b, onEditar }: { b: BuzonPublico; onEditar: () => void }) {
  const { cargando, error, ejecutar } = useAccion();
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className="grid justify-items-end gap-2">
      <div className="flex flex-wrap gap-1">
        <Boton
          variante="secundario"
          tamano="sm"
          cargando={cargando && !confirmar}
          icono={<Plug className="size-3.5" />}
          onClick={() => void ejecutar('POST', `/codigos/buzones/${b.id}/probar`)}
        >
          Probar
        </Boton>
        <Boton
          variante="fantasma"
          tamano="sm"
          icono={<Pencil className="size-3.5" />}
          onClick={onEditar}
          aria-label={`Editar ${b.nombre}`}
        >
          Editar
        </Boton>
        {confirmar ? (
          <>
            <Boton
              variante="peligro"
              tamano="sm"
              cargando={cargando}
              onClick={() => void ejecutar('DELETE', `/codigos/buzones/${b.id}`)}
            >
              Sí, quitar
            </Boton>
            <Boton variante="fantasma" tamano="sm" onClick={() => setConfirmar(false)}>
              No
            </Boton>
          </>
        ) : (
          <Boton
            variante="fantasma"
            tamano="sm"
            icono={<Trash2 className="size-3.5" />}
            onClick={() => setConfirmar(true)}
            aria-label={`Quitar ${b.nombre}`}
          >
            Quitar
          </Boton>
        )}
      </div>
      <ErrorGeneral error={error} />
    </div>
  );
}

export function ListaBuzones({ buzones }: { buzones: BuzonPublico[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  return (
    <>
      {editando === 'nuevo' && (
        <div className="border-b border-borde p-4 sm:p-5">
          <PanelFormulario
            titulo="Agregar buzón"
            descripcion="El correo donde llegan los códigos. Si tus cuentas usan tu dominio, lo ideal es un buzón que reciba todo (catch-all) o reenviar esos correos a un Gmail."
            onCerrar={() => setEditando(null)}
          >
            <FormularioBuzon onListo={() => setEditando(null)} />
          </PanelFormulario>
        </div>
      )}
      {buzones.length === 0 && editando !== 'nuevo' ? (
        <EstadoVacio
          icono={Inbox}
          titulo="Todavía no hay buzones"
          accion={
            <Boton icono={<Plus className="size-4" />} onClick={() => setEditando('nuevo')}>
              Agregar buzón
            </Boton>
          }
        >
          Agrega el Gmail o el correo de tu dominio donde llegan los códigos de Netflix, Disney+ y
          los demás. Puedes agregar varios: se leen todos a la vez.
        </EstadoVacio>
      ) : (
        <ul className="divide-y divide-borde">
          {buzones.map((b) => (
            <li key={b.id} className="px-5 py-4 sm:px-6">
              {editando === b.id ? (
                <PanelFormulario titulo={`Editar ${b.nombre}`} onCerrar={() => setEditando(null)}>
                  <FormularioBuzon buzon={b} onListo={() => setEditando(null)} />
                </PanelFormulario>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={clsx('font-medium', !b.activo && 'text-tinta-suave')}>
                        {b.nombre}
                      </span>
                      {!b.activo && <Insignia>Inactivo</Insignia>}
                      {b.ultimoError ? (
                        <Insignia tono="peligro">Con error</Insignia>
                      ) : b.probadoEn ? (
                        <Insignia tono="exito">Conectado</Insignia>
                      ) : (
                        <Insignia tono="aviso">Sin probar</Insignia>
                      )}
                    </div>
                    <p className="text-sm text-tinta-tenue">
                      <span className="font-mono">{b.pista}</span> · {b.host}:{b.puerto}
                      {b.carpeta !== 'INBOX' && ` · ${b.carpeta}`}
                    </p>
                    {b.ultimoError && (
                      <p className="flex items-start gap-1.5 text-sm text-peligro">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {b.ultimoError}
                      </p>
                    )}
                  </div>
                  <AccionesBuzon b={b} onEditar={() => setEditando(b.id)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {buzones.length > 0 && editando !== 'nuevo' && (
        <div className="border-t border-borde px-5 py-3 sm:px-6">
          <Boton
            variante="fantasma"
            tamano="sm"
            icono={<Plus className="size-4" />}
            onClick={() => setEditando('nuevo')}
          >
            Agregar otro buzón
          </Boton>
        </div>
      )}
    </>
  );
}

// ── Asuntos por servicio ─────────────────────────────────────────────────────

export function ListaAsuntos({
  asuntos,
  servicios,
  puedeConfigurar,
}: {
  asuntos: AsuntoCodigoPublico[];
  servicios: { id: string; nombre: string }[];
  puedeConfigurar: boolean;
}) {
  const { cargando, error, campos, ejecutar } = useAccion();
  const [servicioId, setServicioId] = useState(servicios[0]?.id ?? '');
  const porServicio = new Map<string, AsuntoCodigoPublico[]>();
  for (const a of asuntos) {
    const l = porServicio.get(a.servicio.id) ?? [];
    l.push(a);
    porServicio.set(a.servicio.id, l);
  }

  async function agregar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const d = new FormData(formulario);
    const r = await ejecutar('POST', '/codigos/asuntos', {
      servicioId,
      asunto: textoDe(d, 'asunto') ?? '',
    });
    if (r) formulario.reset();
  }

  return (
    <div className="grid gap-5 p-5 sm:p-6">
      {puedeConfigurar && (
        <form onSubmit={agregar} className="@container grid gap-3" noValidate>
          <div className="grid gap-3 @xl:grid-cols-[14rem_1fr_auto] @xl:items-end">
            <Selector
              etiqueta="Servicio"
              value={servicioId}
              onChange={(e) => setServicioId(e.currentTarget.value)}
              error={campos.servicioId}
            >
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Selector>
            <Campo
              etiqueta="Asunto del correo (o una parte)"
              name="asunto"
              maxLength={160}
              placeholder="código de acceso temporal"
              error={campos.asunto}
            />
            <div className="flex flex-wrap gap-2">
              <Boton type="submit" cargando={cargando} icono={<Plus className="size-4" />}>
                Agregar
              </Boton>
              <Boton
                variante="secundario"
                disabled={!servicioId || cargando}
                icono={<Sparkles className="size-4" />}
                onClick={() => void ejecutar('POST', '/codigos/asuntos/sugerir', { servicioId })}
              >
                Sugeridos
              </Boton>
            </div>
          </div>
          <ErrorGeneral error={error} />
        </form>
      )}
      {asuntos.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          Sin asuntos, el equipo ve todos los correos que llegan a la cuenta y los clientes no
          pueden pedir su código. Agrega al menos uno por servicio (o toca «Sugeridos»).
        </p>
      ) : (
        <ul className="grid gap-4">
          {[...porServicio.values()].map((lista) => (
            <li key={lista[0]!.servicio.id} className="grid gap-2">
              <span className="text-sm font-semibold">{lista[0]!.servicio.nombre}</span>
              <div className="flex flex-wrap gap-2">
                {lista.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-borde bg-white/[0.03] py-1 pr-1.5 pl-3 text-sm"
                  >
                    {a.asunto}
                    {puedeConfigurar && (
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-tinta-tenue hover:bg-peligro-suave hover:text-peligro"
                        aria-label={`Quitar «${a.asunto}»`}
                        onClick={() => void ejecutar('DELETE', `/codigos/asuntos/${a.id}`)}
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
