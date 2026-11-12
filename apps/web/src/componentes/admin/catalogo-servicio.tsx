'use client';

import {
  claveDato,
  type DatoRequerido,
  ETIQUETA_TIPO_DATO,
  MAX_DATOS_REQUERIDOS,
  MAX_OPCIONES_DATO,
  MEDIO_MAX_MB,
  type MedioSitio,
  TIPOS_DATO,
  type TipoDato,
} from '@nv/shared';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { type ChangeEvent, useId, useRef, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { clasesEntrada } from '@/componentes/ui/clases';
import { llamarApi } from '@/lib/api-cliente';

const TIPOS_IMAGEN = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Logo o imagen del servicio: se sube a la biblioteca del sitio y el servicio
 * guarda su id (campo oculto `imagenId`). Sin imagen, la tienda usa la tarjeta
 * de la marca (si el slug es de una marca conocida) o un ícono.
 */
export function ImagenServicio({
  nombre,
  inicial,
  error,
}: {
  nombre: string;
  inicial: { id: string; url: string } | null;
  error?: string | undefined;
}) {
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [imagen, setImagen] = useState(inicial);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState('');

  async function elegir(e: ChangeEvent<HTMLInputElement>) {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!f) return;
    if (!TIPOS_IMAGEN.includes(f.type)) {
      setAviso('Elige una imagen PNG, JPG o WebP.');
      return;
    }
    if (f.size > MEDIO_MAX_MB * 1048576) {
      setAviso(`La imagen pesa más de ${MEDIO_MAX_MB} MB.`);
      return;
    }
    setAviso('');
    const datos = new FormData();
    datos.append('archivo', f);
    datos.append('textoAlternativo', `Logo de ${nombre.trim() || 'el servicio'}`);
    setSubiendo(true);
    const r = await llamarApi<MedioSitio>('POST', '/sitio/medios', datos);
    setSubiendo(false);
    if (!r.ok) {
      setAviso(r.error.mensaje);
      return;
    }
    setImagen({ id: r.datos.id, url: r.datos.url });
  }

  const mensaje = aviso || error;
  return (
    <div className="grid content-start gap-1.5">
      <span id={`${id}-t`} className="text-sm font-semibold text-tinta">
        Logo o imagen
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-borde bg-hundida">
          {imagen ? (
            <img src={imagen.url} alt="" className="size-full object-contain" />
          ) : (
            <ImagePlus className="size-6 text-tinta-tenue" aria-hidden="true" />
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <Boton
            variante="secundario"
            tamano="sm"
            cargando={subiendo}
            onClick={() => entrada.current?.click()}
            aria-describedby={`${id}-a`}
          >
            {imagen ? 'Cambiar imagen' : 'Subir imagen'}
          </Boton>
          {imagen && (
            <Boton variante="fantasma" tamano="sm" onClick={() => setImagen(null)}>
              Quitar
            </Boton>
          )}
        </div>
        <input
          ref={entrada}
          type="file"
          accept={TIPOS_IMAGEN.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-labelledby={`${id}-t`}
          onChange={(e) => void elegir(e)}
        />
        <input type="hidden" name="imagenId" value={imagen?.id ?? ''} />
      </div>
      <p id={`${id}-a`} className="text-xs text-tinta-tenue">
        PNG, JPG o WebP de hasta {MEDIO_MAX_MB} MB. Mejor vertical (como una tarjeta) o cuadrada,
        con fondo transparente. Sin imagen se usa la tarjeta de la marca o un ícono.
      </p>
      {mensaje && (
        <p role="alert" className="text-xs font-medium text-peligro">
          {mensaje}
        </p>
      )}
    </div>
  );
}

type Fila = {
  id: number;
  etiqueta: string;
  ayuda: string;
  obligatorio: boolean;
  tipo: TipoDato;
  opciones: string;
  largo: string;
};

type Plantilla = Omit<Fila, 'id'>;
const fila = (p: Partial<Plantilla> & { etiqueta: string }): Plantilla => ({
  ayuda: '',
  obligatorio: true,
  tipo: 'texto',
  opciones: '',
  largo: '',
  ...p,
});

/** Atajos para los casos más comunes; se pueden editar después. */
const PLANTILLAS: { nombre: string; filas: Plantilla[] }[] = [
  {
    nombre: 'ID de jugador',
    filas: [
      fila({ etiqueta: 'ID de jugador', tipo: 'numero', ayuda: 'Lo ves en tu perfil del juego' }),
    ],
  },
  {
    nombre: 'ID + Zona',
    filas: [
      fila({ etiqueta: 'ID de jugador', tipo: 'numero' }),
      fila({ etiqueta: 'Zona', tipo: 'numero', largo: '6', ayuda: 'El número entre paréntesis' }),
    ],
  },
  {
    nombre: 'Inicio de sesión',
    filas: [
      fila({
        etiqueta: 'Forma de acceso',
        tipo: 'lista',
        opciones: 'Activision, Facebook, Google',
      }),
      fila({ etiqueta: 'Correo o usuario', tipo: 'texto' }),
      fila({ etiqueta: 'Contraseña', tipo: 'clave', ayuda: 'Se guarda cifrada' }),
    ],
  },
  { nombre: 'Correo', filas: [fila({ etiqueta: 'Correo', tipo: 'correo' })] },
];

const opcionesDe = (texto: string) =>
  [
    ...new Set(
      texto
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  ].slice(0, MAX_OPCIONES_DATO);

/**
 * Datos que el cliente escribe al comprar (p. ej. «ID de jugador», «Zona»).
 * Se envían en `datosRequeridos` con `leerDatosRequeridos`.
 */
export function DatosRequeridosServicio({
  iniciales,
  error,
}: {
  iniciales: DatoRequerido[];
  error?: string | undefined;
}) {
  const id = useId();
  const siguiente = useRef(iniciales.length);
  const [filas, setFilas] = useState<Fila[]>(
    iniciales.map((d, i) => ({
      id: i,
      etiqueta: d.etiqueta,
      ayuda: d.ayuda ?? '',
      obligatorio: d.obligatorio,
      tipo: d.tipo ?? 'texto',
      opciones: (d.opciones ?? []).join(', '),
      largo: d.largo ? String(d.largo) : '',
    })),
  );
  const cambiar = (n: number, cambio: Partial<Fila>) =>
    setFilas((l) => l.map((f) => (f.id === n ? { ...f, ...cambio } : f)));
  const agregar = (nuevas: Plantilla[]) =>
    setFilas((l) => {
      const usadas = new Set(l.map((f) => claveDato(f.etiqueta)));
      const extra = nuevas
        .filter((n) => !n.etiqueta || !usadas.has(claveDato(n.etiqueta)))
        .map((n) => ({ ...n, id: siguiente.current++ }));
      return [...l, ...extra].slice(0, MAX_DATOS_REQUERIDOS);
    });

  return (
    <fieldset className="grid gap-3 rounded-xl border border-borde bg-hundida/50 p-4">
      <legend className="px-1 text-sm font-medium">Datos que pide al comprar</legend>
      <p id={`${id}-a`} className="text-xs text-tinta-tenue">
        Para juegos y servicios que necesitan datos del cliente: ID de jugador, zona, usuario… El
        cliente los escribe en la ficha del producto y el equipo los ve en Entregas. Las contraseñas
        se guardan cifradas. Déjalo vacío si no hace falta.
      </p>
      {filas.length < MAX_DATOS_REQUERIDOS && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-tinta-suave">Plantillas:</span>
          {PLANTILLAS.map((p) => (
            <button
              key={p.nombre}
              type="button"
              className="min-h-9 rounded-full border border-borde px-3 text-xs font-medium hover:border-acento hover:text-acento"
              onClick={() => agregar(p.filas)}
            >
              + {p.nombre}
            </button>
          ))}
        </div>
      )}
      {filas.map((f, i) => (
        <div key={f.id} className="grid gap-2 rounded-xl border border-borde bg-superficie p-3">
          <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
            <label className="grid gap-1 text-xs font-semibold">
              Dato {i + 1}
              <input
                className={clasesEntrada}
                name="datoEtiqueta"
                value={f.etiqueta}
                maxLength={40}
                placeholder="ID de jugador"
                onChange={(e) => cambiar(f.id, { etiqueta: e.currentTarget.value })}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold">
              Cómo se escribe
              <select
                className={clasesEntrada}
                name="datoTipo"
                value={f.tipo}
                onChange={(e) => cambiar(f.id, { tipo: e.currentTarget.value as TipoDato })}
              >
                {TIPOS_DATO.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO_DATO[t]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="grid size-11 place-items-center rounded-xl text-tinta-suave hover:bg-white/5 hover:text-peligro"
              aria-label={`Quitar el dato ${f.etiqueta || i + 1}`}
              onClick={() => setFilas((l) => l.filter((x) => x.id !== f.id))}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
          {f.tipo === 'lista' && (
            <label className="grid gap-1 text-xs font-semibold">
              Opciones, separadas por coma
              <input
                className={clasesEntrada}
                name="datoOpciones"
                value={f.opciones}
                maxLength={400}
                placeholder="Activision, Facebook, Google"
                onChange={(e) => cambiar(f.id, { opciones: e.currentTarget.value })}
              />
            </label>
          )}
          <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
            <label className="grid gap-1 text-xs font-semibold">
              Ayuda (opcional)
              <input
                className={clasesEntrada}
                name="datoAyuda"
                value={f.ayuda}
                maxLength={120}
                placeholder="Lo ves en tu perfil del juego"
                onChange={(e) => cambiar(f.id, { ayuda: e.currentTarget.value })}
              />
            </label>
            {f.tipo === 'texto' || f.tipo === 'numero' ? (
              <label className="grid gap-1 text-xs font-semibold">
                Largo máx.
                <input
                  className={clasesEntrada}
                  name="datoLargo"
                  inputMode="numeric"
                  value={f.largo}
                  placeholder="Sin límite"
                  onChange={(e) =>
                    cambiar(f.id, { largo: e.currentTarget.value.replace(/\D/g, '').slice(0, 3) })
                  }
                />
              </label>
            ) : (
              <span aria-hidden="true" />
            )}
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="datoObligatorio"
                value={String(f.id)}
                checked={f.obligatorio}
                onChange={(e) => cambiar(f.id, { obligatorio: e.currentTarget.checked })}
              />
              Obligatorio
            </label>
          </div>
        </div>
      ))}
      <input
        type="hidden"
        name="datosRequeridos"
        value={JSON.stringify(
          filas
            .filter((f) => f.etiqueta.trim())
            .map((f) => ({
              clave: claveDato(f.etiqueta),
              etiqueta: f.etiqueta.trim(),
              ayuda: f.ayuda.trim() || null,
              obligatorio: f.obligatorio,
              tipo: f.tipo,
              opciones: f.tipo === 'lista' ? opcionesDe(f.opciones) : [],
              largo:
                (f.tipo === 'texto' || f.tipo === 'numero') && Number(f.largo) > 0
                  ? Math.min(120, Number(f.largo))
                  : null,
            })),
        )}
      />
      {filas.length < MAX_DATOS_REQUERIDOS && (
        <div>
          <Boton
            variante="secundario"
            tamano="sm"
            icono={<Plus className="size-4" />}
            onClick={() => agregar([fila({ etiqueta: '' })])}
          >
            Añadir dato
          </Boton>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-peligro">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Lee lo que dejó `DatosRequeridosServicio` en el formulario. */
export function leerDatosRequeridos(d: FormData): DatoRequerido[] {
  try {
    const v: unknown = JSON.parse(String(d.get('datosRequeridos') ?? '[]'));
    return Array.isArray(v) ? (v as DatoRequerido[]) : [];
  } catch {
    return [];
  }
}
