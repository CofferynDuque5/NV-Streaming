import { ImagePlus, X } from 'lucide-react';

/** Imagen adjunta de un mensaje de soporte: se abre completa en otra pestaña. */
export function ImagenAdjunta({ src }: { src: string }) {
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-fit overflow-hidden rounded-xl border border-borde"
    >
      <img
        src={src}
        alt="Imagen adjunta"
        loading="lazy"
        className="max-h-72 max-w-full object-contain"
      />
    </a>
  );
}

const TIPOS = 'image/jpeg,image/png,image/webp';

/** Botón «Adjuntar imagen» y el nombre del archivo elegido, con opción de quitarlo. */
export function ElegirImagen({
  archivo,
  onCambio,
  error,
}: {
  archivo: File | null;
  onCambio: (f: File | null) => void;
  error?: string | undefined;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-borde px-3 py-1.5 text-sm font-medium text-tinta-suave hover:border-marca/50 hover:text-tinta focus-within:outline-2 focus-within:outline-marca">
          <ImagePlus className="size-4" aria-hidden="true" />
          {archivo ? 'Cambiar imagen' : 'Adjuntar imagen'}
          <input
            type="file"
            accept={TIPOS}
            className="sr-only"
            onChange={(e) => {
              onCambio(e.currentTarget.files?.[0] ?? null);
              e.currentTarget.value = '';
            }}
          />
        </label>
        {archivo && (
          <span className="inline-flex max-w-full items-center gap-1.5 text-sm text-tinta-suave">
            <span className="truncate">{archivo.name}</span>
            <button
              type="button"
              onClick={() => onCambio(null)}
              className="rounded-full p-0.5 hover:text-peligro"
              aria-label="Quitar la imagen"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
      <small className={error ? 'text-xs text-peligro' : 'text-xs text-tinta-tenue'}>
        {error ?? 'Una captura en JPG, PNG o WebP.'}
      </small>
    </div>
  );
}
