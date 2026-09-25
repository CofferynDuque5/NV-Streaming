'use client';

import {
  type BloqueDe,
  type BloqueSitio,
  type BotonSitio,
  FONDOS_BLOQUE,
  ICONOS_SITIO,
  type IconoSitio,
  type MedioSitio,
  PROPORCIONES_IMAGEN,
} from '@nv/shared';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { AreaTexto, Casilla, Selector } from '@/componentes/ui/selector';
import { SelectorMedio } from './medios';

type Errores = (ruta: string) => string | undefined;

export interface PropsFormulario<B extends BloqueSitio = BloqueSitio> {
  b: B;
  cambiar: (parche: Partial<B>) => void;
  err: Errores;
  medios: MedioSitio[];
  onMedioSubido: (m: MedioSitio) => void;
  servicios: { slug: string; nombre: string }[];
}

const NOMBRES_ICONO: Record<IconoSitio, string> = {
  insignia: 'Insignia de verificado',
  tarjeta: 'Tarjeta',
  candado: 'Candado',
  soporte: 'Auriculares (soporte)',
  billetera: 'Billetera',
  capas: 'Capas',
  tienda: 'Tienda',
  escudo: 'Escudo',
  rayo: 'Rayo',
  reloj: 'Reloj',
  estrella: 'Estrella',
  corazon: 'Corazón',
  globo: 'Globo',
  pantalla: 'Pantalla',
  regalo: 'Regalo',
  personas: 'Personas',
  mensaje: 'Mensaje',
  check: 'Marca de verificación',
};

const NOMBRES_FONDO: Record<(typeof FONDOS_BLOQUE)[number], string> = {
  normal: 'Normal',
  suave: 'Suave (franja)',
  acento: 'Degradado de acento',
};

const AYUDA_MARCADO =
  '**negrita**, *cursiva*, listas con «- » o «1. », enlaces [texto](/ruta) o [texto](https://…). Deja una línea en blanco entre párrafos.';

/** Campo de texto de una línea: vacío se guarda como «sin valor». */
function Texto({
  etiqueta,
  valor,
  onCambio,
  max,
  error,
  ayuda,
  placeholder,
}: {
  etiqueta: string;
  valor: string | null | undefined;
  onCambio: (v: string) => void;
  max: number;
  error?: string | undefined;
  ayuda?: ReactNode;
  placeholder?: string;
}) {
  return (
    <Campo
      etiqueta={etiqueta}
      value={valor ?? ''}
      onChange={(e) => onCambio(e.currentTarget.value)}
      maxLength={max}
      error={error}
      ayuda={ayuda}
      placeholder={placeholder}
      autoComplete="off"
    />
  );
}

function Area({
  etiqueta,
  valor,
  onCambio,
  max,
  error,
  ayuda,
  filas = 3,
}: {
  etiqueta: string;
  valor: string | null | undefined;
  onCambio: (v: string) => void;
  max: number;
  error?: string | undefined;
  ayuda?: ReactNode;
  filas?: number;
}) {
  return (
    <AreaTexto
      etiqueta={etiqueta}
      value={valor ?? ''}
      onChange={(e) => onCambio(e.currentTarget.value)}
      maxLength={max}
      error={error}
      ayuda={ayuda}
      rows={filas}
    />
  );
}

/** Botón opcional: texto y enlace (ruta interna o https://). */
function EditorBoton({
  etiqueta,
  boton,
  onCambio,
  err,
  ruta,
  opcional = true,
}: {
  etiqueta: string;
  boton: BotonSitio | null | undefined;
  onCambio: (b: BotonSitio | null) => void;
  err: Errores;
  ruta: string;
  opcional?: boolean;
}) {
  const activo = !!boton;
  return (
    <fieldset className="grid gap-3 rounded-xl border border-borde p-3">
      <legend className="px-1 text-sm font-medium">{etiqueta}</legend>
      {opcional && (
        <Casilla
          etiqueta="Mostrar este botón"
          checked={activo}
          onChange={(e) =>
            onCambio(e.currentTarget.checked ? { texto: 'Ver más', enlace: '/planes' } : null)
          }
        />
      )}
      {activo && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Texto
            etiqueta="Texto del botón"
            valor={boton.texto}
            onCambio={(texto) => onCambio({ ...boton, texto })}
            max={40}
            error={err(`${ruta}.texto`)}
          />
          <Texto
            etiqueta="Enlace"
            valor={boton.enlace}
            onCambio={(enlace) => onCambio({ ...boton, enlace })}
            max={300}
            error={err(`${ruta}.enlace`)}
            placeholder="/registro o https://…"
            ayuda="Una ruta del sitio (/planes) o una dirección https://."
          />
        </div>
      )}
    </fieldset>
  );
}

/** Lista editable de elementos (beneficios, pasos, testimonios, preguntas). */
function ListaElementos<T>({
  titulo,
  elementos,
  onCambio,
  nuevo,
  maximo,
  error,
  nombre,
  children,
}: {
  titulo: string;
  elementos: T[];
  onCambio: (e: T[]) => void;
  nuevo: () => T;
  maximo: number;
  error?: string | undefined;
  nombre: (i: number) => string;
  children: (e: T, i: number, cambiar: (parche: Partial<T>) => void) => ReactNode;
}) {
  const mover = (i: number, d: number) => {
    const copia = [...elementos];
    const [e] = copia.splice(i, 1);
    copia.splice(i + d, 0, e as T);
    onCambio(copia);
  };
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-sm font-medium">{titulo}</legend>
      {error && <p className="text-xs font-medium text-peligro">{error}</p>}
      {elementos.map((e, i) => (
        <div key={i} className="grid gap-3 rounded-xl border border-borde bg-hundida/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold tracking-wide text-tinta-tenue uppercase">
              {nombre(i)}
            </span>
            <span className="flex gap-1">
              <BotonIcono
                etiqueta={`Subir ${nombre(i)}`}
                onClick={() => mover(i, -1)}
                disabled={i === 0}
              >
                <ArrowUp className="size-4" />
              </BotonIcono>
              <BotonIcono
                etiqueta={`Bajar ${nombre(i)}`}
                onClick={() => mover(i, 1)}
                disabled={i === elementos.length - 1}
              >
                <ArrowDown className="size-4" />
              </BotonIcono>
              <BotonIcono
                etiqueta={`Quitar ${nombre(i)}`}
                onClick={() => onCambio(elementos.filter((_, j) => j !== i))}
                peligro
              >
                <Trash2 className="size-4" />
              </BotonIcono>
            </span>
          </div>
          {children(e, i, (parche) =>
            onCambio(elementos.map((x, j) => (j === i ? { ...x, ...parche } : x))),
          )}
        </div>
      ))}
      {elementos.length < maximo && (
        <Boton
          variante="secundario"
          tamano="sm"
          className="w-fit"
          icono={<Plus className="size-4" />}
          onClick={() => onCambio([...elementos, nuevo()])}
        >
          Añadir
        </Boton>
      )}
    </fieldset>
  );
}

export function BotonIcono({
  etiqueta,
  onClick,
  disabled,
  peligro,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  disabled?: boolean;
  peligro?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      title={etiqueta}
      className={
        peligro
          ? 'grid size-8 place-items-center rounded-lg text-tinta-tenue hover:bg-peligro-suave hover:text-peligro disabled:opacity-40'
          : 'grid size-8 place-items-center rounded-lg text-tinta-tenue hover:bg-hundida hover:text-tinta disabled:pointer-events-none disabled:opacity-40'
      }
    >
      {children}
    </button>
  );
}

function Encabezado<
  B extends BloqueDe<'planes' | 'beneficios' | 'pasos' | 'testimonios' | 'preguntas'>,
>({ b, cambiar, err }: Pick<PropsFormulario<B>, 'b' | 'cambiar' | 'err'>) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Texto
          etiqueta="Antetítulo (opcional)"
          valor={b.etiqueta}
          onCambio={(etiqueta) => cambiar({ etiqueta } as Partial<B>)}
          max={60}
          error={err('etiqueta')}
        />
        <Texto
          etiqueta="Título"
          valor={b.titulo}
          onCambio={(titulo) => cambiar({ titulo } as Partial<B>)}
          max={120}
          error={err('titulo')}
        />
      </div>
      <Area
        etiqueta="Texto de introducción (opcional)"
        valor={b.subtitulo}
        onCambio={(subtitulo) => cambiar({ subtitulo } as Partial<B>)}
        max={300}
        error={err('subtitulo')}
        filas={2}
      />
    </>
  );
}

function FormPortada({
  b,
  cambiar,
  err,
  medios,
  onMedioSubido,
}: PropsFormulario<BloqueDe<'portada'>>) {
  return (
    <>
      <Texto
        etiqueta="Etiqueta sobre el título (opcional)"
        valor={b.etiqueta}
        onCambio={(etiqueta) => cambiar({ etiqueta })}
        max={60}
        error={err('etiqueta')}
      />
      <Texto
        etiqueta="Título"
        valor={b.titulo}
        onCambio={(titulo) => cambiar({ titulo })}
        max={120}
        error={err('titulo')}
      />
      <Texto
        etiqueta="Parte del título resaltada (opcional)"
        valor={b.destacado}
        onCambio={(destacado) => cambiar({ destacado })}
        max={60}
        error={err('destacado')}
        ayuda="Escribe exactamente las palabras del título que quieres en el color de la marca."
      />
      <Area
        etiqueta="Subtítulo (opcional)"
        valor={b.subtitulo}
        onCambio={(subtitulo) => cambiar({ subtitulo })}
        max={300}
        error={err('subtitulo')}
      />
      <EditorBoton
        etiqueta="Botón principal"
        boton={b.botonPrimario}
        onCambio={(botonPrimario) => cambiar({ botonPrimario })}
        err={err}
        ruta="botonPrimario"
      />
      <EditorBoton
        etiqueta="Botón secundario"
        boton={b.botonSecundario}
        onCambio={(botonSecundario) => cambiar({ botonSecundario })}
        err={err}
        ruta="botonSecundario"
      />
      <fieldset className="grid gap-3 rounded-xl border border-borde p-3">
        <legend className="px-1 text-sm font-medium">Imagen (opcional)</legend>
        <SelectorMedio
          medios={medios}
          seleccionado={b.imagen?.medioId}
          onSubido={onMedioSubido}
          onElegir={(m) =>
            cambiar({ imagen: { medioId: m.id, alt: b.imagen?.alt || m.textoAlternativo } })
          }
        />
        {b.imagen && (
          <>
            <Texto
              etiqueta="Texto alternativo"
              valor={b.imagen.alt}
              onCambio={(alt) => cambiar({ imagen: { medioId: b.imagen!.medioId, alt } })}
              max={200}
              error={err('imagen.alt')}
            />
            <Boton
              variante="fantasma"
              tamano="sm"
              className="w-fit"
              onClick={() => cambiar({ imagen: null })}
            >
              Quitar imagen
            </Boton>
          </>
        )}
        {!b.imagen && (
          <Casilla
            etiqueta="Mostrar la ilustración del panel"
            ayuda="Un dibujo hecho con CSS, sin datos. Si no, el texto se centra."
            checked={b.ilustracion}
            onChange={(e) => cambiar({ ilustracion: e.currentTarget.checked })}
          />
        )}
      </fieldset>
    </>
  );
}

function FormPlanes(p: PropsFormulario<BloqueDe<'planes'>>) {
  const { b, cambiar, err, servicios } = p;
  return (
    <>
      <Encabezado b={b} cambiar={cambiar} err={err} />
      <Selector
        etiqueta="Servicio"
        value={b.servicio ?? ''}
        onChange={(e) => cambiar({ servicio: e.currentTarget.value || null })}
        error={err('servicio')}
        ayuda="Muestra los planes reales del catálogo, con su precio en la moneda de quien visita."
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
      </Selector>
    </>
  );
}

function FormBeneficios(p: PropsFormulario<BloqueDe<'beneficios'>>) {
  const { b, cambiar, err } = p;
  return (
    <>
      <Encabezado b={b} cambiar={cambiar} err={err} />
      <Selector
        etiqueta="Diseño"
        value={b.variante}
        onChange={(e) => cambiar({ variante: e.currentTarget.value as 'tarjetas' | 'lista' })}
      >
        <option value="tarjetas">Tarjetas en cuadrícula</option>
        <option value="lista">Texto a un lado y lista al otro</option>
      </Selector>
      <EditorBoton
        etiqueta="Botón (opcional)"
        boton={b.boton}
        onCambio={(boton) => cambiar({ boton })}
        err={err}
        ruta="boton"
      />
      <ListaElementos
        titulo="Beneficios"
        elementos={b.elementos}
        onCambio={(elementos) => cambiar({ elementos })}
        nuevo={() => ({ icono: 'check' as IconoSitio, titulo: '', texto: '' })}
        maximo={12}
        error={err('elementos')}
        nombre={(i) => `Beneficio ${i + 1}`}
      >
        {(e, i, set) => (
          <>
            <Selector
              etiqueta="Icono"
              value={e.icono}
              onChange={(ev) => set({ icono: ev.currentTarget.value as IconoSitio })}
            >
              {ICONOS_SITIO.map((ic) => (
                <option key={ic} value={ic}>
                  {NOMBRES_ICONO[ic]}
                </option>
              ))}
            </Selector>
            <Texto
              etiqueta="Título"
              valor={e.titulo}
              onCambio={(titulo) => set({ titulo })}
              max={80}
              error={err(`elementos.${i}.titulo`)}
            />
            <Area
              etiqueta="Texto"
              valor={e.texto}
              onCambio={(texto) => set({ texto })}
              max={300}
              error={err(`elementos.${i}.texto`)}
              filas={2}
            />
          </>
        )}
      </ListaElementos>
    </>
  );
}

function FormPasos(p: PropsFormulario<BloqueDe<'pasos'>>) {
  const { b, cambiar, err } = p;
  return (
    <>
      <Encabezado b={b} cambiar={cambiar} err={err} />
      <ListaElementos
        titulo="Pasos"
        elementos={b.elementos}
        onCambio={(elementos) => cambiar({ elementos })}
        nuevo={() => ({ titulo: '', texto: '' })}
        maximo={8}
        error={err('elementos')}
        nombre={(i) => `Paso ${i + 1}`}
      >
        {(e, i, set) => (
          <>
            <Texto
              etiqueta="Título"
              valor={e.titulo}
              onCambio={(titulo) => set({ titulo })}
              max={80}
              error={err(`elementos.${i}.titulo`)}
            />
            <Area
              etiqueta="Texto"
              valor={e.texto}
              onCambio={(texto) => set({ texto })}
              max={300}
              error={err(`elementos.${i}.texto`)}
              filas={2}
            />
          </>
        )}
      </ListaElementos>
    </>
  );
}

function FormTestimonios(p: PropsFormulario<BloqueDe<'testimonios'>>) {
  const { b, cambiar, err } = p;
  return (
    <>
      <Alerta tono="aviso" titulo="Solo testimonios reales">
        Publica únicamente opiniones que un cliente te haya dado de verdad y que haya autorizado a
        mostrar, con su nombre tal como aceptó. Nunca inventes testimonios ni los adornes.
      </Alerta>
      <Encabezado b={b} cambiar={cambiar} err={err} />
      <ListaElementos
        titulo="Testimonios"
        elementos={b.elementos}
        onCambio={(elementos) => cambiar({ elementos })}
        nuevo={() => ({ cita: '', autor: '', detalle: null })}
        maximo={12}
        error={err('elementos')}
        nombre={(i) => `Testimonio ${i + 1}`}
      >
        {(e, i, set) => (
          <>
            <Area
              etiqueta="Lo que dijo (textual)"
              valor={e.cita}
              onCambio={(cita) => set({ cita })}
              max={500}
              error={err(`elementos.${i}.cita`)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Texto
                etiqueta="Nombre"
                valor={e.autor}
                onCambio={(autor) => set({ autor })}
                max={80}
                error={err(`elementos.${i}.autor`)}
              />
              <Texto
                etiqueta="Detalle (opcional)"
                valor={e.detalle}
                onCambio={(detalle) => set({ detalle })}
                max={80}
                placeholder="Cliente desde 2026"
                error={err(`elementos.${i}.detalle`)}
              />
            </div>
          </>
        )}
      </ListaElementos>
    </>
  );
}

function FormPreguntas(p: PropsFormulario<BloqueDe<'preguntas'>>) {
  const { b, cambiar, err } = p;
  return (
    <>
      <Encabezado b={b} cambiar={cambiar} err={err} />
      <ListaElementos
        titulo="Preguntas"
        elementos={b.elementos}
        onCambio={(elementos) => cambiar({ elementos })}
        nuevo={() => ({ pregunta: '', respuesta: '' })}
        maximo={30}
        error={err('elementos')}
        nombre={(i) => `Pregunta ${i + 1}`}
      >
        {(e, i, set) => (
          <>
            <Texto
              etiqueta="Pregunta"
              valor={e.pregunta}
              onCambio={(pregunta) => set({ pregunta })}
              max={200}
              error={err(`elementos.${i}.pregunta`)}
            />
            <Area
              etiqueta="Respuesta"
              valor={e.respuesta}
              onCambio={(respuesta) => set({ respuesta })}
              max={2000}
              error={err(`elementos.${i}.respuesta`)}
              ayuda={AYUDA_MARCADO}
            />
          </>
        )}
      </ListaElementos>
    </>
  );
}

function FormLlamada({ b, cambiar, err }: PropsFormulario<BloqueDe<'llamada'>>) {
  return (
    <>
      <Texto
        etiqueta="Título"
        valor={b.titulo}
        onCambio={(titulo) => cambiar({ titulo })}
        max={120}
        error={err('titulo')}
      />
      <Area
        etiqueta="Texto (opcional)"
        valor={b.texto}
        onCambio={(texto) => cambiar({ texto })}
        max={300}
        error={err('texto')}
        filas={2}
      />
      <EditorBoton
        etiqueta="Botón"
        boton={b.boton}
        onCambio={(boton) => cambiar({ boton: boton ?? { texto: '', enlace: '' } })}
        err={err}
        ruta="boton"
        opcional={false}
      />
      <EditorBoton
        etiqueta="Botón secundario"
        boton={b.botonSecundario}
        onCambio={(botonSecundario) => cambiar({ botonSecundario })}
        err={err}
        ruta="botonSecundario"
      />
    </>
  );
}

function FormTexto({ b, cambiar, err }: PropsFormulario<BloqueDe<'texto'>>) {
  return (
    <>
      <Texto
        etiqueta="Título (opcional)"
        valor={b.titulo}
        onCambio={(titulo) => cambiar({ titulo })}
        max={120}
        error={err('titulo')}
      />
      <Area
        etiqueta="Texto"
        valor={b.contenido}
        onCambio={(contenido) => cambiar({ contenido })}
        max={5000}
        error={err('contenido')}
        ayuda={AYUDA_MARCADO}
        filas={8}
      />
    </>
  );
}

function FormImagen({
  b,
  cambiar,
  err,
  medios,
  onMedioSubido,
}: PropsFormulario<BloqueDe<'imagen'>>) {
  return (
    <>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Imagen</span>
        <SelectorMedio
          medios={medios}
          seleccionado={b.medioId}
          onSubido={onMedioSubido}
          onElegir={(m) => cambiar({ medioId: m.id, alt: b.alt || m.textoAlternativo })}
        />
        {err('medioId') && <p className="text-xs font-medium text-peligro">Elige una imagen.</p>}
      </div>
      <Texto
        etiqueta="Texto alternativo"
        valor={b.alt}
        onCambio={(alt) => cambiar({ alt })}
        max={200}
        error={err('alt')}
        ayuda="Obligatorio. Describe lo que se ve."
      />
      <Texto
        etiqueta="Pie de foto (opcional)"
        valor={b.leyenda}
        onCambio={(leyenda) => cambiar({ leyenda })}
        max={200}
        error={err('leyenda')}
      />
      <Selector
        etiqueta="Proporción"
        value={b.proporcion}
        onChange={(e) =>
          cambiar({ proporcion: e.currentTarget.value as BloqueDe<'imagen'>['proporcion'] })
        }
        ayuda="La imagen se recorta a esta proporción para que la página no salte al cargar."
      >
        {PROPORCIONES_IMAGEN.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Selector>
    </>
  );
}

function FormBanner({ b, cambiar, err }: PropsFormulario<BloqueDe<'banner'>>) {
  return (
    <>
      <Texto
        etiqueta="Aviso"
        valor={b.texto}
        onCambio={(texto) => cambiar({ texto })}
        max={200}
        error={err('texto')}
      />
      <Selector
        etiqueta="Tono"
        value={b.tono}
        onChange={(e) => cambiar({ tono: e.currentTarget.value as BloqueDe<'banner'>['tono'] })}
      >
        <option value="info">Informativo</option>
        <option value="exito">Positivo</option>
        <option value="aviso">Advertencia</option>
      </Selector>
      <EditorBoton
        etiqueta="Enlace (opcional)"
        boton={b.enlace}
        onCambio={(enlace) => cambiar({ enlace })}
        err={err}
        ruta="enlace"
      />
    </>
  );
}

/** Opciones comunes: ancla para enlazar a la sección y fondo. */
function Opciones({ b, cambiar, err }: Pick<PropsFormulario, 'b' | 'cambiar' | 'err'>) {
  return (
    <details className="rounded-xl border border-borde px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-tinta-suave">
        Más opciones
      </summary>
      <div className="grid gap-3 py-3 sm:grid-cols-2">
        <Texto
          etiqueta="Ancla (opcional)"
          valor={b.ancla}
          onCambio={(ancla) => cambiar({ ancla })}
          max={40}
          error={err('ancla')}
          placeholder="como-funciona"
          ayuda="Permite enlazar a esta sección con /ruta#ancla."
        />
        <Selector
          etiqueta="Fondo"
          value={b.fondo}
          onChange={(e) =>
            cambiar({ fondo: e.currentTarget.value as (typeof FONDOS_BLOQUE)[number] })
          }
        >
          {FONDOS_BLOQUE.map((f) => (
            <option key={f} value={f}>
              {NOMBRES_FONDO[f]}
            </option>
          ))}
        </Selector>
      </div>
    </details>
  );
}

/** Formulario del bloque según su tipo. */
export function FormularioBloque(props: PropsFormulario) {
  const { b } = props;
  // Cada formulario recibe el bloque ya acotado a su tipo.
  const conTipo = <B extends BloqueSitio>(bloque: B): PropsFormulario<B> => ({
    ...props,
    b: bloque,
    cambiar: props.cambiar as (parche: Partial<B>) => void,
  });
  let campos: ReactNode;
  switch (b.tipo) {
    case 'portada':
      campos = <FormPortada {...conTipo(b)} />;
      break;
    case 'planes':
      campos = <FormPlanes {...conTipo(b)} />;
      break;
    case 'beneficios':
      campos = <FormBeneficios {...conTipo(b)} />;
      break;
    case 'pasos':
      campos = <FormPasos {...conTipo(b)} />;
      break;
    case 'testimonios':
      campos = <FormTestimonios {...conTipo(b)} />;
      break;
    case 'preguntas':
      campos = <FormPreguntas {...conTipo(b)} />;
      break;
    case 'llamada':
      campos = <FormLlamada {...conTipo(b)} />;
      break;
    case 'texto':
      campos = <FormTexto {...conTipo(b)} />;
      break;
    case 'imagen':
      campos = <FormImagen {...conTipo(b)} />;
      break;
    case 'banner':
      campos = <FormBanner {...conTipo(b)} />;
      break;
  }
  return (
    <div className="grid gap-4">
      {campos}
      <Opciones b={b} cambiar={props.cambiar} err={props.err} />
    </div>
  );
}
