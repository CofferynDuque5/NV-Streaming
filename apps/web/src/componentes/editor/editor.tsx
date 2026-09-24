'use client';

import {
  type BloqueSitio,
  type CatalogoPublico,
  guardarBorradorSchema,
  MAX_BLOQUES,
  type MedioSitio,
  type PaginaSitioDetalle,
  type PaletaSitio,
  TIPOS_BLOQUE,
  type TipoBloque,
} from '@nv/shared';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  Copy,
  ExternalLink,
  History,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { refrescarSitio } from '@/app/(paneles)/admin/sitio/acciones';
import { monedaValida } from '@/componentes/planes';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Insignia } from '@/componentes/ui/insignia';
import { AreaTexto } from '@/componentes/ui/selector';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { formatearFechaHora, haceCuanto } from '@/lib/formato';
import { EstadoPagina } from './estado-pagina';
import { BotonIcono, FormularioBloque } from './formularios';
import { bloqueNuevo, duplicarBloque, erroresDe, INFO_BLOQUES, resumenBloque } from './modelo';
import { VistaPrevia } from './vista-previa';

type Ocupado = 'guardar' | 'publicar' | 'restaurar' | 'archivar' | 'recargar' | null;

const instantanea = (titulo: string, descripcion: string, bloques: BloqueSitio[]) =>
  JSON.stringify([titulo.trim(), descripcion.trim(), bloques]);

export function EditorPagina({
  inicial,
  mediosIniciales,
  catalogo,
  paleta,
  puedePublicar,
}: {
  inicial: PaginaSitioDetalle;
  mediosIniciales: MedioSitio[];
  catalogo: CatalogoPublico | null;
  paleta: PaletaSitio;
  puedePublicar: boolean;
}) {
  const [pagina, setPagina] = useState(inicial);
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [descripcion, setDescripcion] = useState(inicial.descripcion ?? '');
  const [bloques, setBloques] = useState<BloqueSitio[]>(inicial.bloques);
  const [guardadoComo, setGuardadoComo] = useState(() =>
    instantanea(inicial.titulo, inicial.descripcion ?? '', inicial.bloques),
  );
  const [abierto, setAbierto] = useState<string | null>(null);
  const [anadiendo, setAnadiendo] = useState(false);
  const [medios, setMedios] = useState(mediosIniciales);
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [nota, setNota] = useState('');

  const sucio = instantanea(titulo, descripcion, bloques) !== guardadoComo;

  const validacion = useMemo(
    () =>
      guardarBorradorSchema.safeParse({
        titulo,
        descripcion,
        bloques,
        borradorActualizadoEn: null,
      }),
    [titulo, descripcion, bloques],
  );
  const errores = useMemo(
    () => ({
      ...erroresPorCampo(error),
      ...(validacion.success ? {} : erroresDe(validacion.error.issues)),
    }),
    [error, validacion],
  );
  const bloquesConError = new Set(
    Object.keys(errores)
      .filter((k) => k.startsWith('bloques.'))
      .map((k) => Number(k.split('.')[1])),
  );

  // Avisa antes de salir con cambios sin guardar.
  useEffect(() => {
    if (!sucio) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sucio]);

  const contexto = useMemo(
    () => ({
      ruta: pagina.ruta,
      catalogo,
      moneda: monedaValida(catalogo?.monedas ?? ['USD'], 'USD'),
    }),
    [pagina.ruta, catalogo],
  );
  const servicios = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const p of catalogo?.planes ?? []) vistos.set(p.servicio.slug, p.servicio.nombre);
    return [...vistos].map(([slug, nombre]) => ({ slug, nombre }));
  }, [catalogo]);

  function aplicar(p: PaginaSitioDetalle) {
    setPagina(p);
    setTitulo(p.titulo);
    setDescripcion(p.descripcion ?? '');
    setBloques(p.bloques);
    setGuardadoComo(instantanea(p.titulo, p.descripcion ?? '', p.bloques));
  }

  function empezar(que: Ocupado) {
    setOcupado(que);
    setError(null);
    setAviso(null);
  }

  async function guardar(): Promise<PaginaSitioDetalle | null> {
    if (!validacion.success) {
      const primero = [...bloquesConError].sort((a, b) => a - b)[0];
      if (primero !== undefined) setAbierto(bloques[primero]?.id ?? null);
      setAviso(null);
      setError({
        estado: 400,
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'Revisa los campos marcados antes de guardar.',
      });
      return null;
    }
    empezar('guardar');
    const r = await llamarApi<PaginaSitioDetalle>('PUT', `/sitio/paginas/${pagina.id}/borrador`, {
      titulo,
      descripcion,
      bloques,
      borradorActualizadoEn: pagina.borradorActualizadoEn,
    });
    setOcupado(null);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    aplicar(r.datos);
    setAviso('Borrador guardado. Nadie lo verá hasta que se publique.');
    return r.datos;
  }

  async function publicar() {
    let actual = pagina;
    if (sucio) {
      const g = await guardar();
      if (!g) return;
      actual = g;
    }
    empezar('publicar');
    const r = await llamarApi<PaginaSitioDetalle>('POST', `/sitio/paginas/${pagina.id}/publicar`, {
      nota,
      borradorActualizadoEn: actual.borradorActualizadoEn,
    });
    if (!r.ok) {
      setOcupado(null);
      setError(r.error);
      return;
    }
    aplicar(r.datos);
    await refrescarSitio();
    setOcupado(null);
    setNota('');
    setPublicando(false);
    setAviso(
      `Publicada la versión ${r.datos.versionPublicada?.numero ?? ''}. ${
        r.datos.archivada
          ? 'La página está archivada: desarchívala para que se vea.'
          : 'Ya está en el sitio.'
      }`,
    );
  }

  async function restaurar(numero: number) {
    if (
      sucio &&
      !window.confirm(
        'Tienes cambios sin guardar que se perderán. ¿Copiar esa versión al borrador?',
      )
    ) {
      return;
    }
    empezar('restaurar');
    const r = await llamarApi<PaginaSitioDetalle>('POST', `/sitio/paginas/${pagina.id}/restaurar`, {
      numero,
    });
    setOcupado(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    aplicar(r.datos);
    setAbierto(null);
    setAviso(
      `La versión ${numero} está ahora en el borrador. Revísala y publícala para que se vea en el sitio.`,
    );
  }

  async function cambiarArchivada() {
    empezar('archivar');
    const accion = pagina.archivada ? 'desarchivar' : 'archivar';
    const r = await llamarApi<PaginaSitioDetalle>('POST', `/sitio/paginas/${pagina.id}/${accion}`);
    if (!r.ok) {
      setOcupado(null);
      setError(r.error);
      return;
    }
    // Solo cambia la visibilidad: se conservan los cambios que aún no se guardaron.
    setPagina(r.datos);
    await refrescarSitio();
    setOcupado(null);
    setAviso(
      r.datos.archivada ? 'Página archivada: ya no se ve en el sitio.' : 'Página visible de nuevo.',
    );
  }

  async function recargar() {
    empezar('recargar');
    const r = await llamarApi<PaginaSitioDetalle>('GET', `/sitio/paginas/${pagina.id}`);
    setOcupado(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    aplicar(r.datos);
    setAviso('Cargada la versión más reciente del borrador.');
  }

  function cambiarBloque(i: number, parche: Partial<BloqueSitio>) {
    setBloques((lista) =>
      lista.map((b, j) => (j === i ? ({ ...b, ...parche } as BloqueSitio) : b)),
    );
  }

  function mover(i: number, d: number) {
    setBloques((lista) => {
      const copia = [...lista];
      const [b] = copia.splice(i, 1);
      if (b) copia.splice(i + d, 0, b);
      return copia;
    });
  }

  function anadir(tipo: TipoBloque) {
    const nuevo = bloqueNuevo(tipo);
    const i = bloques.findIndex((b) => b.id === abierto);
    setBloques((lista) => {
      const copia = [...lista];
      copia.splice(i < 0 ? copia.length : i + 1, 0, nuevo);
      return copia;
    });
    setAbierto(nuevo.id);
    setAnadiendo(false);
  }

  function duplicar(i: number) {
    const b = bloques[i];
    if (!b) return;
    const copia = duplicarBloque(b);
    setBloques((lista) => [...lista.slice(0, i + 1), copia, ...lista.slice(i + 1)]);
    setAbierto(copia.id);
  }

  function quitar(i: number) {
    const b = bloques[i];
    if (!b) return;
    if (!window.confirm(`¿Quitar el bloque «${INFO_BLOQUES[b.tipo].nombre}» del borrador?`)) return;
    setBloques((lista) => lista.filter((_, j) => j !== i));
  }

  const conflicto = error?.codigo === 'BORRADOR_DESACTUALIZADO';
  const visibleEnSitio = pagina.versionPublicada && !pagina.archivada;

  return (
    <>
      <div className="grid gap-4">
        <Link
          href="/admin/sitio"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-tinta-suave hover:text-tinta"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Páginas
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid min-w-0 gap-2">
            <h1 className="text-2xl font-semibold break-words sm:text-[1.75rem]">
              Editar «{pagina.titulo}»
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
              <span className="font-mono text-xs">{pagina.ruta}</span>
              <EstadoPagina p={pagina} />
              {sucio && <Insignia tono="aviso">Cambios sin guardar</Insignia>}
              {visibleEnSitio && (
                <a
                  href={pagina.ruta}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 text-marca hover:underline"
                >
                  Ver en el sitio <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Boton
              variante={sucio ? 'primario' : 'secundario'}
              onClick={guardar}
              cargando={ocupado === 'guardar'}
              disabled={!sucio || ocupado !== null}
              icono={<Save className="size-4" />}
            >
              Guardar borrador
            </Boton>
            {puedePublicar && (
              <Boton
                variante={sucio ? 'secundario' : 'primario'}
                onClick={() => setPublicando((v) => !v)}
                disabled={ocupado !== null}
                aria-expanded={publicando}
                icono={<Send className="size-4" />}
              >
                Publicar…
              </Boton>
            )}
          </div>
        </div>
        {!puedePublicar && (
          <p className="text-sm text-tinta-tenue">
            Guarda tus cambios como borrador: administración los revisa y los publica.
          </p>
        )}

        {publicando && puedePublicar && (
          <div className="grid gap-3 rounded-nv border border-marca/25 bg-elevada p-4 shadow-nv sm:p-5">
            <p className="text-sm text-tinta-suave">
              {sucio
                ? 'Primero se guardará el borrador y después se publicará como una versión nueva.'
                : 'El borrador actual se publicará como una versión nueva. Podrás volver a cualquier versión anterior.'}
            </p>
            <Campo
              etiqueta="Nota de la versión (opcional)"
              value={nota}
              onChange={(e) => setNota(e.currentTarget.value)}
              maxLength={200}
              placeholder="Qué cambió"
            />
            <div className="flex flex-wrap gap-2">
              <Boton
                onClick={publicar}
                cargando={ocupado === 'publicar'}
                disabled={ocupado !== null}
              >
                Publicar ahora
              </Boton>
              <Boton variante="fantasma" onClick={() => setPublicando(false)}>
                Cancelar
              </Boton>
            </div>
          </div>
        )}

        {error && (
          <Alerta tono="peligro" titulo={conflicto ? 'No se guardó' : undefined}>
            <span className="grid gap-2">
              <span>{error.mensaje}</span>
              {conflicto && (
                <Boton
                  variante="secundario"
                  tamano="sm"
                  className="w-fit"
                  onClick={recargar}
                  cargando={ocupado === 'recargar'}
                >
                  Descartar mis cambios y cargar la versión más reciente
                </Boton>
              )}
            </span>
          </Alerta>
        )}
        {aviso && !error && <Alerta tono="exito">{aviso}</Alerta>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:items-start">
        <div className="grid min-w-0 gap-6">
          <Tarjeta>
            <CabeceraTarjeta
              titulo="Datos de la página"
              descripcion="Se usan en la pestaña del navegador, en buscadores y al compartir."
            />
            <div className="grid gap-4 p-5 sm:p-6">
              <Campo
                etiqueta="Título de la página"
                value={titulo}
                onChange={(e) => setTitulo(e.currentTarget.value)}
                maxLength={120}
                error={errores.titulo}
              />
              <AreaTexto
                etiqueta="Descripción para buscadores (opcional)"
                value={descripcion}
                onChange={(e) => setDescripcion(e.currentTarget.value)}
                maxLength={300}
                rows={2}
                error={errores.descripcion}
              />
            </div>
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta
              titulo="Bloques"
              descripcion={`${bloques.length} de ${MAX_BLOQUES}. Se muestran en este orden.`}
            />
            {errores.bloques && (
              <p className="px-5 pt-4 text-sm font-medium text-peligro sm:px-6">
                {errores.bloques}
              </p>
            )}
            <ol className="divide-y divide-borde">
              {bloques.map((b, i) => {
                const info = INFO_BLOQUES[b.tipo];
                const expandido = abierto === b.id;
                const conError = bloquesConError.has(i);
                return (
                  <li key={b.id || i} className={clsx(expandido && 'bg-hundida/30')}>
                    <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
                      <button
                        type="button"
                        onClick={() => setAbierto(expandido ? null : b.id)}
                        aria-expanded={expandido}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-hundida"
                      >
                        <span className="w-5 shrink-0 text-xs text-tinta-tenue tabular-nums">
                          {i + 1}
                        </span>
                        <span className="grid min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            {info.nombre}
                            {conError && <Insignia tono="peligro">Revisar</Insignia>}
                          </span>
                          <span className="truncate text-xs text-tinta-tenue">
                            {resumenBloque(b)}
                          </span>
                        </span>
                        <ChevronDown
                          className={clsx(
                            'size-4 shrink-0 text-tinta-tenue transition-transform',
                            expandido && 'rotate-180',
                          )}
                          aria-hidden="true"
                        />
                        <span className="sr-only">{expandido ? 'Cerrar' : 'Editar'}</span>
                      </button>
                      <span className="flex shrink-0">
                        <BotonIcono
                          etiqueta="Subir"
                          onClick={() => mover(i, -1)}
                          disabled={i === 0}
                        >
                          <ArrowUp className="size-4" />
                        </BotonIcono>
                        <BotonIcono
                          etiqueta="Bajar"
                          onClick={() => mover(i, 1)}
                          disabled={i === bloques.length - 1}
                        >
                          <ArrowDown className="size-4" />
                        </BotonIcono>
                        <BotonIcono
                          etiqueta="Duplicar"
                          onClick={() => duplicar(i)}
                          disabled={bloques.length >= MAX_BLOQUES}
                        >
                          <Copy className="size-4" />
                        </BotonIcono>
                        <BotonIcono etiqueta="Quitar" onClick={() => quitar(i)} peligro>
                          <Trash2 className="size-4" />
                        </BotonIcono>
                      </span>
                    </div>
                    {expandido && (
                      <div className="border-t border-borde px-4 py-4 sm:px-6">
                        <FormularioBloque
                          b={b}
                          cambiar={(parche) => cambiarBloque(i, parche)}
                          err={(ruta) => errores[`bloques.${i}.${ruta}`]}
                          medios={medios}
                          onMedioSubido={(m) => setMedios((lista) => [m, ...lista])}
                          servicios={servicios}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <div className="border-t border-borde p-4 sm:px-6">
              {anadiendo ? (
                <div className="grid gap-3">
                  <p className="text-sm font-medium">¿Qué bloque quieres añadir?</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {TIPOS_BLOQUE.map((t) => (
                      <li key={t}>
                        <button
                          type="button"
                          onClick={() => anadir(t)}
                          className="grid w-full gap-0.5 rounded-xl border border-borde px-3 py-2.5 text-left hover:border-marca hover:bg-marca-suave"
                        >
                          <span className="text-sm font-medium">{INFO_BLOQUES[t].nombre}</span>
                          <span className="text-xs text-tinta-tenue">
                            {INFO_BLOQUES[t].descripcion}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    className="w-fit"
                    onClick={() => setAnadiendo(false)}
                  >
                    Cancelar
                  </Boton>
                </div>
              ) : (
                <Boton
                  variante="secundario"
                  onClick={() => setAnadiendo(true)}
                  disabled={bloques.length >= MAX_BLOQUES}
                  icono={<Plus className="size-4" />}
                >
                  Añadir bloque
                </Boton>
              )}
            </div>
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta
              titulo="Historial de versiones"
              descripcion={
                puedePublicar
                  ? 'Cada publicación queda guardada. Copia una versión al borrador para revisarla y volver a publicarla.'
                  : 'Cada publicación queda guardada.'
              }
            />
            {pagina.versiones.length === 0 ? (
              <p className="flex items-center gap-2 px-5 py-6 text-sm text-tinta-suave sm:px-6">
                <History className="size-4" aria-hidden="true" /> Todavía no se ha publicado.
              </p>
            ) : (
              <ul className="divide-y divide-borde">
                {pagina.versiones.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        Versión {v.numero}
                        {v.vigente && <Insignia tono="exito">En el sitio</Insignia>}
                      </span>
                      <span className="text-xs text-tinta-tenue">
                        {formatearFechaHora(v.publicadaEn)}
                        {v.publicadaPor ? ` · ${v.publicadaPor.nombre}` : ''} · {v.bloques}{' '}
                        {v.bloques === 1 ? 'bloque' : 'bloques'}
                      </span>
                      {v.nota && <span className="text-sm text-tinta-suave">{v.nota}</span>}
                    </div>
                    {puedePublicar && (
                      <Boton
                        variante="secundario"
                        tamano="sm"
                        onClick={() => restaurar(v.numero)}
                        disabled={ocupado !== null}
                      >
                        Copiar al borrador
                      </Boton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          {puedePublicar && (
            <Tarjeta>
              <CabeceraTarjeta
                titulo="Visibilidad"
                descripcion={
                  pagina.ruta === '/'
                    ? 'Si archivas la portada, el sitio muestra la portada básica de NV.'
                    : 'Una página archivada deja de verse (404) pero conserva su historial.'
                }
                accion={
                  <Boton
                    variante={pagina.archivada ? 'secundario' : 'peligro'}
                    tamano="sm"
                    onClick={cambiarArchivada}
                    cargando={ocupado === 'archivar'}
                    disabled={ocupado !== null}
                  >
                    {pagina.archivada ? 'Desarchivar' : 'Archivar'}
                  </Boton>
                }
              />
            </Tarjeta>
          )}
          {pagina.borradorActualizadoEn && (
            <p className="text-xs text-tinta-tenue">
              Borrador guardado {haceCuanto(pagina.borradorActualizadoEn)}
              {pagina.borradorPor ? ` por ${pagina.borradorPor.nombre}` : ''}.
            </p>
          )}
        </div>

        <div className="min-w-0 xl:sticky xl:top-20">
          <VistaPrevia bloques={bloques} titulo={titulo} contexto={contexto} paleta={paleta} />
        </div>
      </div>
    </>
  );
}
