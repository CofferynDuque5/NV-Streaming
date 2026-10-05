'use client';

import {
  type ContactoSitio,
  contactoSitioSchema,
  IDS_PLANTILLAS,
  type IdPlantilla,
  type PaginaSitioDetalle,
  type PaginaSitioResumen,
  PALETAS_SITIO,
  type PaletaSitio,
  PLANTILLAS_PAGINA,
  type TemaSitio,
} from '@nv/shared';
import {
  Check,
  Clock,
  FilePlus2,
  Info as IconoInfo,
  type LucideIcon,
  Plus,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type CSSProperties, type FormEvent, useState } from 'react';
import { refrescarSitio } from '@/app/(paneles)/admin/sitio/acciones';
import { claseEnlace } from '@/componentes/cliente/piezas-cuenta';
import { Lateral } from '@/componentes/revendedor/lateral';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { errorRuta, rutaDesdeTitulo } from './modelo';
import { CampoArea, CampoTexto, EstadoPagina, Hace, Info, NotaRol } from './piezas';

/** Copia de `o` sin la clave `k` (errores de un campo ya corregido). */
function sinCampo<T extends Record<string, string>>(o: T, k: string): T {
  const copia = { ...o };
  delete copia[k];
  return copia;
}

const aResumen = (p: PaginaSitioDetalle): PaginaSitioResumen => ({
  id: p.id,
  ruta: p.ruta,
  titulo: p.titulo,
  archivada: p.archivada,
  versionPublicada: p.versionPublicada,
  borradorActualizadoEn: p.borradorActualizadoEn,
  cambiosSinPublicar: p.cambiosSinPublicar,
  borradorPor: p.borradorPor,
});

/* ───────────────────────── páginas ───────────────────────── */

/**
 * Páginas del sitio: activas o archivadas, su estado y quién guardó el
 * borrador. Administración archiva y desarchiva (con «Deshacer»); todo el
 * equipo con el editor crea páginas y edita sus borradores.
 */
export function PaginasSitio({
  iniciales,
  puedePublicar,
}: {
  iniciales: PaginaSitioResumen[];
  puedePublicar: boolean;
}) {
  const notificar = useNotificar();
  const [paginas, setPaginas] = useState(iniciales);
  const [filtro, setFiltro] = useState<'activas' | 'archivadas'>('activas');
  const [nueva, setNueva] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const activas = paginas.filter((p) => !p.archivada);
  const archivadas = paginas.filter((p) => p.archivada);
  const lista = filtro === 'activas' ? activas : archivadas;

  async function cambiarArchivada(p: PaginaSitioResumen, archivar: boolean, desdeAviso = false) {
    setOcupada(p.id);
    const r = await llamarApi<PaginaSitioDetalle>(
      'POST',
      `/sitio/paginas/${p.id}/${archivar ? 'archivar' : 'desarchivar'}`,
    );
    setOcupada(null);
    if (!r.ok) {
      notificar(r.error.mensaje, 'error');
      return;
    }
    setPaginas((l) => l.map((x) => (x.id === p.id ? aResumen(r.datos) : x)));
    void refrescarSitio();
    if (desdeAviso) setFiltro(archivar ? 'archivadas' : 'activas');
    notificar(
      archivar
        ? `${p.titulo} archivada. Ya no se ve en la tienda.`
        : `${p.titulo} vuelve a estar activa.`,
      'exito',
      { texto: 'Deshacer', alPulsar: () => void cambiarArchivada(p, !archivar, true) },
    );
  }

  return (
    <section aria-labelledby="titulo-paginas" className="grid min-w-0 content-start gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id="titulo-paginas" className="text-[clamp(1.25rem,2.6vw,1.5rem)]">
            Páginas
          </h2>
          <p className="text-[0.8rem] text-tinta-tenue">
            Cada página tiene un borrador y sus versiones publicadas.
          </p>
        </div>
        <Boton onClick={() => setNueva(true)} icono={<Plus className="size-4" />}>
          Nueva página
        </Boton>
      </header>
      <div role="group" aria-label="Filtrar páginas" className="flex flex-wrap gap-2">
        <button
          type="button"
          className="chip"
          aria-pressed={filtro === 'activas'}
          onClick={() => setFiltro('activas')}
        >
          Activas · {activas.length}
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={filtro === 'archivadas'}
          onClick={() => setFiltro('archivadas')}
        >
          Archivadas · {archivadas.length}
        </button>
      </div>
      <div className="ed-pags" role="table" aria-label="Páginas">
        <div className="ed-pag ed-pag-cab" role="row">
          <span role="columnheader">Página</span>
          <span role="columnheader">Estado</span>
          <span role="columnheader">Último guardado</span>
          <span role="columnheader">
            <span className="sr-only">Acciones</span>
          </span>
        </div>
        {lista.length === 0 ? (
          <p className="px-4 py-5.5 text-center text-sm text-tinta-suave">
            {filtro === 'activas' ? 'No hay páginas activas.' : 'No hay páginas archivadas.'}
          </p>
        ) : (
          lista.map((p) => (
            <div key={p.id} className="ed-pag" role="row">
              <div className="ed-pag-t" role="cell">
                <b>{p.titulo}</b>
                <span className="ed-ruta">{p.ruta}</span>
              </div>
              <div className="ed-pag-m">
                <span role="cell">
                  <EstadoPagina p={p} />
                </span>
                <span className="ed-pag-g" role="cell">
                  <Clock className="size-3.5 shrink-0 text-tinta-tenue" aria-hidden="true" />
                  <span className="truncate">
                    {p.borradorActualizadoEn ? (
                      <Hace iso={p.borradorActualizadoEn} />
                    ) : (
                      'Sin guardar'
                    )}
                    {p.borradorPor ? ` · ${p.borradorPor.nombre}` : ''}
                  </span>
                </span>
              </div>
              <div className="ed-pag-acc" role="cell">
                {puedePublicar && p.ruta !== '/' && (
                  <button
                    type="button"
                    className={claseEnlace}
                    disabled={ocupada === p.id}
                    onClick={() => void cambiarArchivada(p, !p.archivada)}
                    aria-label={`${p.archivada ? 'Desarchivar' : 'Archivar'} ${p.titulo}`}
                  >
                    {p.archivada ? 'Desarchivar' : 'Archivar'}
                  </button>
                )}
                {!p.archivada && (
                  <BotonEnlace
                    href={`/admin/sitio/${p.id}`}
                    variante="secundario"
                    tamano="sm"
                    aria-label={`Editar ${p.titulo} (${p.ruta})`}
                  >
                    Editar
                  </BotonEnlace>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      {filtro === 'archivadas' && (
        <p className="text-xs text-tinta-tenue">
          Las páginas archivadas no se ven en la tienda.{' '}
          {puedePublicar
            ? 'Desarchívala para volver a editarla.'
            : 'Administración puede desarchivarlas.'}
        </p>
      )}
      <NuevaPagina abierto={nueva} onCerrar={() => setNueva(false)} paginas={paginas} />
    </section>
  );
}

/** Icono y color de cada plantilla en «Nueva página». */
const ICONO_PLANTILLA: Record<IdPlantilla, { icono: LucideIcon; color: string }> = {
  'quienes-somos': { icono: Users, color: '#22d3ee' },
};

/** Una opción de «Empezar con una plantilla» (radio con el aspecto de la galería de bloques). */
function OpcionPlantilla({
  valor,
  elegida,
  nombre,
  detalle,
  icono: Icono,
  color,
  onElegir,
}: {
  valor: string;
  elegida: boolean;
  nombre: string;
  detalle: string;
  icono: LucideIcon;
  color: string;
  onElegir: () => void;
}) {
  return (
    <label className="ed-tipo ed-plantilla">
      <input
        type="radio"
        name="nueva-plantilla"
        value={valor}
        checked={elegida}
        onChange={onElegir}
        className="sr-only"
      />
      <span
        className="orbe orbe-sm size-8.5 text-[0.95rem] after:hidden"
        style={{ '--c': color } as CSSProperties}
        aria-hidden="true"
      >
        <Icono />
      </span>
      <span className="grid min-w-0 flex-1">
        <b>{nombre}</b>
        <small>{detalle}</small>
      </span>
      <Check className="ed-plantilla-ok size-4 shrink-0 text-cian" aria-hidden="true" />
    </label>
  );
}

/**
 * Nueva página en un panel lateral: en blanco o con una plantilla (que propone
 * título, ruta y descripción y crea el borrador con sus bloques), título, ruta
 * (se completa sola) y descripción.
 */
function NuevaPagina({
  abierto,
  onCerrar,
  paginas,
}: {
  abierto: boolean;
  onCerrar: () => void;
  paginas: PaginaSitioResumen[];
}) {
  const router = useRouter();
  const notificar = useNotificar();
  const [titulo, setTitulo] = useState('');
  const [ruta, setRuta] = useState('');
  const [rutaAMano, setRutaAMano] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const [creando, setCreando] = useState(false);
  const [deApi, setDeApi] = useState<Record<string, string>>({});
  const [plantilla, setPlantilla] = useState<IdPlantilla | null>(null);

  const errores: Record<string, string | undefined> = {
    titulo: !titulo.trim() ? 'Escribe el título de la página' : undefined,
    ruta: deApi.ruta ?? errorRuta(ruta, paginas),
    descripcion: deApi.descripcion,
  };
  const tocar = (...k: string[]) => setTocados((t) => new Set([...t, ...k]));
  const ver = (k: string) => (tocados.has(k) ? errores[k] : undefined);
  const ok = (k: string) => tocados.has(k) && !errores[k];

  function cerrar() {
    setTitulo('');
    setRuta('');
    setRutaAMano(false);
    setDescripcion('');
    setTocados(new Set());
    setDeApi({});
    setPlantilla(null);
    onCerrar();
  }

  /** Elegir una plantilla propone sus datos; volver a «en blanco» quita los que no se tocaron. */
  function elegirPlantilla(id: IdPlantilla | null) {
    const antes = plantilla ? PLANTILLAS_PAGINA[plantilla] : null;
    const nueva = id ? PLANTILLAS_PAGINA[id] : null;
    setPlantilla(id);
    setDeApi({});
    if (nueva) {
      setTitulo(nueva.titulo);
      setRuta(nueva.ruta);
      setRutaAMano(true);
      setDescripcion(nueva.descripcion);
      tocar('titulo', 'ruta', 'descripcion');
      return;
    }
    if (!antes) return;
    if (titulo === antes.titulo) setTitulo('');
    if (ruta === antes.ruta) {
      setRuta('');
      setRutaAMano(false);
    }
    if (descripcion === antes.descripcion) setDescripcion('');
    setTocados(new Set());
  }

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    tocar('titulo', 'ruta', 'descripcion');
    const primero = (['titulo', 'ruta', 'descripcion'] as const).find((k) => errores[k]);
    if (primero) {
      document.getElementById(`nueva-${primero}`)?.focus();
      return;
    }
    setCreando(true);
    const r = await llamarApi<PaginaSitioDetalle>('POST', '/sitio/paginas', {
      ruta: ruta.trim(),
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      ...(plantilla ? { plantilla } : {}),
    });
    if (!r.ok) {
      setCreando(false);
      setDeApi(erroresPorCampo(r.error));
      if (!r.error.campos) notificar(r.error.mensaje, 'error');
      return;
    }
    router.push(`/admin/sitio/${r.datos.id}`);
    notificar(
      plantilla
        ? `Página creada como borrador con la plantilla ${PLANTILLAS_PAGINA[plantilla].nombre}. Revisa sus textos antes de publicarla.`
        : 'Página creada como borrador. Añade tu primer bloque.',
    );
  }

  return (
    <Lateral
      abierto={abierto}
      titulo="Nueva página"
      subtitulo="Se crea como borrador sin publicar"
      onCerrar={cerrar}
      pie={
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Boton type="submit" form="form-nueva-pagina" cargando={creando}>
            {creando ? 'Creando…' : 'Crear página'}
          </Boton>
          <button type="button" className={claseEnlace} onClick={cerrar}>
            Cancelar
          </button>
        </div>
      }
    >
      <form id="form-nueva-pagina" onSubmit={crear} noValidate className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="mb-2 grid gap-0.5">
            <span className="text-[0.7rem] font-bold tracking-[0.12em] text-tinta-tenue uppercase">
              Empezar con una plantilla
            </span>
            <small className="text-[0.78rem] text-tinta-suave">
              Opcional. Trae los bloques listos para que solo cambies tus textos
            </small>
          </legend>
          <OpcionPlantilla
            valor=""
            elegida={plantilla === null}
            nombre="Página en blanco"
            detalle="Empieza vacía y añade tus bloques"
            icono={FilePlus2}
            color="#94a3b8"
            onElegir={() => elegirPlantilla(null)}
          />
          {IDS_PLANTILLAS.map((id) => (
            <OpcionPlantilla
              key={id}
              valor={id}
              elegida={plantilla === id}
              nombre={PLANTILLAS_PAGINA[id].nombre}
              detalle={`${PLANTILLAS_PAGINA[id].bloques.length} bloques · ${PLANTILLAS_PAGINA[id].resumen}`}
              icono={ICONO_PLANTILLA[id].icono}
              color={ICONO_PLANTILLA[id].color}
              onElegir={() => elegirPlantilla(id)}
            />
          ))}
          {plantilla === 'quienes-somos' && (
            <Info icono={<IconoInfo className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}>
              «Nuestra historia» trae un borrador corto: reescríbelo con tus palabras antes de
              publicar. «Escríbenos» lleva al formulario de soporte (puedes cambiarlo por el enlace
              de tu WhatsApp) y, si quieres una foto, añade un bloque Imagen.
            </Info>
          )}
        </fieldset>
        <CampoTexto
          id="nueva-titulo"
          etiqueta="Título"
          max={120}
          value={titulo}
          placeholder="Ej.: Promo de Navidad"
          autoComplete="off"
          ayuda="Se ve en la pestaña del navegador y en el editor"
          error={ver('titulo')}
          ok={ok('titulo')}
          onChange={(e) => {
            const v = e.currentTarget.value;
            setTitulo(v);
            tocar('titulo');
            if (!rutaAMano) {
              setRuta(rutaDesdeTitulo(v));
              setDeApi((d) => sinCampo(d, 'ruta'));
              if (v.trim()) tocar('ruta');
            }
          }}
        />
        <CampoTexto
          id="nueva-ruta"
          etiqueta="Ruta"
          max={80}
          value={ruta}
          placeholder="/promo-navidad"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="url"
          className="[&_input]:font-mono"
          ayuda="La dirección de la página. Se completa sola con el título"
          error={ver('ruta')}
          ok={ok('ruta')}
          textoOk="Disponible"
          onChange={(e) => {
            const v = e.currentTarget.value;
            setRuta(v);
            setRutaAMano(v.trim() !== '');
            setDeApi((d) => sinCampo(d, 'ruta'));
            tocar('ruta');
          }}
        />
        <CampoArea
          id="nueva-descripcion"
          etiqueta="Descripción"
          opcional
          max={300}
          value={descripcion}
          placeholder="Lo que verán en Google y al compartir el enlace"
          ayuda="Aparece en Google y al compartir el enlace"
          error={ver('descripcion')}
          ok={ok('descripcion') && descripcion.trim() !== ''}
          onChange={(e) => {
            setDescripcion(e.currentTarget.value);
            tocar('descripcion');
          }}
        />
        <Info icono={<IconoInfo className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}>
          Después de crearla, la ruta no se puede cambiar.
        </Info>
      </form>
    </Lateral>
  );
}

/* ───────────────────────── paleta ───────────────────────── */

const IDS_PALETA = Object.keys(PALETAS_SITIO) as PaletaSitio[];

/** Variables de una paleta para pintar su muestra fuera del sitio público. */
const variablesPaleta = (id: PaletaSitio) => {
  const p = PALETAS_SITIO[id];
  return {
    '--m-marca': p.marca,
    '--m-acento': p.acento,
    '--m-desde': p.boton[0],
    '--m-hasta': p.boton[1],
    '--m-tinta': p.botonTinta,
  } as CSSProperties;
};

/** Las cinco paletas del sitio; administración la cambia para toda la tienda. */
export function PaletaSitioSeccion({
  tema,
  puedeCambiar,
}: {
  tema: TemaSitio;
  puedeCambiar: boolean;
}) {
  const notificar = useNotificar();
  const [enUso, setEnUso] = useState<PaletaSitio>(tema.paleta);
  const [elegida, setElegida] = useState<PaletaSitio>(tema.paleta);
  const [guardando, setGuardando] = useState(false);
  const sel = PALETAS_SITIO[elegida];

  async function guardar() {
    setGuardando(true);
    const r = await llamarApi<TemaSitio>('PUT', '/sitio/tema', { paleta: elegida });
    setGuardando(false);
    if (!r.ok) {
      notificar(r.error.mensaje, 'error');
      return;
    }
    setEnUso(r.datos.paleta);
    await refrescarSitio();
    notificar(`Paleta ${PALETAS_SITIO[r.datos.paleta].nombre} aplicada en toda la tienda`);
  }

  return (
    <section aria-labelledby="titulo-paleta" className="grid min-w-0 content-start gap-3">
      <header className="grid gap-0.5">
        <h2 id="titulo-paleta" className="text-[clamp(1.25rem,2.6vw,1.5rem)]">
          Paleta de colores
        </h2>
        <p className="text-[0.8rem] text-tinta-tenue">Se aplica a toda la tienda al guardarla.</p>
      </header>
      <div className="ed-pals" role="radiogroup" aria-label="Paleta de colores">
        {IDS_PALETA.map((id) => {
          const p = PALETAS_SITIO[id];
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={elegida === id}
              disabled={!puedeCambiar}
              className="ed-pal"
              style={variablesPaleta(id)}
              onClick={() => setElegida(id)}
            >
              <span className="ed-sw" aria-hidden="true">
                <i style={{ '--c': p.marca } as CSSProperties} />
                <i style={{ '--c': p.acento } as CSSProperties} />
                <i style={{ '--c': p.boton[1] } as CSSProperties} />
              </span>
              {enUso === id && (
                <span className="ed-uso">
                  <EnUso />
                </span>
              )}
              <b>{p.nombre}</b>
              <small>{p.descripcion}</small>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4.5 gap-y-3">
        <div className="ed-pal-prev" style={variablesPaleta(elegida)}>
          <span className="text-[0.7rem] font-bold tracking-[0.12em] text-tinta-tenue uppercase">
            Así se ve
          </span>
          <span className="etiqueta-orbita" style={{ '--c': sel.acento } as CSSProperties}>
            {sel.nombre}
          </span>
          <span className="ed-pal-grad">Todos tus universos</span>
          <span className="ed-mues">Color de botones</span>
        </div>
        {puedeCambiar ? (
          elegida === enUso ? (
            <span className="inline-flex items-center gap-1.5 text-[0.82rem] whitespace-nowrap text-exito">
              <Check className="size-4" aria-hidden="true" />
              {PALETAS_SITIO[enUso].nombre} está en uso
            </span>
          ) : (
            <Boton onClick={guardar} cargando={guardando}>
              {guardando ? 'Guardando…' : 'Guardar paleta'}
            </Boton>
          )
        ) : (
          <NotaRol>Solo administración cambia la paleta.</NotaRol>
        )}
      </div>
    </section>
  );
}

function EnUso() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-exito/40 px-1.5 py-px text-[0.6rem] font-bold tracking-[0.06em] text-exito uppercase before:size-1.5 before:rounded-full before:bg-current">
      En uso
    </span>
  );
}

/* ───────────────────────── contacto ───────────────────────── */

type CampoContacto = keyof ContactoSitio;

const CAMPOS_CONTACTO: {
  campo: CampoContacto;
  etiqueta: string;
  ayuda: string;
  tipo: 'tel' | 'url' | 'email';
  ejemplo: string;
}[] = [
  {
    campo: 'whatsapp',
    etiqueta: 'WhatsApp de soporte',
    ayuda: 'Con código de país. Lo usan los botones de WhatsApp de la tienda',
    tipo: 'tel',
    ejemplo: '58 412 1234567',
  },
  {
    campo: 'canalWhatsapp',
    etiqueta: 'Canal de WhatsApp',
    ayuda: 'Lo usa el bloque Canal de WhatsApp',
    tipo: 'url',
    ejemplo: 'https://whatsapp.com/channel/…',
  },
  {
    campo: 'instagram',
    etiqueta: 'Instagram',
    ayuda: 'El enlace del perfil. Sale en el pie de la tienda',
    tipo: 'url',
    ejemplo: 'https://instagram.com/…',
  },
  {
    campo: 'tiktok',
    etiqueta: 'TikTok',
    ayuda: 'El enlace del perfil. Sale en el pie de la tienda',
    tipo: 'url',
    ejemplo: 'https://tiktok.com/@…',
  },
  {
    campo: 'correo',
    etiqueta: 'Correo de contacto',
    ayuda: 'Sale en el pie de la tienda',
    tipo: 'email',
    ejemplo: 'hola@tutienda.com',
  },
];

/** Valida un solo campo con el mismo esquema que usa la API. */
function errorDeCampo(campo: CampoContacto, valor: string): string | undefined {
  const r = contactoSitioSchema.shape[campo].safeParse(valor);
  return r.success ? undefined : r.error.issues[0]?.message;
}

/** WhatsApp, canal, redes y correo de la tienda. Lo que queda vacío no se muestra. */
export function ContactoSitioSeccion({
  contacto,
  puedeCambiar,
}: {
  contacto: ContactoSitio;
  puedeCambiar: boolean;
}) {
  const notificar = useNotificar();
  const [valores, setValores] = useState(
    () =>
      Object.fromEntries(
        CAMPOS_CONTACTO.map(({ campo }) => [campo, contacto[campo] ?? '']),
      ) as Record<CampoContacto, string>,
  );
  const [tocados, setTocados] = useState<Set<CampoContacto>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [deApi, setDeApi] = useState<Record<string, string>>({});

  const errores = Object.fromEntries(
    CAMPOS_CONTACTO.map(({ campo }) => [campo, errorDeCampo(campo, valores[campo])]),
  ) as Record<CampoContacto, string | undefined>;

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTocados(new Set(CAMPOS_CONTACTO.map((c) => c.campo)));
    const mal = CAMPOS_CONTACTO.find(({ campo }) => errores[campo]);
    if (mal) {
      document.getElementById(`contacto-${mal.campo}`)?.focus();
      notificar('Revisa los campos marcados en rojo', 'error');
      return;
    }
    setGuardando(true);
    const r = await llamarApi('PUT', '/sitio/contacto', valores);
    setGuardando(false);
    if (!r.ok) {
      setDeApi(erroresPorCampo(r.error));
      notificar(r.error.mensaje, 'error');
      return;
    }
    await refrescarSitio();
    notificar('Contacto guardado. Ya se ve en la tienda.');
  }

  return (
    <section aria-labelledby="titulo-contacto" className="grid min-w-0 content-start gap-3">
      <header className="grid gap-0.5">
        <h2 id="titulo-contacto" className="text-[clamp(1.25rem,2.6vw,1.5rem)]">
          Contacto y redes
        </h2>
        <p className="text-[0.8rem] text-tinta-tenue">
          Salen en el pie de la tienda, en los botones de WhatsApp y en el bloque Canal.
        </p>
      </header>
      <form
        onSubmit={guardar}
        noValidate
        className="grid gap-4 rounded-[1.375rem] border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.8),rgb(8_11_26/0.9))] p-4.5"
      >
        <div className="grid gap-x-3.5 gap-y-3.5 sm:grid-cols-2">
          {CAMPOS_CONTACTO.map(({ campo, etiqueta, ayuda, tipo, ejemplo }) => {
            const tocado = tocados.has(campo);
            const error = (tocado ? errores[campo] : undefined) ?? deApi[campo];
            return (
              <CampoTexto
                key={campo}
                id={`contacto-${campo}`}
                etiqueta={etiqueta}
                opcional
                type={tipo}
                inputMode={tipo === 'tel' ? 'tel' : tipo === 'url' ? 'url' : 'email'}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={ejemplo}
                value={valores[campo]}
                disabled={!puedeCambiar}
                ayuda={ayuda}
                error={error}
                ok={tocado && !error && valores[campo].trim() !== ''}
                onChange={(ev) => {
                  const v = ev.currentTarget.value;
                  setValores((a) => ({ ...a, [campo]: v }));
                  setTocados((t) => new Set([...t, campo]));
                  setDeApi((d) => sinCampo(d, campo));
                }}
              />
            );
          })}
        </div>
        <div>
          {puedeCambiar ? (
            <Boton type="submit" cargando={guardando}>
              {guardando ? 'Guardando…' : 'Guardar contacto'}
            </Boton>
          ) : (
            <NotaRol>Solo administración cambia los datos de contacto.</NotaRol>
          )}
        </div>
      </form>
    </section>
  );
}
