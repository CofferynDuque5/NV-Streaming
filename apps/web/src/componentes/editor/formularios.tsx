'use client';

import {
  type BloqueDe,
  type BloqueSitio,
  type BotonSitio,
  CATEGORIAS_SERVICIO,
  type CategoriaServicio,
  FONDOS_BLOQUE,
  ICONOS_SITIO,
  INFO_CATEGORIA,
  type IconoSitio,
  type MedioSitio,
  ORDENES_SERVICIOS,
  PROPORCIONES_IMAGEN,
  VARIANTES_SERVICIOS,
  VISUALES_PANEL,
} from '@nv/shared';
import clsx from 'clsx';
import { ChevronDown, ChevronUp, ImagePlus, Plus, Settings, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ICONOS } from '@/componentes/bloques/piezas';
import { claseEnlace } from '@/componentes/cliente/piezas-cuenta';
import { Casilla } from '@/componentes/ui/selector';
import { CampoArea, CampoLista, CampoTexto, claseEnlacePeligro } from './piezas';

/** Opciones de un cambio: el campo (para «Listo» y deshacer) y el aviso con «Deshacer». */
export interface OpcionesCambio {
  ruta?: string;
  /** Escribiendo en un campo: los cambios seguidos se deshacen juntos. */
  escribiendo?: boolean;
  aviso?: string;
}

export interface PropsFormulario<B extends BloqueSitio = BloqueSitio> {
  b: B;
  cambiar: (parche: Partial<B>, opciones?: OpcionesCambio) => void;
  /** Error de un campo del bloque (ruta relativa al bloque, p. ej. «elementos.0.titulo»). */
  err: (ruta: string) => string | undefined;
  /** Hay errores en ese campo o dentro de él. */
  hayError: (prefijo: string) => boolean;
  /** El campo ya se tocó y cumple lo pedido. */
  ok: (ruta: string, valor: unknown) => boolean;
  medios: MedioSitio[];
  /** Abre la biblioteca de imágenes; `alElegir` recibe la imagen elegida o subida. */
  elegirMedio: (actual: string | null, alElegir: (m: MedioSitio) => void) => void;
  servicios: { slug: string; nombre: string }[];
  /** Elemento abierto de una lista (beneficios, pasos…). */
  abierto: (lista: string) => number | null;
  abrir: (lista: string, i: number | null) => void;
  rutaPagina: string;
}

const NOMBRES_ICONO: Record<IconoSitio, string> = {
  insignia: 'Insignia',
  tarjeta: 'Tarjeta',
  candado: 'Candado',
  soporte: 'Soporte',
  billetera: 'Billetera',
  capas: 'Capas',
  tienda: 'Tienda',
  escudo: 'Escudo',
  rayo: 'Rayo',
  reloj: 'Reloj',
  estrella: 'Estrella',
  corazon: 'Corazón',
  globo: 'Mundo',
  pantalla: 'Pantalla',
  regalo: 'Regalo',
  personas: 'Personas',
  mensaje: 'Chat',
  check: 'Visto',
};

const NOMBRES_FONDO: Record<(typeof FONDOS_BLOQUE)[number], string> = {
  normal: 'Normal',
  suave: 'Suave',
  acento: 'Acento',
};

/* ───────────────────────── campos ───────────────────────── */

function Texto({
  p,
  ruta,
  etiqueta,
  valor,
  onCambio,
  max,
  opcional,
  ayuda,
  placeholder,
}: {
  p: PropsFormulario;
  ruta: string;
  etiqueta: string;
  valor: string | null | undefined;
  onCambio: (v: string) => void;
  max: number;
  opcional?: boolean;
  ayuda?: ReactNode;
  placeholder?: string;
}) {
  return (
    <CampoTexto
      etiqueta={etiqueta}
      opcional={opcional}
      max={max}
      value={valor ?? ''}
      error={p.err(ruta)}
      ok={p.ok(ruta, valor)}
      ayuda={ayuda}
      placeholder={placeholder}
      autoComplete="off"
      data-campo={ruta}
      onChange={(e) => onCambio(e.currentTarget.value)}
    />
  );
}

const AYUDA_MARCADO = (
  <details className="ed-md">
    <summary>Cómo dar formato</summary>
    <ul>
      <li>
        <code>**negrita**</code> → <b>negrita</b>
      </li>
      <li>
        <code>*cursiva*</code> → <i>cursiva</i>
      </li>
      <li>
        <code>- elemento</code> o <code>1. elemento</code> al inicio de la línea → lista
      </li>
      <li>
        <code>[texto](/ruta)</code> o <code>[texto](https://…)</code> → enlace
      </li>
      <li>Una línea en blanco separa párrafos</li>
    </ul>
  </details>
);

function Area({
  p,
  ruta,
  etiqueta,
  valor,
  onCambio,
  max,
  opcional,
  ayuda,
  filas = 3,
  marcado,
}: {
  p: PropsFormulario;
  ruta: string;
  etiqueta: string;
  valor: string | null | undefined;
  onCambio: (v: string) => void;
  max: number;
  opcional?: boolean;
  ayuda?: ReactNode;
  filas?: number;
  marcado?: boolean;
}) {
  return (
    <CampoArea
      etiqueta={etiqueta}
      opcional={opcional}
      max={max}
      value={valor ?? ''}
      error={p.err(ruta)}
      ok={p.ok(ruta, valor)}
      ayuda={ayuda}
      rows={filas}
      data-campo={ruta}
      onChange={(e) => onCambio(e.currentTarget.value)}
      extra={marcado ? AYUDA_MARCADO : undefined}
    />
  );
}

/** Grupo de campos con su título en mayúsculas. */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="ed-grupo">
      <legend>{titulo}</legend>
      {children}
    </fieldset>
  );
}

/** Botón: texto y enlace. Opcional: si se vacían los dos, no se muestra. */
function GrupoBoton({
  p,
  ruta,
  etiqueta,
  boton,
  onCambio,
  opcional = true,
  etiquetaTexto = 'Texto del botón',
}: {
  p: PropsFormulario;
  ruta: string;
  etiqueta: string;
  boton: BotonSitio | null | undefined;
  onCambio: (b: BotonSitio | null, ruta: string) => void;
  opcional?: boolean;
  etiquetaTexto?: string;
}) {
  const texto = boton?.texto ?? '';
  const enlace = boton?.enlace ?? '';
  const poner = (t: string, e: string, campo: string) =>
    onCambio(opcional && !t.trim() && !e.trim() ? null : { texto: t, enlace: e }, campo);
  return (
    <Grupo titulo={`${etiqueta}${opcional ? ' · opcional' : ''}`}>
      <Texto
        p={p}
        ruta={`${ruta}.texto`}
        etiqueta={etiquetaTexto}
        valor={texto}
        max={40}
        onCambio={(v) => poner(v, enlace, `${ruta}.texto`)}
      />
      <CampoTexto
        etiqueta="Enlace"
        max={300}
        value={enlace}
        error={p.err(`${ruta}.enlace`)}
        ok={p.ok(`${ruta}.enlace`, enlace)}
        ayuda="Una página de la tienda (/…) o una dirección https://"
        placeholder="/catalogo o https://…"
        inputMode="url"
        autoCapitalize="off"
        spellCheck={false}
        autoComplete="off"
        data-campo={`${ruta}.enlace`}
        onChange={(e) => poner(texto, e.currentTarget.value, `${ruta}.enlace`)}
      />
    </Grupo>
  );
}

/** Encabezado de sección: etiqueta, título y subtítulo. */
function Encabezado<
  B extends BloqueDe<
    | 'planes'
    | 'beneficios'
    | 'pasos'
    | 'testimonios'
    | 'preguntas'
    | 'universos'
    | 'servicios'
    | 'ranking'
    | 'metodos-pago'
  >,
>({ p }: { p: PropsFormulario<B> }) {
  const { b } = p;
  const q = p as unknown as PropsFormulario;
  const set = (parche: Partial<B>, ruta: string) => p.cambiar(parche, { ruta, escribiendo: true });
  return (
    <Grupo titulo="Encabezado">
      <Texto
        p={q}
        ruta="etiqueta"
        etiqueta="Etiqueta"
        opcional
        valor={b.etiqueta}
        max={60}
        ayuda="Texto pequeño sobre el título"
        onCambio={(etiqueta) => set({ etiqueta } as Partial<B>, 'etiqueta')}
      />
      <Texto
        p={q}
        ruta="titulo"
        etiqueta="Título"
        valor={b.titulo}
        max={120}
        onCambio={(titulo) => set({ titulo } as Partial<B>, 'titulo')}
      />
      <Area
        p={q}
        ruta="subtitulo"
        etiqueta="Subtítulo"
        opcional
        valor={b.subtitulo}
        max={300}
        onCambio={(subtitulo) => set({ subtitulo } as Partial<B>, 'subtitulo')}
      />
    </Grupo>
  );
}

/**
 * Lista de elementos (beneficios, pasos, testimonios, preguntas, puntos): uno
 * abierto a la vez, con subir, bajar y eliminar (con «Deshacer»).
 */
function Lista<T>({
  p,
  ruta,
  titulo,
  uno,
  elementos,
  min,
  max,
  nuevo,
  resumen,
  onCambio,
  children,
}: {
  p: PropsFormulario;
  ruta: string;
  titulo: string;
  /** Nombre de un elemento: «paso», «pregunta»… */
  uno: string;
  elementos: T[];
  min: number;
  max: number;
  nuevo: () => T;
  resumen: (e: T) => string;
  onCambio: (lista: T[], opciones?: OpcionesCambio) => void;
  children: (e: T, i: number, cambiar: (parche: Partial<T>, campo: string) => void) => ReactNode;
}) {
  const abierto = p.abierto(ruta);
  const mover = (i: number, d: number) => {
    const copia = [...elementos];
    const [e] = copia.splice(i, 1);
    copia.splice(i + d, 0, e as T);
    if (abierto === i) p.abrir(ruta, i + d);
    else if (abierto === i + d) p.abrir(ruta, i);
    onCambio(copia);
  };
  const error = p.err(ruta);
  return (
    <fieldset className="ed-grupo ed-items">
      <legend>
        {titulo} · {elementos.length} de {max}
      </legend>
      {error && <p className="text-xs font-medium text-peligro">{error}</p>}
      {elementos.map((e, i) => {
        const abiertoEste = abierto === i;
        const mal = p.hayError(`${ruta}.${i}`);
        return (
          <div key={i} className={clsx('ed-item', abiertoEste && 'abierto', mal && 'mal')}>
            <div className="ed-item-cab">
              <button
                type="button"
                className="ed-item-t"
                aria-expanded={abiertoEste}
                onClick={() => p.abrir(ruta, abiertoEste ? null : i)}
              >
                <em>{i + 1}</em>
                <span>{resumen(e) || 'Sin completar'}</span>
                {mal && <span className="ed-rev">Revisar</span>}
                <ChevronDown className="ed-item-flecha" aria-hidden="true" />
              </button>
              <div className="ed-mov">
                <button
                  type="button"
                  aria-label={`Subir ${uno} ${i + 1}`}
                  disabled={i === 0}
                  onClick={() => mover(i, -1)}
                >
                  <ChevronUp aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${uno} ${i + 1}`}
                  disabled={i === elementos.length - 1}
                  onClick={() => mover(i, 1)}
                >
                  <ChevronDown aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Eliminar ${uno} ${i + 1}`}
                  disabled={elementos.length <= min}
                  onClick={() => {
                    if (abierto === i) p.abrir(ruta, null);
                    else if (abierto !== null && abierto > i) p.abrir(ruta, abierto - 1);
                    onCambio(
                      elementos.filter((_, j) => j !== i),
                      { aviso: `Eliminaste ${uno === 'pregunta' ? 'la' : 'el'} ${uno} ${i + 1}` },
                    );
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </div>
            {abiertoEste && (
              <div className="ed-item-cuerpo">
                {children(e, i, (parche, campo) =>
                  onCambio(
                    elementos.map((x, j) =>
                      j === i ? (typeof x === 'object' ? { ...x, ...parche } : (parche as T)) : x,
                    ),
                    { ruta: `${ruta}.${i}${campo ? `.${campo}` : ''}`, escribiendo: true },
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="ed-mas-item"
        disabled={elementos.length >= max}
        onClick={() => {
          onCambio([...elementos, nuevo()]);
          p.abrir(ruta, elementos.length);
        }}
      >
        <Plus className="size-4" aria-hidden="true" />
        {elementos.length >= max ? `Máximo ${max}` : `Añadir ${uno}`}
      </button>
    </fieldset>
  );
}

/** Imagen de la biblioteca: la elegida (cambiar o quitar) o el botón para elegir una. */
function CampoMedio({
  p,
  ruta,
  etiqueta,
  medioId,
  opcional,
  ayuda,
  onElegir,
  onQuitar,
}: {
  p: PropsFormulario;
  ruta: string;
  etiqueta: string;
  medioId: string | null | undefined;
  opcional?: boolean;
  ayuda?: string;
  onElegir: (m: MedioSitio) => void;
  onQuitar?: () => void;
}) {
  const m = medioId ? p.medios.find((x) => x.id === medioId) : undefined;
  const error = p.err(ruta);
  return (
    <div className={clsx('grid min-w-0 gap-1.5', error && 'mal')}>
      <span className="text-[0.82rem] font-semibold">
        {etiqueta}
        {opcional && (
          <i className="ml-1 text-xs font-medium text-tinta-tenue not-italic">opcional</i>
        )}
      </span>
      {m ? (
        <div className="ed-medio">
          <img src={m.url} alt="" />
          <div>
            <b>{m.nombre}</b>
            <span>{m.textoAlternativo}</span>
            <div className="flex gap-3">
              <button
                type="button"
                className={claseEnlace}
                onClick={() => p.elegirMedio(medioId ?? null, onElegir)}
              >
                Cambiar
              </button>
              {onQuitar && (
                <button type="button" className={claseEnlacePeligro} onClick={onQuitar}>
                  Quitar
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={clsx('ed-elegir', error && 'mal')}
          data-campo={ruta}
          onClick={() => p.elegirMedio(medioId ?? null, onElegir)}
        >
          <ImagePlus aria-hidden="true" />
          <span>
            <b>Elegir imagen</b>
            <small>De la biblioteca o sube una nueva</small>
          </span>
        </button>
      )}
      {error ? (
        <p className="text-xs font-medium text-peligro">Elige una imagen de la biblioteca</p>
      ) : (
        ayuda && <p className="text-xs text-tinta-tenue">{ayuda}</p>
      )}
    </div>
  );
}

/* ───────────────────────── formularios por tipo ───────────────────────── */

type P<T extends BloqueSitio['tipo']> = { p: PropsFormulario<BloqueDe<T>> };
const comun = <B extends BloqueSitio>(p: PropsFormulario<B>) => p as unknown as PropsFormulario;
/** Cambio de un campo de texto: guarda la ruta y agrupa lo que se escribe seguido. */
const escribir = <B extends BloqueSitio>(p: PropsFormulario<B>, parche: Partial<B>, ruta: string) =>
  p.cambiar(parche, { ruta, escribiendo: true });

function FormPortada({ p }: P<'portada'>) {
  const { b } = p;
  const q = comun(p);
  return (
    <>
      <Texto
        p={q}
        ruta="etiqueta"
        etiqueta="Etiqueta"
        opcional
        valor={b.etiqueta}
        max={60}
        ayuda="Texto pequeño sobre el título"
        onCambio={(etiqueta) => escribir(p, { etiqueta }, 'etiqueta')}
      />
      <Texto
        p={q}
        ruta="titulo"
        etiqueta="Título"
        valor={b.titulo}
        max={120}
        onCambio={(titulo) => escribir(p, { titulo }, 'titulo')}
      />
      <Texto
        p={q}
        ruta="destacado"
        etiqueta="Texto destacado"
        opcional
        valor={b.destacado}
        max={60}
        ayuda="Las palabras del título que se ven con degradado"
        onCambio={(destacado) => escribir(p, { destacado }, 'destacado')}
      />
      <Area
        p={q}
        ruta="subtitulo"
        etiqueta="Subtítulo"
        opcional
        valor={b.subtitulo}
        max={300}
        onCambio={(subtitulo) => escribir(p, { subtitulo }, 'subtitulo')}
      />
      <GrupoBoton
        p={q}
        ruta="botonPrimario"
        etiqueta="Botón principal"
        boton={b.botonPrimario}
        onCambio={(botonPrimario, ruta) => escribir(p, { botonPrimario }, ruta)}
      />
      <GrupoBoton
        p={q}
        ruta="botonSecundario"
        etiqueta="Enlace secundario"
        boton={b.botonSecundario}
        etiquetaTexto="Texto del enlace"
        onCambio={(botonSecundario, ruta) => escribir(p, { botonSecundario }, ruta)}
      />
      <CampoMedio
        p={q}
        ruta="imagen.medioId"
        etiqueta="Imagen"
        opcional
        medioId={b.imagen?.medioId}
        ayuda="Sin imagen se usa la ilustración"
        onElegir={(m) =>
          p.cambiar(
            { imagen: { medioId: m.id, alt: b.imagen?.alt || m.textoAlternativo } },
            { ruta: 'imagen.medioId' },
          )
        }
        onQuitar={() => p.cambiar({ imagen: null }, { ruta: 'imagen.medioId' })}
      />
      {b.imagen ? (
        <Texto
          p={q}
          ruta="imagen.alt"
          etiqueta="Texto alternativo"
          valor={b.imagen.alt}
          max={200}
          ayuda="Describe la imagen para quien no la ve"
          onCambio={(alt) =>
            escribir(p, { imagen: { medioId: b.imagen!.medioId, alt } }, 'imagen.alt')
          }
        />
      ) : (
        <Casilla
          etiqueta="Mostrar la ilustración del portal"
          ayuda="Un anillo con las tarjetas de los servicios más pedidos. Sin ella, el texto se centra."
          checked={b.ilustracion}
          onChange={(e) => p.cambiar({ ilustracion: e.currentTarget.checked })}
        />
      )}
    </>
  );
}

function FormTexto({ p }: P<'texto'>) {
  const { b } = p;
  const q = comun(p);
  return (
    <>
      <Texto
        p={q}
        ruta="titulo"
        etiqueta="Título"
        opcional
        valor={b.titulo}
        max={120}
        onCambio={(titulo) => escribir(p, { titulo }, 'titulo')}
      />
      <Area
        p={q}
        ruta="contenido"
        etiqueta="Contenido"
        valor={b.contenido}
        max={5000}
        filas={8}
        marcado
        onCambio={(contenido) => escribir(p, { contenido }, 'contenido')}
      />
    </>
  );
}

function FormImagen({ p }: P<'imagen'>) {
  const { b } = p;
  const q = comun(p);
  return (
    <>
      <CampoMedio
        p={q}
        ruta="medioId"
        etiqueta="Imagen"
        medioId={b.medioId}
        onElegir={(m) =>
          p.cambiar({ medioId: m.id, alt: b.alt || m.textoAlternativo }, { ruta: 'medioId' })
        }
      />
      <Texto
        p={q}
        ruta="alt"
        etiqueta="Texto alternativo"
        valor={b.alt}
        max={200}
        ayuda="Describe la imagen para quien no la ve"
        onCambio={(alt) => escribir(p, { alt }, 'alt')}
      />
      <Texto
        p={q}
        ruta="leyenda"
        etiqueta="Leyenda"
        opcional
        valor={b.leyenda}
        max={200}
        onCambio={(leyenda) => escribir(p, { leyenda }, 'leyenda')}
      />
      <CampoLista
        etiqueta="Proporción"
        value={b.proporcion}
        ayuda="La imagen se recorta a esta proporción"
        onChange={(e) =>
          p.cambiar({ proporcion: e.currentTarget.value as BloqueDe<'imagen'>['proporcion'] })
        }
      >
        {PROPORCIONES_IMAGEN.map((x) => (
          <option key={x} value={x}>
            {
              {
                '16:9': 'Panorámica 16:9',
                '4:3': 'Clásica 4:3',
                '1:1': 'Cuadrada 1:1',
                '21:9': 'Cine 21:9',
              }[x]
            }
          </option>
        ))}
      </CampoLista>
    </>
  );
}

function SelectorIcono({
  valor,
  onCambio,
}: {
  valor: IconoSitio;
  onCambio: (v: IconoSitio) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.82rem] font-semibold">Ícono</span>
        <span className="text-[0.72rem] font-semibold text-tinta-tenue">
          {NOMBRES_ICONO[valor]}
        </span>
      </div>
      <div className="ed-iconos" role="radiogroup" aria-label="Ícono">
        {ICONOS_SITIO.map((ic) => {
          const Icono = ICONOS[ic];
          return (
            <button
              key={ic}
              type="button"
              role="radio"
              aria-checked={ic === valor}
              aria-label={NOMBRES_ICONO[ic]}
              title={NOMBRES_ICONO[ic]}
              onClick={() => onCambio(ic)}
            >
              <Icono aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FormBeneficios({ p }: P<'beneficios'>) {
  const { b } = p;
  const q = comun(p);
  return (
    <>
      <Encabezado p={p} />
      <CampoLista
        etiqueta="Estilo"
        value={b.variante}
        onChange={(e) =>
          p.cambiar({ variante: e.currentTarget.value as BloqueDe<'beneficios'>['variante'] })
        }
      >
        <option value="tarjetas">Tarjetas</option>
        <option value="lista">Lista</option>
        <option value="compacta">Compacta (bajo la portada)</option>
      </CampoLista>
      <Lista
        p={q}
        ruta="elementos"
        titulo="Beneficios"
        uno="beneficio"
        elementos={b.elementos}
        min={1}
        max={12}
        nuevo={() => ({ icono: 'check' as IconoSitio, titulo: '', texto: '' })}
        resumen={(e) => e.titulo}
        onCambio={(elementos, o) => p.cambiar({ elementos }, o)}
      >
        {(e, i, set) => (
          <>
            <SelectorIcono valor={e.icono} onCambio={(icono) => set({ icono }, 'icono')} />
            <Texto
              p={q}
              ruta={`elementos.${i}.titulo`}
              etiqueta="Título"
              valor={e.titulo}
              max={80}
              onCambio={(titulo) => set({ titulo }, 'titulo')}
            />
            <Area
              p={q}
              ruta={`elementos.${i}.texto`}
              etiqueta="Texto"
              valor={e.texto}
              max={300}
              filas={2}
              onCambio={(texto) => set({ texto }, 'texto')}
            />
          </>
        )}
      </Lista>
      <GrupoBoton
        p={q}
        ruta="boton"
        etiqueta="Botón"
        boton={b.boton}
        onCambio={(boton, ruta) => escribir(p, { boton }, ruta)}
      />
    </>
  );
}

function FormPasos({ p }: P<'pasos'>) {
  const { b } = p;
  const q = comun(p);
  return (
    <>
      <Encabezado p={p} />
      <Lista
        p={q}
        ruta="elementos"
        titulo="Pasos"
        uno="paso"
        elementos={b.elementos}
        min={1}
        max={8}
        nuevo={() => ({ titulo: '', texto: '' })}
        resumen={(e) => e.titulo}
        onCambio={(elementos, o) => p.cambiar({ elementos }, o)}
      >
        {(e, i, set) => (
          <>
            <Texto
              p={q}
              ruta={`elementos.${i}.titulo`}
              etiqueta="Título"
              valor={e.titulo}
              max={80}
              onCambio={(titulo) => set({ titulo }, 'titulo')}
            />
            <Area
              p={q}
              ruta={`elementos.${i}.texto`}
              etiqueta="Texto"
              valor={e.texto}
              max={300}
              filas={2}
              onCambio={(texto) => set({ texto }, 'texto')}
            />
          </>
        )}
      </Lista>
    </>
  );
}

function FormTestimonios({ p }: P<'testimonios'>) {
  const { b } = p;
  const q = comun(p);
  return (
    <>
      <Encabezado p={p} />
      <Lista
        p={q}
        ruta="elementos"
        titulo="Testimonios"
        uno="testimonio"
        elementos={b.elementos}
        min={1}
        max={12}
        nuevo={() => ({ cita: '', autor: '', detalle: null })}
        resumen={(e) => e.autor}
        onCambio={(elementos, o) => p.cambiar({ elementos }, o)}
      >
        {(e, i, set) => (
          <>
            <Area
              p={q}
              ruta={`elementos.${i}.cita`}
              etiqueta="Opinión"
              valor={e.cita}
              max={500}
              ayuda="Tal como la dijo el cliente"
              onCambio={(cita) => set({ cita }, 'cita')}
            />
            <Texto
              p={q}
              ruta={`elementos.${i}.autor`}
              etiqueta="Nombre del cliente"
              valor={e.autor}
              max={80}
              onCambio={(autor) => set({ autor }, 'autor')}
            />
            <Texto
              p={q}
              ruta={`elementos.${i}.detalle`}
              etiqueta="Detalle"
              opcional
              valor={e.detalle}
              max={80}
              ayuda="Por ejemplo, el servicio que compró"
              onCambio={(detalle) => set({ detalle }, 'detalle')}
            />
          </>
        )}
      </Lista>
    </>
  );
}

function FormPreguntas({ p }: P<'preguntas'>) {
  const { b } = p;
  const q = comun(p);
  return (
    <>
      <Encabezado p={p} />
      <Lista
        p={q}
        ruta="elementos"
        titulo="Preguntas"
        uno="pregunta"
        elementos={b.elementos}
        min={1}
        max={30}
        nuevo={() => ({ pregunta: '', respuesta: '' })}
        resumen={(e) => e.pregunta}
        onCambio={(elementos, o) => p.cambiar({ elementos }, o)}
      >
        {(e, i, set) => (
          <>
            <Texto
              p={q}
              ruta={`elementos.${i}.pregunta`}
              etiqueta="Pregunta"
              valor={e.pregunta}
              max={200}
              onCambio={(pregunta) => set({ pregunta }, 'pregunta')}
            />
            <Area
              p={q}
              ruta={`elementos.${i}.respuesta`}
              etiqueta="Respuesta"
              valor={e.respuesta}
              max={2000}
              marcado
              onCambio={(respuesta) => set({ respuesta }, 'respuesta')}
            />
          </>
        )}
      </Lista>
    </>
  );
}

function FormLlamada({ p }: P<'llamada'>) {
  const { b } = p;
  const q = comun(p);
  return (
    <>
      <Texto
        p={q}
        ruta="titulo"
        etiqueta="Título"
        valor={b.titulo}
        max={120}
        onCambio={(titulo) => escribir(p, { titulo }, 'titulo')}
      />
      <Area
        p={q}
        ruta="texto"
        etiqueta="Texto"
        opcional
        valor={b.texto}
        max={300}
        filas={2}
        onCambio={(texto) => escribir(p, { texto }, 'texto')}
      />
      <GrupoBoton
        p={q}
        ruta="boton"
        etiqueta="Botón"
        boton={b.boton}
        opcional={false}
        onCambio={(boton, ruta) => escribir(p, { boton: boton ?? { texto: '', enlace: '' } }, ruta)}
      />
      <GrupoBoton
        p={q}
        ruta="botonSecundario"
        etiqueta="Enlace secundario"
        boton={b.botonSecundario}
        etiquetaTexto="Texto del enlace"
        onCambio={(botonSecundario, ruta) => escribir(p, { botonSecundario }, ruta)}
      />
    </>
  );
}

function FormBanner({ p }: P<'banner'>) {
  const { b } = p;
  const q = comun(p);
  return (
    <>
      <Area
        p={q}
        ruta="texto"
        etiqueta="Texto"
        valor={b.texto}
        max={200}
        filas={2}
        onCambio={(texto) => escribir(p, { texto }, 'texto')}
      />
      <CampoLista
        etiqueta="Tono"
        value={b.tono}
        onChange={(e) => p.cambiar({ tono: e.currentTarget.value as BloqueDe<'banner'>['tono'] })}
      >
        <option value="info">Información</option>
        <option value="exito">Éxito</option>
        <option value="aviso">Aviso</option>
      </CampoLista>
      <GrupoBoton
        p={q}
        ruta="enlace"
        etiqueta="Enlace"
        boton={b.enlace}
        etiquetaTexto="Texto del enlace"
        onCambio={(enlace, ruta) => escribir(p, { enlace }, ruta)}
      />
    </>
  );
}

function SelectorUniverso({
  valor,
  onCambio,
  error,
  todos,
  ayuda,
}: {
  valor: CategoriaServicio | null | undefined;
  onCambio: (v: CategoriaServicio | null) => void;
  error?: string | undefined;
  todos: string;
  ayuda?: string;
}) {
  return (
    <CampoLista
      etiqueta="Universo"
      value={valor ?? ''}
      error={error}
      ayuda={ayuda}
      onChange={(e) => onCambio((e.currentTarget.value || null) as CategoriaServicio | null)}
    >
      <option value="">{todos}</option>
      {CATEGORIAS_SERVICIO.map((c) => (
        <option key={c} value={c}>
          {INFO_CATEGORIA[c].nombre}
        </option>
      ))}
    </CampoLista>
  );
}

function Numero({
  p,
  ruta,
  etiqueta,
  valor,
  min,
  max,
  onCambio,
}: {
  p: PropsFormulario;
  ruta: string;
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  onCambio: (v: number) => void;
}) {
  return (
    <CampoTexto
      etiqueta={etiqueta}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={Number.isFinite(valor) ? String(valor) : ''}
      error={p.err(ruta)}
      ayuda={`De ${min} a ${max}`}
      data-campo={ruta}
      onChange={(e) =>
        onCambio(
          e.currentTarget.value === '' ? Number.NaN : Math.round(Number(e.currentTarget.value)),
        )
      }
    />
  );
}

const NOMBRES_VARIANTE: Record<(typeof VARIANTES_SERVICIOS)[number], string> = {
  rejilla: 'Cuadrícula',
  carril: 'Carril deslizable',
  tira: 'Tira de imágenes (sin precios)',
};
const NOMBRES_ORDEN: Record<(typeof ORDENES_SERVICIOS)[number], string> = {
  recomendados: 'Recomendados',
  menor: 'Menor precio',
  az: 'De la A a la Z',
};
const NOMBRES_VISUAL: Record<(typeof VISUALES_PANEL)[number], string> = {
  ninguno: 'Sin visual',
  billetera: 'Tarjeta de la Billetera NV',
  universo: 'Tarjetas de un universo',
};

function FormServicios({ p }: P<'servicios'>) {
  const { b } = p;
  const q = comun(p);
  return (
    <>
      <Encabezado p={p} />
      <CampoLista
        etiqueta="Estilo"
        value={b.variante}
        onChange={(e) =>
          p.cambiar({ variante: e.currentTarget.value as (typeof VARIANTES_SERVICIOS)[number] })
        }
      >
        {VARIANTES_SERVICIOS.map((v) => (
          <option key={v} value={v}>
            {NOMBRES_VARIANTE[v]}
          </option>
        ))}
      </CampoLista>
      <SelectorUniverso
        valor={b.categoria}
        todos="Todos los universos"
        error={p.err('categoria')}
        onCambio={(categoria) => p.cambiar({ categoria })}
      />
      <CampoLista
        etiqueta="Orden"
        value={b.orden}
        onChange={(e) =>
          p.cambiar({ orden: e.currentTarget.value as (typeof ORDENES_SERVICIOS)[number] })
        }
      >
        {ORDENES_SERVICIOS.map((o) => (
          <option key={o} value={o}>
            {NOMBRES_ORDEN[o]}
          </option>
        ))}
      </CampoLista>
      <Numero
        p={q}
        ruta="limite"
        etiqueta="Cuántos mostrar"
        valor={b.limite}
        min={1}
        max={24}
        onCambio={(limite) => escribir(p, { limite }, 'limite')}
      />
      {b.variante === 'rejilla' && (
        <Casilla
          etiqueta="Mostrar filtros por universo"
          checked={b.filtros}
          onChange={(e) => p.cambiar({ filtros: e.currentTarget.checked })}
        />
      )}
    </>
  );
}

function FormPlanes({ p }: P<'planes'>) {
  const { b, servicios } = p;
  return (
    <>
      <Encabezado p={p} />
      <CampoLista
        etiqueta="Servicio"
        value={b.servicio ?? ''}
        error={p.err('servicio')}
        onChange={(e) => p.cambiar({ servicio: e.currentTarget.value || null })}
      >
        <option value="">Todo el catálogo</option>
        {servicios.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.nombre}
          </option>
        ))}
        {b.servicio && !servicios.some((s) => s.slug === b.servicio) && (
          <option value={b.servicio}>{b.servicio} (sin planes visibles)</option>
        )}
      </CampoLista>
    </>
  );
}

function FormRanking({ p }: P<'ranking'>) {
  const { b } = p;
  return (
    <>
      <Encabezado p={p} />
      <Numero
        p={comun(p)}
        ruta="limite"
        etiqueta="Cuántos mostrar"
        valor={b.limite}
        min={3}
        max={10}
        onCambio={(limite) => escribir(p, { limite }, 'limite')}
      />
    </>
  );
}

function FormSoloEncabezado({ p }: P<'universos' | 'metodos-pago'>) {
  return <Encabezado p={p} />;
}

function FormCanal({ p }: P<'canal'>) {
  const { b } = p;
  const q = comun(p);
  return (
    <>
      <Texto
        p={q}
        ruta="etiqueta"
        etiqueta="Etiqueta"
        opcional
        valor={b.etiqueta}
        max={60}
        onCambio={(etiqueta) => escribir(p, { etiqueta }, 'etiqueta')}
      />
      <Texto
        p={q}
        ruta="titulo"
        etiqueta="Título"
        valor={b.titulo}
        max={120}
        onCambio={(titulo) => escribir(p, { titulo }, 'titulo')}
      />
      <Area
        p={q}
        ruta="texto"
        etiqueta="Texto"
        opcional
        valor={b.texto}
        max={300}
        filas={2}
        onCambio={(texto) => escribir(p, { texto }, 'texto')}
      />
      <Texto
        p={q}
        ruta="boton"
        etiqueta="Texto del botón"
        valor={b.boton}
        max={40}
        onCambio={(boton) => escribir(p, { boton }, 'boton')}
      />
    </>
  );
}

function FormPanel({ p }: P<'panel'>) {
  const { b } = p;
  const q = comun(p);
  return (
    <>
      <Texto
        p={q}
        ruta="etiqueta"
        etiqueta="Etiqueta"
        opcional
        valor={b.etiqueta}
        max={60}
        onCambio={(etiqueta) => escribir(p, { etiqueta }, 'etiqueta')}
      />
      <Texto
        p={q}
        ruta="titulo"
        etiqueta="Título"
        valor={b.titulo}
        max={120}
        onCambio={(titulo) => escribir(p, { titulo }, 'titulo')}
      />
      <Texto
        p={q}
        ruta="resaltado"
        etiqueta="Texto resaltado"
        opcional
        valor={b.resaltado}
        max={60}
        ayuda="Las palabras del título que se ven con degradado"
        onCambio={(resaltado) => escribir(p, { resaltado }, 'resaltado')}
      />
      <Area
        p={q}
        ruta="texto"
        etiqueta="Texto"
        opcional
        valor={b.texto}
        max={400}
        onCambio={(texto) => escribir(p, { texto }, 'texto')}
      />
      <Lista
        p={q}
        ruta="puntos"
        titulo="Puntos"
        uno="punto"
        elementos={b.puntos}
        min={0}
        max={6}
        nuevo={() => ''}
        resumen={(e) => e}
        onCambio={(puntos, o) => p.cambiar({ puntos }, o)}
      >
        {(punto, i, set) => (
          <Texto
            p={q}
            ruta={`puntos.${i}`}
            etiqueta="Texto del punto"
            valor={punto}
            max={120}
            onCambio={(v) => set(v as unknown as Partial<string>, '')}
          />
        )}
      </Lista>
      <GrupoBoton
        p={q}
        ruta="boton"
        etiqueta="Botón principal"
        boton={b.boton}
        onCambio={(boton, ruta) => escribir(p, { boton }, ruta)}
      />
      <GrupoBoton
        p={q}
        ruta="botonSecundario"
        etiqueta="Enlace secundario"
        boton={b.botonSecundario}
        etiquetaTexto="Texto del enlace"
        onCambio={(botonSecundario, ruta) => escribir(p, { botonSecundario }, ruta)}
      />
      <CampoLista
        etiqueta="Visual"
        value={b.visual}
        onChange={(e) =>
          p.cambiar({ visual: e.currentTarget.value as (typeof VISUALES_PANEL)[number] })
        }
      >
        {VISUALES_PANEL.map((v) => (
          <option key={v} value={v}>
            {NOMBRES_VISUAL[v]}
          </option>
        ))}
      </CampoLista>
      {b.visual === 'universo' && (
        <SelectorUniverso
          valor={b.categoria}
          todos="Elige un universo"
          error={p.err('categoria')}
          ayuda="Se muestran las tarjetas de sus servicios"
          onCambio={(categoria) => p.cambiar({ categoria })}
        />
      )}
    </>
  );
}

/** Campos del bloque según su tipo. */
export function FormularioBloque(props: PropsFormulario) {
  const { b } = props;
  const con = <B extends BloqueSitio>(bloque: B) => ({ ...props, b: bloque }) as PropsFormulario<B>;
  switch (b.tipo) {
    case 'portada':
      return <FormPortada p={con(b)} />;
    case 'texto':
      return <FormTexto p={con(b)} />;
    case 'imagen':
      return <FormImagen p={con(b)} />;
    case 'beneficios':
      return <FormBeneficios p={con(b)} />;
    case 'pasos':
      return <FormPasos p={con(b)} />;
    case 'testimonios':
      return <FormTestimonios p={con(b)} />;
    case 'preguntas':
      return <FormPreguntas p={con(b)} />;
    case 'llamada':
      return <FormLlamada p={con(b)} />;
    case 'banner':
      return <FormBanner p={con(b)} />;
    case 'universos':
    case 'metodos-pago':
      return <FormSoloEncabezado p={con(b)} />;
    case 'servicios':
      return <FormServicios p={con(b)} />;
    case 'planes':
      return <FormPlanes p={con(b)} />;
    case 'ranking':
      return <FormRanking p={con(b)} />;
    case 'canal':
      return <FormCanal p={con(b)} />;
    case 'panel':
      return <FormPanel p={con(b)} />;
    default:
      return null;
  }
}

/** «Más opciones»: ancla para enlazar al bloque y fondo. */
export function MasOpciones({
  p,
  abierto,
  onAbrir,
}: {
  p: PropsFormulario;
  abierto: boolean;
  onAbrir: (v: boolean) => void;
}) {
  const { b } = p;
  return (
    <details className="ed-mas" open={abierto} onToggle={(e) => onAbrir(e.currentTarget.open)}>
      <summary>
        <Settings className="size-4" aria-hidden="true" />
        <span>Más opciones</span>
        <small>Ancla y fondo</small>
      </summary>
      <div className="grid gap-3.5 p-3">
        <Texto
          p={p}
          ruta="ancla"
          etiqueta="Ancla"
          opcional
          valor={b.ancla}
          max={40}
          placeholder="como-comprar"
          ayuda={`Para enlazar a este bloque desde un botón: ${p.rutaPagina === '/' ? '/' : p.rutaPagina}#ancla`}
          onCambio={(ancla) => p.cambiar({ ancla }, { ruta: 'ancla', escribiendo: true })}
        />
        <div className="grid gap-1.5">
          <span className="text-[0.82rem] font-semibold">Fondo</span>
          <div className="ed-seg2" role="radiogroup" aria-label="Fondo">
            {FONDOS_BLOQUE.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={b.fondo === f}
                onClick={() => p.cambiar({ fondo: f })}
              >
                {NOMBRES_FONDO[f]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
