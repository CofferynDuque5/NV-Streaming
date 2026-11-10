'use client';

import {
  claveDato,
  type DatoRequerido,
  MAX_DATOS_REQUERIDOS,
  MEDIO_MAX_MB,
  type MedioSitio,
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

type Fila = { id: number; etiqueta: string; ayuda: string; obligatorio: boolean };

/**
 * Datos que el cliente escribe al comprar (p. ej. «ID de jugador», «Servidor»).
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
    })),
  );
  const cambiar = (n: number, cambio: Partial<Fila>) =>
    setFilas((l) => l.map((f) => (f.id === n ? { ...f, ...cambio } : f)));

  return (
    <fieldset className="grid gap-3 rounded-xl border border-borde bg-hundida/50 p-4">
      <legend className="px-1 text-sm font-medium">Datos que pide al comprar</legend>
      <p id={`${id}-a`} className="text-xs text-tinta-tenue">
        Para juegos y servicios que necesitan datos del cliente: ID de jugador, servidor, zona,
        usuario… El cliente los escribe en el carrito y el equipo los ve en Entregas. Déjalo vacío
        si no hace falta.
      </p>
      {filas.map((f, i) => (
        <div
          key={f.id}
          className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto_auto]"
        >
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
          <button
            type="button"
            className="grid size-11 place-items-center rounded-xl text-tinta-suave hover:bg-white/5 hover:text-peligro"
            aria-label={`Quitar el dato ${f.etiqueta || i + 1}`}
            onClick={() => setFilas((l) => l.filter((x) => x.id !== f.id))}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
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
            })),
        )}
      />
      {filas.length < MAX_DATOS_REQUERIDOS && (
        <div>
          <Boton
            variante="secundario"
            tamano="sm"
            icono={<Plus className="size-4" />}
            onClick={() =>
              setFilas((l) => [
                ...l,
                { id: siguiente.current++, etiqueta: '', ayuda: '', obligatorio: true },
              ])
            }
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
