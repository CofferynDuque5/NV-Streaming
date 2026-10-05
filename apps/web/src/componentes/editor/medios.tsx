'use client';

import { MEDIO_MAX_MB, type MedioSitio } from '@nv/shared';
import clsx from 'clsx';
import { Upload, X } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { llamarApi } from '@/lib/api-cliente';
import { CampoTexto } from './piezas';

const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

const peso = (bytes: number) =>
  bytes > 1048576
    ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Biblioteca de imágenes (dentro del panel lateral del editor): tocar una la usa en el bloque;
 * también se sube una nueva (JPG, PNG o WebP hasta 4 MB) con su texto
 * alternativo obligatorio. Las imágenes se sirven públicamente.
 */
export function BibliotecaMedios({
  medios,
  actual,
  onElegir,
  onSubido,
}: {
  medios: MedioSitio[];
  actual: string | null;
  onElegir: (m: MedioSitio) => void;
  onSubido: (m: MedioSitio) => void;
}) {
  const notificar = useNotificar();
  const [archivo, setArchivo] = useState<{ file: File; url: string } | null>(null);
  const [errorArchivo, setErrorArchivo] = useState('');
  const [alt, setAlt] = useState('');
  const [altTocado, setAltTocado] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => () => (archivo ? URL.revokeObjectURL(archivo.url) : undefined), [archivo]);

  const errorAlt = !alt.trim() ? 'Escribe el texto alternativo para continuar' : undefined;

  function elegirArchivo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!f) return;
    if (!TIPOS.includes(f.type)) {
      const ext = (f.name.split('.').pop() || 'otro tipo').toUpperCase();
      setErrorArchivo(`Ese archivo es ${ext}. Usa JPG, PNG o WebP.`);
      return;
    }
    if (f.size > MEDIO_MAX_MB * 1048576) {
      setErrorArchivo(`Pesa ${peso(f.size)}. El máximo es ${MEDIO_MAX_MB} MB.`);
      return;
    }
    setErrorArchivo('');
    setArchivo({ file: f, url: URL.createObjectURL(f) });
    window.setTimeout(() => document.getElementById('medio-alt')?.focus(), 60);
  }

  async function subir(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAltTocado(true);
    if (!archivo || errorAlt) {
      document.getElementById('medio-alt')?.focus();
      return;
    }
    const datos = new FormData();
    datos.append('textoAlternativo', alt.trim());
    datos.append('archivo', archivo.file);
    setSubiendo(true);
    const r = await llamarApi<MedioSitio>('POST', '/sitio/medios', datos);
    setSubiendo(false);
    if (!r.ok) {
      notificar(r.error.mensaje, 'error');
      return;
    }
    onSubido(r.datos);
    onElegir(r.datos);
    notificar(`Imagen subida y elegida: ${r.datos.nombre}`);
  }

  return (
    <>
      {archivo ? (
        <form className="ed-subida" onSubmit={subir} noValidate>
          <div className="flex items-center gap-3">
            <img src={archivo.url} alt="" className="size-14 shrink-0 rounded-xl object-contain" />
            <div className="grid min-w-0 flex-1">
              <b className="truncate text-sm">{archivo.file.name}</b>
              <span className="text-xs text-tinta-suave">
                {peso(archivo.file.size)} · lista para subir
              </span>
            </div>
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-borde hover:border-borde-fuerte"
              aria-label="Quitar archivo"
              onClick={() => setArchivo(null)}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <CampoTexto
            id="medio-alt"
            etiqueta="Texto alternativo"
            max={200}
            value={alt}
            autoComplete="off"
            placeholder="Ej.: Tarjeta de Netflix sobre fondo azul"
            ayuda="Obligatorio. Describe la imagen para quien no la ve."
            error={altTocado ? errorAlt : undefined}
            ok={altTocado && !errorAlt}
            onChange={(e) => {
              setAlt(e.currentTarget.value);
              setAltTocado(true);
            }}
          />
          <Boton
            type="submit"
            className="w-fit"
            cargando={subiendo}
            icono={<Upload className="size-4" />}
          >
            {subiendo ? 'Subiendo…' : 'Subir y usar'}
          </Boton>
        </form>
      ) : (
        <div className="grid gap-2">
          <label className="ed-soltar">
            <Upload className="size-6 text-cian" aria-hidden="true" />
            <b>Subir imagen</b>
            <span>JPG, PNG o WebP de hasta {MEDIO_MAX_MB} MB</span>
            <input
              type="file"
              accept={TIPOS.join(',')}
              className="sr-only"
              onChange={elegirArchivo}
              aria-label="Subir imagen"
            />
          </label>
          {errorArchivo && (
            <p role="alert" className="text-xs font-medium text-peligro">
              {errorArchivo}
            </p>
          )}
        </div>
      )}
      <span className="text-[0.7rem] font-bold tracking-[0.12em] text-tinta-tenue uppercase">
        En la biblioteca
      </span>
      {medios.length === 0 ? (
        <p className="text-sm text-tinta-suave">Todavía no hay imágenes. Sube la primera.</p>
      ) : (
        <>
          <div className="ed-medios">
            {medios.map((m) => (
              <button
                key={m.id}
                type="button"
                className={clsx('ed-med', actual === m.id && 'sel')}
                aria-label={`Usar ${m.nombre}`}
                aria-pressed={actual === m.id}
                onClick={() => onElegir(m)}
              >
                <span className="ed-med-img">
                  <img src={m.url} alt="" loading="lazy" />
                </span>
                <b>{m.nombre}</b>
                <small>{m.textoAlternativo}</small>
              </button>
            ))}
          </div>
          <p className="text-xs text-tinta-tenue">Toca una imagen para usarla en el bloque.</p>
        </>
      )}
    </>
  );
}

export const subtituloMedios = (n: number) =>
  `${n} ${n === 1 ? 'imagen' : 'imágenes'} · JPG, PNG o WebP hasta ${MEDIO_MAX_MB} MB`;
