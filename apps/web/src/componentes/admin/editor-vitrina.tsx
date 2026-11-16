'use client';

import {
  type ComentarioEquipo,
  type EstrenoServicio,
  MAX_ESTRENOS_SERVICIO,
  MAX_PREGUNTAS_SERVICIO,
  MEDIO_MAX_MB,
  type MedioSitio,
  mensajeWhatsappServicio,
  type PreguntaServicio,
  type ProveedorPublico,
  type ServicioPublico,
  urlMedio,
  VARIABLES_MENSAJE_WHATSAPP,
  type VitrinaServicio,
} from '@nv/shared';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Flame,
  Home,
  ImagePlus,
  type LucideIcon,
  MessageSquare,
  Plus,
  Power,
  Sparkles,
  Star,
  SunMoon,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { clasesEntrada } from '@/componentes/ui/clases';
import { Interruptor } from '@/componentes/ui/interruptor';
import { llamarApi } from '@/lib/api-cliente';
import { FormularioServicio } from './catalogo';
import { ErrorGeneral, PanelFormulario, useAccion } from './piezas';

const TIPOS_IMAGEN = ['image/png', 'image/jpeg', 'image/webp'];

/** Sube una imagen a la biblioteca del sitio y devuelve su id. */
function useSubirImagen() {
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState('');
  async function subir(f: File, alternativo: string): Promise<string | null> {
    if (!TIPOS_IMAGEN.includes(f.type)) {
      setAviso('Elige una imagen PNG, JPG o WebP (el WebP animado se mueve).');
      return null;
    }
    if (f.size > MEDIO_MAX_MB * 1048576) {
      setAviso(`La imagen pesa más de ${MEDIO_MAX_MB} MB.`);
      return null;
    }
    setAviso('');
    const datos = new FormData();
    datos.append('archivo', f);
    datos.append('textoAlternativo', alternativo);
    setSubiendo(true);
    const r = await llamarApi<MedioSitio>('POST', '/sitio/medios', datos);
    setSubiendo(false);
    if (!r.ok) {
      setAviso(r.error.mensaje);
      return null;
    }
    return r.datos.id;
  }
  return { subir, subiendo, aviso };
}

/** Guarda una parte de la vitrina (el servidor la mezcla con lo demás). */
function useGuardarVitrina(servicioId: string) {
  const accion = useAccion();
  const guardar = (parte: Partial<VitrinaServicio> & { activo?: boolean }) => {
    const { activo, ...vitrina } = parte;
    return accion.ejecutar('PATCH', `/catalogo/servicios/${servicioId}`, {
      ...(activo !== undefined ? { activo } : {}),
      ...(Object.keys(vitrina).length ? { vitrina } : {}),
    });
  };
  return { ...accion, guardar };
}

// ── Estado: interruptores grandes ───────────────────────────────────────────

type ClaveEstado =
  'activo' | 'visible' | 'enInicio' | 'destacado' | 'nuevo' | 'invertirLogo' | 'comentarios';

const ESTADOS: {
  clave: ClaveEstado;
  titulo: string;
  texto: string;
  icono: LucideIcon;
  color: string;
}[] = [
  {
    clave: 'activo',
    titulo: 'Servicio activo',
    texto: 'Apagado, sus planes dejan de venderse.',
    icono: Power,
    color: '#22c55e',
  },
  {
    clave: 'visible',
    titulo: 'Visible en catálogo',
    texto: 'Apagado, no sale en la tienda ni tiene página.',
    icono: Eye,
    color: '#5b98ff',
  },
  {
    clave: 'enInicio',
    titulo: 'Mostrar en inicio',
    texto: 'Sale en «Servicios» de la portada.',
    icono: Home,
    color: '#22d3ee',
  },
  {
    clave: 'destacado',
    titulo: 'Destacado HOT',
    texto: 'Insignia «HOT» en su tarjeta.',
    icono: Flame,
    color: '#f97316',
  },
  {
    clave: 'nuevo',
    titulo: 'Insignia NUEVO',
    texto: 'Insignia «NUEVO» en su tarjeta.',
    icono: Sparkles,
    color: '#a78bfa',
  },
  {
    clave: 'invertirLogo',
    titulo: 'Invertir color del logo',
    texto: 'Para logos negros sobre el fondo oscuro.',
    icono: SunMoon,
    color: '#eab308',
  },
  {
    clave: 'comentarios',
    titulo: 'Comentarios abiertos',
    texto: 'Los clientes pueden comentar en la página.',
    icono: MessageSquare,
    color: '#ec4899',
  },
];

export function EstadoServicio({ servicio }: { servicio: ServicioPublico }) {
  const { guardar, error } = useGuardarVitrina(servicio.id);
  const [valores, setValores] = useState<Record<ClaveEstado, boolean>>({
    activo: servicio.activo,
    visible: servicio.vitrina.visible,
    enInicio: servicio.vitrina.enInicio,
    destacado: servicio.vitrina.destacado,
    nuevo: servicio.vitrina.nuevo,
    invertirLogo: servicio.vitrina.invertirLogo,
    comentarios: servicio.vitrina.comentarios,
  });
  const [cambiando, setCambiando] = useState<ClaveEstado | null>(null);

  async function cambiar(clave: ClaveEstado, v: boolean) {
    setCambiando(clave);
    const r = await guardar({ [clave]: v });
    setCambiando(null);
    if (r) setValores((x) => ({ ...x, [clave]: v }));
  }

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {ESTADOS.map((e) => {
          const Icono = e.icono;
          const encendido = valores[e.clave];
          return (
            <li
              key={e.clave}
              className={clsx(
                'flex items-center gap-3 rounded-2xl border p-3.5 transition-colors',
                encendido ? 'border-borde-fuerte bg-white/[0.04]' : 'border-borde bg-hundida/40',
              )}
            >
              <span
                className="grid size-10 shrink-0 place-items-center rounded-xl"
                style={{ background: `${e.color}22`, color: e.color }}
                aria-hidden="true"
              >
                {e.clave === 'visible' && !encendido ? (
                  <EyeOff className="size-5" />
                ) : (
                  <Icono className="size-5" />
                )}
              </span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <b id={`estado-${e.clave}`} className="text-sm">
                  {e.titulo}
                </b>
                <small className="text-xs text-tinta-tenue">{e.texto}</small>
              </span>
              <Interruptor
                activo={encendido}
                cargando={cambiando === e.clave}
                onCambiar={(v) => void cambiar(e.clave, v)}
                aria-labelledby={`estado-${e.clave}`}
              />
            </li>
          );
        })}
      </ul>
      <ErrorGeneral error={error} />
    </div>
  );
}

// ── Mensaje de WhatsApp ──────────────────────────────────────────────────────

export function MensajeWhatsappServicio({ servicio }: { servicio: ServicioPublico }) {
  const { guardar, cargando, error, campos } = useGuardarVitrina(servicio.id);
  const [texto, setTexto] = useState(servicio.vitrina.mensajeWhatsapp ?? '');
  const [guardado, setGuardado] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  function insertar(variable: string) {
    const el = area.current;
    const inicio = el?.selectionStart ?? texto.length;
    const fin = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, inicio) + variable + texto.slice(fin));
    setGuardado(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(inicio + variable.length, inicio + variable.length);
    });
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const r = await guardar({ mensajeWhatsapp: texto.trim() || null });
    setGuardado(Boolean(r));
  }

  const muestra = mensajeWhatsappServicio(texto, {
    nombre: 'María',
    servicio: servicio.nombre,
    plan: 'Mensual',
    precio: '$5.00',
    fecha: new Date().toLocaleDateString('es-VE'),
  });

  return (
    <form onSubmit={enviar} className="grid gap-3" noValidate>
      <label htmlFor="mensaje-whatsapp" className="text-sm font-semibold">
        Mensaje para pedirlo por WhatsApp
      </label>
      <div className="flex flex-wrap gap-1.5" aria-label="Variables">
        {VARIABLES_MENSAJE_WHATSAPP.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => insertar(v)}
            className="rounded-full border border-marca/40 bg-marca/10 px-2.5 py-1 font-mono text-xs text-[#bcd3ff] hover:bg-marca/20"
          >
            {v}
          </button>
        ))}
      </div>
      <textarea
        ref={area}
        id="mensaje-whatsapp"
        rows={4}
        maxLength={500}
        value={texto}
        onChange={(e) => {
          setTexto(e.currentTarget.value);
          setGuardado(false);
        }}
        placeholder={`Hola, quiero el plan {plan} de ${servicio.nombre} por {precio}.`}
        className={clsx(clasesEntrada, 'h-auto py-2.5')}
        aria-describedby="mensaje-whatsapp-ayuda"
      />
      <p id="mensaje-whatsapp-ayuda" className="text-xs text-tinta-tenue">
        Vacío usa el mensaje general de la tienda. Toca una variable para ponerla donde está el
        cursor.
        {campos['vitrina.mensajeWhatsapp'] && (
          <span className="block text-peligro">{campos['vitrina.mensajeWhatsapp']}</span>
        )}
      </p>
      {texto.trim() && (
        <div className="grid gap-1">
          <span className="text-xs font-semibold text-tinta-tenue">Así le llega al equipo</span>
          <p className="max-w-md rounded-2xl rounded-tr-sm bg-[#005c4b] px-3.5 py-2.5 text-sm whitespace-pre-wrap text-white">
            {muestra}
          </p>
        </div>
      )}
      <ErrorGeneral error={error} />
      <div className="flex items-center gap-3">
        <Boton type="submit" cargando={cargando}>
          Guardar mensaje
        </Boton>
        {guardado && (
          <p role="status" className="text-sm font-medium text-exito">
            Guardado.
          </p>
        )}
      </div>
    </form>
  );
}

// ── Imágenes: fondo de portada y cartelera ───────────────────────────────────

function BotonSubir({
  texto,
  onElegir,
  subiendo,
}: {
  texto: string;
  onElegir: (f: File) => void;
  subiendo: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={entrada}
        type="file"
        accept={TIPOS_IMAGEN.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (f) onElegir(f);
        }}
      />
      <Boton
        tamano="sm"
        variante="secundario"
        cargando={subiendo}
        icono={<ImagePlus className="size-4" />}
        onClick={() => entrada.current?.click()}
      >
        {texto}
      </Boton>
    </>
  );
}

export function PortadaServicio({ servicio }: { servicio: ServicioPublico }) {
  const { guardar, error } = useGuardarVitrina(servicio.id);
  const { subir, subiendo, aviso } = useSubirImagen();
  const [portada, setPortada] = useState(servicio.vitrina.portadaId ?? null);
  const [movimiento, setMovimiento] = useState(servicio.vitrina.movimiento);
  const [guardando, setGuardando] = useState(false);

  async function poner(id: string | null) {
    setGuardando(true);
    const r = await guardar({ portadaId: id });
    setGuardando(false);
    if (r) setPortada(id);
  }

  return (
    <div className="grid gap-3">
      <div
        className={clsx(
          'relative grid aspect-[21/9] place-items-center overflow-hidden rounded-2xl border border-borde bg-hundida',
        )}
      >
        {portada ? (
          <img
            src={urlMedio(portada)}
            alt=""
            className={clsx(
              'absolute inset-0 size-full object-cover',
              movimiento && 'fondo-en-movimiento',
            )}
          />
        ) : (
          <p className="max-w-xs px-4 text-center text-sm text-tinta-tenue">
            Sin fondo: la página del servicio usa el color de su logo.
          </p>
        )}
        {portada && (
          <span className="absolute inset-0 bg-[linear-gradient(90deg,rgb(5_8_22/0.92),rgb(5_8_22/0.35)_60%,transparent)]" />
        )}
        {portada && (
          <b className="relative mr-auto ml-6 font-titulo text-2xl text-white drop-shadow">
            {servicio.nombre}
          </b>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <BotonSubir
          texto={portada ? 'Cambiar fondo' : 'Subir fondo'}
          subiendo={subiendo || guardando}
          onElegir={async (f) => {
            const id = await subir(f, `Escena de ${servicio.nombre}`);
            if (id) await poner(id);
          }}
        />
        {portada && (
          <Boton
            tamano="sm"
            variante="fantasma"
            icono={<Trash2 className="size-4" />}
            onClick={() => void poner(null)}
          >
            Quitar
          </Boton>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-tinta-suave">
          <Interruptor
            activo={movimiento}
            aria-label="Movimiento lento del fondo"
            onCambiar={async (v) => {
              const r = await guardar({ movimiento: v });
              if (r) setMovimiento(v);
            }}
          />
          Movimiento lento
        </label>
      </div>
      <p className="text-xs text-tinta-tenue">
        Una escena del juego o de la serie, horizontal (1920×820 o similar), hasta {MEDIO_MAX_MB}{' '}
        MB. Para que se vea en movimiento de verdad, sube un WebP animado (puedes convertir un clip
        corto en ezgif.com → «Video to WebP»). Con una imagen fija, «Movimiento lento» le da un
        acercamiento suave.
      </p>
      {aviso && <p className="text-sm text-peligro">{aviso}</p>}
      <ErrorGeneral error={error} />
    </div>
  );
}

type Estreno = EstrenoServicio & { clave: string };
let siguiente = 0;
const conClave = (e: EstrenoServicio): Estreno => ({ ...e, clave: `e${siguiente++}` });

export function CarteleraServicio({ servicio }: { servicio: ServicioPublico }) {
  const { guardar, cargando, error } = useGuardarVitrina(servicio.id);
  const { subir, subiendo, aviso } = useSubirImagen();
  const [titulo, setTitulo] = useState(servicio.vitrina.tituloCartelera ?? '');
  const [items, setItems] = useState<Estreno[]>(servicio.vitrina.cartelera.map(conClave));
  const [combos, setCombos] = useState(servicio.vitrina.combos);
  const [guardado, setGuardado] = useState(false);

  const cambiar = (clave: string, parte: Partial<EstrenoServicio>) => {
    setItems((l) => l.map((x) => (x.clave === clave ? { ...x, ...parte } : x)));
    setGuardado(false);
  };
  const mover = (i: number, d: -1 | 1) => {
    setItems((l) => {
      const n = [...l];
      const [x] = n.splice(i, 1);
      n.splice(i + d, 0, x!);
      return n;
    });
    setGuardado(false);
  };

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const r = await guardar({
      tituloCartelera: titulo.trim() || null,
      cartelera: items.map(({ titulo: t, etiqueta, imagenId }) => ({
        titulo: t.trim(),
        etiqueta: etiqueta?.trim() || null,
        imagenId,
      })),
    });
    setGuardado(Boolean(r));
  }

  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <label className="flex items-center gap-3 rounded-2xl border border-borde p-3.5 text-sm">
        <Interruptor
          activo={combos}
          aria-label="Carril de combos"
          onCambiar={async (v) => {
            const r = await guardar({ combos: v });
            if (r) setCombos(v);
          }}
        />
        <span className="grid leading-tight">
          <b>Carril de combos</b>
          <small className="text-tinta-tenue">
            Muestra en la página los combos que incluyen este servicio (se crean en Catálogo →
            Combos).
          </small>
        </span>
      </label>

      <div className="grid gap-1.5">
        <label htmlFor="titulo-cartelera" className="text-sm font-semibold">
          Cartelera de estrenos
        </label>
        <input
          id="titulo-cartelera"
          value={titulo}
          maxLength={60}
          onChange={(e) => {
            setTitulo(e.currentTarget.value);
            setGuardado(false);
          }}
          placeholder="Estrenos de la semana"
          className={clasesEntrada}
        />
        <p className="text-xs text-tinta-tenue">
          Pósters verticales (2:3, por ejemplo 600×900) de lo nuevo en el servicio. Vacía, no se
          muestra.
        </p>
      </div>

      {items.length > 0 && (
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((x, i) => (
            <li
              key={x.clave}
              className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 rounded-2xl border border-borde p-2.5"
            >
              <img
                src={urlMedio(x.imagenId)}
                alt=""
                className="aspect-[2/3] w-20 rounded-xl border border-borde object-cover"
              />
              <div className="grid content-start gap-2">
                <input
                  aria-label={`Título de la tarjeta ${i + 1}`}
                  value={x.titulo}
                  maxLength={80}
                  onChange={(e) => cambiar(x.clave, { titulo: e.currentTarget.value })}
                  placeholder="Título"
                  className={clsx(clasesEntrada, 'h-9')}
                />
                <input
                  aria-label={`Etiqueta de la tarjeta ${i + 1}`}
                  value={x.etiqueta ?? ''}
                  maxLength={30}
                  onChange={(e) => cambiar(x.clave, { etiqueta: e.currentTarget.value })}
                  placeholder="Etiqueta (Estreno, TOP 1…)"
                  className={clsx(clasesEntrada, 'h-9')}
                />
                <div className="flex gap-1">
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    aria-label="Subir"
                    disabled={i === 0}
                    onClick={() => mover(i, -1)}
                    icono={<ArrowUp className="size-4" />}
                  />
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    aria-label="Bajar"
                    disabled={i === items.length - 1}
                    onClick={() => mover(i, 1)}
                    icono={<ArrowDown className="size-4" />}
                  />
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    aria-label={`Quitar ${x.titulo || 'tarjeta'}`}
                    onClick={() => {
                      setItems((l) => l.filter((y) => y.clave !== x.clave));
                      setGuardado(false);
                    }}
                    icono={<Trash2 className="size-4" />}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {items.length < MAX_ESTRENOS_SERVICIO && (
          <BotonSubir
            texto="Agregar póster"
            subiendo={subiendo}
            onElegir={async (f) => {
              const id = await subir(f, `Póster en ${servicio.nombre}`);
              if (id) {
                const nombre = f.name
                  .replace(/\.[^.]+$/, '')
                  .replace(/[-_]+/g, ' ')
                  .slice(0, 80);
                setItems((l) => [
                  ...l,
                  conClave({ titulo: nombre, etiqueta: 'Estreno', imagenId: id }),
                ]);
                setGuardado(false);
              }
            }}
          />
        )}
        <Boton type="submit" cargando={cargando}>
          Guardar cartelera
        </Boton>
        {guardado && (
          <p role="status" className="text-sm font-medium text-exito">
            Guardada.
          </p>
        )}
      </div>
      {aviso && <p className="text-sm text-peligro">{aviso}</p>}
      <ErrorGeneral error={error} />
    </form>
  );
}

// ── Preguntas frecuentes ─────────────────────────────────────────────────────

type Pregunta = PreguntaServicio & { clave: string };
const conClaveP = (p: PreguntaServicio): Pregunta => ({ ...p, clave: `p${siguiente++}` });

export function PreguntasServicio({ servicio }: { servicio: ServicioPublico }) {
  const { guardar, cargando, error, campos } = useGuardarVitrina(servicio.id);
  const [lista, setLista] = useState<Pregunta[]>(servicio.vitrina.preguntas.map(conClaveP));
  const [guardado, setGuardado] = useState(false);
  const cambiar = (clave: string, parte: Partial<PreguntaServicio>) => {
    setLista((l) => l.map((x) => (x.clave === clave ? { ...x, ...parte } : x)));
    setGuardado(false);
  };

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const r = await guardar({
      preguntas: lista
        .filter((p) => p.pregunta.trim() || p.respuesta.trim())
        .map(({ pregunta, respuesta }) => ({
          pregunta: pregunta.trim(),
          respuesta: respuesta.trim(),
        })),
    });
    setGuardado(Boolean(r));
  }

  const errorDe = (i: number, campo: string) => campos[`vitrina.preguntas.${i}.${campo}`];

  return (
    <form onSubmit={enviar} className="grid gap-3" noValidate>
      {lista.length === 0 && (
        <p className="rounded-2xl border border-dashed border-borde-fuerte px-4 py-5 text-center text-sm text-tinta-suave">
          Sin preguntas propias: la página muestra las preguntas generales de la tienda.
        </p>
      )}
      <ol className="grid gap-3">
        {lista.map((p, i) => (
          <li key={p.clave} className="grid gap-2 rounded-2xl border border-borde p-3.5">
            <div className="flex items-center gap-2">
              <span className="font-titulo text-sm font-bold text-cian">
                {String(i + 1).padStart(2, '0')}
              </span>
              <input
                aria-label={`Pregunta ${i + 1}`}
                value={p.pregunta}
                maxLength={160}
                onChange={(e) => cambiar(p.clave, { pregunta: e.currentTarget.value })}
                placeholder="¿Funciona en Smart TV?"
                className={clsx(clasesEntrada, 'h-10 font-semibold')}
              />
              <Boton
                tamano="sm"
                variante="fantasma"
                aria-label={`Quitar la pregunta ${i + 1}`}
                onClick={() => {
                  setLista((l) => l.filter((x) => x.clave !== p.clave));
                  setGuardado(false);
                }}
                icono={<Trash2 className="size-4" />}
              />
            </div>
            {errorDe(i, 'pregunta') && (
              <p className="text-xs text-peligro">{errorDe(i, 'pregunta')}</p>
            )}
            <textarea
              aria-label={`Respuesta ${i + 1}`}
              value={p.respuesta}
              rows={2}
              maxLength={800}
              onChange={(e) => cambiar(p.clave, { respuesta: e.currentTarget.value })}
              placeholder="Sí: entras con el correo y la contraseña que te damos en Mis accesos."
              className={clsx(clasesEntrada, 'h-auto py-2')}
            />
            {errorDe(i, 'respuesta') && (
              <p className="text-xs text-peligro">{errorDe(i, 'respuesta')}</p>
            )}
          </li>
        ))}
      </ol>
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap items-center gap-3">
        {lista.length < MAX_PREGUNTAS_SERVICIO && (
          <Boton
            variante="secundario"
            icono={<Plus className="size-4" />}
            onClick={() => setLista((l) => [...l, conClaveP({ pregunta: '', respuesta: '' })])}
          >
            Agregar pregunta
          </Boton>
        )}
        <Boton type="submit" cargando={cargando}>
          Guardar preguntas
        </Boton>
        {guardado && (
          <p role="status" className="text-sm font-medium text-exito">
            Guardadas.
          </p>
        )}
      </div>
    </form>
  );
}

// ── Comentarios: moderación ──────────────────────────────────────────────────

const fecha = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric' });

function FilaComentario({ c }: { c: ComentarioEquipo }) {
  const { ejecutar, cargando, error } = useAccion();
  const [respondiendo, setRespondiendo] = useState(false);
  const [respuesta, setRespuesta] = useState(c.respuesta ?? '');

  return (
    <li className={clsx('grid gap-2 px-5 py-4 sm:px-6', c.oculto && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <b>{c.usuario.nombre}</b>
        <span className="text-xs text-tinta-tenue">{c.usuario.correo}</span>
        {c.compro && (
          <span className="rounded-full bg-exito/15 px-2 py-0.5 text-[0.7rem] font-semibold text-exito">
            Compró
          </span>
        )}
        {c.oculto && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.7rem] font-semibold">
            Oculto
          </span>
        )}
        <span className="ml-auto text-xs text-tinta-tenue">
          {fecha.format(new Date(c.creadoEn))}
        </span>
      </div>
      {c.estrellas && (
        <span className="flex gap-0.5 text-[#fbbf24]" aria-label={`${c.estrellas} de 5 estrellas`}>
          {Array.from({ length: 5 }, (_, i) => (
            <Star
              key={i}
              className={clsx('size-3.5', i < c.estrellas! ? 'fill-current' : 'opacity-30')}
              aria-hidden="true"
            />
          ))}
        </span>
      )}
      <p className="text-sm whitespace-pre-wrap">{c.texto}</p>
      {respondiendo ? (
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await ejecutar('PATCH', `/catalogo/comentarios/${c.id}`, {
              respuesta: respuesta.trim() || null,
            });
            if (r) setRespondiendo(false);
          }}
        >
          <textarea
            aria-label="Respuesta del equipo"
            rows={2}
            maxLength={600}
            value={respuesta}
            onChange={(e) => setRespuesta(e.currentTarget.value)}
            className={clsx(clasesEntrada, 'h-auto py-2')}
          />
          <div className="flex gap-2">
            <Boton type="submit" tamano="sm" cargando={cargando}>
              Publicar respuesta
            </Boton>
            <Boton tamano="sm" variante="fantasma" onClick={() => setRespondiendo(false)}>
              Cancelar
            </Boton>
          </div>
        </form>
      ) : (
        c.respuesta && (
          <p className="rounded-xl border-l-2 border-marca bg-marca/10 px-3 py-2 text-sm">
            <b className="mr-1">Equipo:</b>
            {c.respuesta}
          </p>
        )
      )}
      <div className="flex flex-wrap gap-2">
        {!respondiendo && (
          <Boton tamano="sm" variante="secundario" onClick={() => setRespondiendo(true)}>
            {c.respuesta ? 'Editar respuesta' : 'Responder'}
          </Boton>
        )}
        <Boton
          tamano="sm"
          variante="fantasma"
          cargando={cargando && !respondiendo}
          icono={c.oculto ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          onClick={() =>
            void ejecutar('PATCH', `/catalogo/comentarios/${c.id}`, { oculto: !c.oculto })
          }
        >
          {c.oculto ? 'Mostrar' : 'Ocultar'}
        </Boton>
      </div>
      <ErrorGeneral error={error} />
    </li>
  );
}

export function ModerarComentarios({ comentarios }: { comentarios: ComentarioEquipo[] }) {
  if (comentarios.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-tinta-suave sm:px-6">
        Todavía nadie comenta este servicio. Los comentarios salen al final de su página en la
        tienda.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-borde">
      {comentarios.map((c) => (
        <FilaComentario key={c.id} c={c} />
      ))}
    </ul>
  );
}

// ── Nuevo servicio desde la cuadrícula ───────────────────────────────────────

export function NuevoServicio({ proveedores }: { proveedores: ProveedorPublico[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  if (!abierto) {
    return (
      <Boton
        icono={<Plus className="size-4" />}
        onClick={() => setAbierto(true)}
        disabled={proveedores.length === 0}
        title={proveedores.length === 0 ? 'Primero crea un proveedor en Catálogo' : undefined}
      >
        Nuevo servicio
      </Boton>
    );
  }
  return (
    <PanelFormulario titulo="Nuevo servicio" onCerrar={() => setAbierto(false)} className="w-full">
      <FormularioServicio
        proveedores={proveedores}
        onListo={(id) => {
          setAbierto(false);
          if (id) router.push(`/editor/servicios/${id}?pestana=precios`);
        }}
      />
    </PanelFormulario>
  );
}
