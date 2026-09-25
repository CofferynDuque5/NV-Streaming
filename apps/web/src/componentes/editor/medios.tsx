'use client';

import { MEDIO_MAX_MB, type MedioSitio } from '@nv/shared';
import clsx from 'clsx';
import { ImagePlus, Upload, X } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';

/**
 * Biblioteca de imágenes: elegir una existente o subir una nueva (JPG, PNG o
 * WebP). Las imágenes se sirven públicamente, así que nunca subas documentos.
 */
export function SelectorMedio({
  medios,
  seleccionado,
  onElegir,
  onSubido,
}: {
  medios: MedioSitio[];
  seleccionado: string | null | undefined;
  onElegir: (m: MedioSitio) => void;
  onSubido: (m: MedioSitio) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const idArchivo = useId();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const actual = medios.find((m) => m.id === seleccionado);
  const campos = erroresPorCampo(error);

  async function subir(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const datos = new FormData(formulario);
    const archivo = datos.get('archivo');
    if (!(archivo instanceof File) || archivo.size === 0) {
      setError({
        estado: 400,
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'Elige una imagen.',
        campos: { archivo: ['Elige una imagen.'] },
      });
      return;
    }
    if (archivo.size > MEDIO_MAX_MB * 1024 * 1024) {
      setError({
        estado: 413,
        codigo: 'CONTENIDO_DEMASIADO_GRANDE',
        mensaje: `La imagen no puede superar ${MEDIO_MAX_MB} MB.`,
      });
      return;
    }
    setSubiendo(true);
    setError(null);
    const r = await llamarApi<MedioSitio>('POST', '/sitio/medios', datos);
    setSubiendo(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    formulario.reset();
    onSubido(r.datos);
    onElegir(r.datos);
    setAbierto(false);
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {actual ? (
          <img
            src={actual.url}
            alt=""
            className="size-16 shrink-0 rounded-lg border border-borde object-cover"
          />
        ) : (
          <span className="grid size-16 shrink-0 place-items-center rounded-lg border border-dashed border-borde-fuerte text-tinta-tenue">
            <ImagePlus className="size-5" aria-hidden="true" />
          </span>
        )}
        <Boton variante="secundario" tamano="sm" onClick={() => setAbierto((v) => !v)}>
          {abierto ? 'Cerrar biblioteca' : actual ? 'Cambiar imagen' : 'Elegir imagen'}
        </Boton>
      </div>

      {abierto && (
        <div className="grid gap-4 rounded-xl border border-borde bg-hundida/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Biblioteca de imágenes</p>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-lg p-1 text-tinta-tenue hover:text-tinta"
              aria-label="Cerrar biblioteca"
            >
              <X className="size-4" />
            </button>
          </div>
          {medios.length === 0 ? (
            <p className="text-sm text-tinta-suave">Todavía no hay imágenes. Sube la primera.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {medios.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onElegir(m);
                      setAbierto(false);
                    }}
                    title={m.textoAlternativo}
                    aria-pressed={m.id === seleccionado}
                    className={clsx(
                      'block aspect-square w-full overflow-hidden rounded-lg border-2',
                      m.id === seleccionado
                        ? 'border-marca'
                        : 'border-transparent hover:border-borde-fuerte',
                    )}
                  >
                    <img
                      src={m.url}
                      alt={m.textoAlternativo}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={subir} className="grid gap-3 border-t border-borde pt-3" noValidate>
            <p className="text-sm font-medium">Subir una imagen</p>
            <div className="grid gap-1.5">
              <label htmlFor={idArchivo} className="text-sm">
                Archivo (JPG, PNG o WebP, hasta {MEDIO_MAX_MB} MB)
              </label>
              <input
                id={idArchivo}
                name="archivo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-elevada file:px-3 file:py-1.5 file:text-sm file:text-tinta"
              />
              {campos.archivo && (
                <p className="text-xs font-medium text-peligro">{campos.archivo}</p>
              )}
            </div>
            <Campo
              etiqueta="Texto alternativo"
              name="textoAlternativo"
              maxLength={200}
              required
              ayuda="Describe lo que se ve, para quien no puede verla."
              error={campos.textoAlternativo}
            />
            {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
            <Boton
              type="submit"
              tamano="sm"
              className="w-fit"
              cargando={subiendo}
              icono={<Upload className="size-4" />}
            >
              Subir y usar
            </Boton>
          </form>
        </div>
      )}
    </div>
  );
}
