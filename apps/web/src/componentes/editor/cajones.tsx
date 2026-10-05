'use client';

// Contenido de los paneles laterales del editor: añadir bloque, historial,
// publicar y datos de la página. El editor los muestra en un solo `Lateral`.
import {
  type BloqueSitio,
  MAX_BLOQUES,
  type PaginaSitioDetalle,
  TIPOS_BLOQUE,
  type TipoBloque,
} from '@nv/shared';
import clsx from 'clsx';
import { Check, Copy, History, Layers, TriangleAlert, Zap } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { Aviso, claseEnlace } from '@/componentes/cliente/piezas-cuenta';
import { Boton } from '@/componentes/ui/boton';
import { formatearFechaHora } from '@/lib/formato';
import { cambiosDesde, INFO_BLOQUES } from './modelo';
import { CampoArea, CampoTexto, Info } from './piezas';

/** Orbe pequeño con el icono y el color de un tipo de bloque. */
export function OrbeBloque({ tipo, className }: { tipo: TipoBloque; className?: string }) {
  const { icono: Icono, color } = INFO_BLOQUES[tipo];
  return (
    <span
      className={clsx('orbe orbe-sm size-8.5 text-[0.95rem] after:hidden', className)}
      style={{ '--c': color } as CSSProperties}
      aria-hidden="true"
    >
      <Icono />
    </span>
  );
}

const GRUPOS = [
  {
    grupo: 'contenido',
    nombre: 'Contenido',
    descripcion: 'Textos, imágenes y botones que escribes tú',
  },
  {
    grupo: 'tienda',
    nombre: 'Tienda en vivo',
    descripcion: 'Se llenan solos con datos de la tienda',
  },
] as const;

/** Galería para añadir un bloque, por grupos, con «N de 40». */
export function GaleriaBloques({
  n,
  despuesDe,
  onAnadir,
}: {
  n: number;
  despuesDe: { i: number; tipo: TipoBloque } | null;
  onAnadir: (t: TipoBloque) => void;
}) {
  const lleno = n >= MAX_BLOQUES;
  return (
    <>
      {lleno ? (
        <Aviso
          tono="aviso"
          icono={<TriangleAlert className="size-4" aria-hidden="true" />}
          titulo={`Llegaste al máximo de ${MAX_BLOQUES} bloques`}
        >
          Elimina uno para añadir otro.
        </Aviso>
      ) : (
        <Info icono={<Layers className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}>
          {despuesDe ? (
            <>
              Se añade después de{' '}
              <b>
                {despuesDe.i + 1} · {INFO_BLOQUES[despuesDe.tipo].nombre}
              </b>
              .
            </>
          ) : (
            'Se añade al final de la página.'
          )}
        </Info>
      )}
      {GRUPOS.map(({ grupo, nombre, descripcion }) => (
        <section key={grupo} className="grid gap-2.5" aria-label={nombre}>
          <header className="grid gap-0.5">
            <span className="text-[0.7rem] font-bold tracking-[0.12em] text-tinta-tenue uppercase">
              {nombre}
            </span>
            <small className="text-[0.78rem] text-tinta-suave">{descripcion}</small>
          </header>
          <div className="grid gap-2">
            {TIPOS_BLOQUE.filter((t) => INFO_BLOQUES[t].grupo === grupo).map((t) => (
              <button
                key={t}
                type="button"
                className="ed-tipo"
                disabled={lleno}
                onClick={() => onAnadir(t)}
              >
                <OrbeBloque tipo={t} />
                <span>
                  <b>{INFO_BLOQUES[t].nombre}</b>
                  <small>{INFO_BLOQUES[t].descripcion}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** Versiones publicadas (hasta 50), con «Copiar al borrador» confirmado en la misma página. */
export function HistorialVersiones({
  pagina,
  puedeCopiar,
  sucio,
  copiando,
  onCopiar,
}: {
  pagina: PaginaSitioDetalle;
  puedeCopiar: boolean;
  sucio: boolean;
  copiando: number | null;
  onCopiar: (numero: number) => void;
}) {
  const [confirmar, setConfirmar] = useState<number | null>(null);
  if (pagina.versiones.length === 0) {
    return (
      <div className="ed-vacio">
        <span className="orbe" style={{ '--c': '#94a3b8' } as CSSProperties} aria-hidden="true">
          <History />
        </span>
        <b>Aún no hay versiones</b>
        <p>Cada vez que se publica la página se guarda una versión aquí.</p>
      </div>
    );
  }
  return (
    <>
      <ol className="grid gap-2.5" aria-label="Versiones publicadas">
        {pagina.versiones.map((v) => (
          <li key={v.id} className={clsx('ed-ver', v.vigente && 'vivo')}>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-titulo text-[1.05rem] font-extrabold">v{v.numero}</span>
              {v.vigente && (
                <span className="inline-flex items-center gap-1 rounded-full border border-exito/40 px-1.5 py-px text-[0.6rem] font-bold tracking-[0.06em] text-exito uppercase">
                  En el sitio
                </span>
              )}
              <span className="ml-auto text-[0.78rem] whitespace-nowrap text-tinta-suave">
                {formatearFechaHora(v.publicadaEn)}
              </span>
            </div>
            <small className="text-[0.78rem] text-tinta-suave">
              Publicó {v.publicadaPor?.nombre ?? 'alguien del equipo'} · {v.bloques}{' '}
              {v.bloques === 1 ? 'bloque' : 'bloques'}
            </small>
            {v.nota && <p className="text-[0.84rem] text-[#dbe3ff] italic">“{v.nota}”</p>}
            {puedeCopiar &&
              (confirmar === v.numero ? (
                <div
                  className="ed-confirma az"
                  role="alertdialog"
                  aria-labelledby={`cf-v${v.numero}`}
                >
                  <b id={`cf-v${v.numero}`}>¿Copiar la versión {v.numero} al borrador?</b>
                  <p>
                    Tu borrador se reemplaza por esta versión ({v.bloques}{' '}
                    {v.bloques === 1 ? 'bloque' : 'bloques'})
                    {sucio ? ' y se pierden los cambios sin guardar' : ''}. Para que se vea en la
                    tienda, después hay que publicar.
                  </p>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <Boton
                      tamano="sm"
                      cargando={copiando === v.numero}
                      onClick={() => onCopiar(v.numero)}
                    >
                      Copiar al borrador
                    </Boton>
                    <button
                      type="button"
                      className={claseEnlace}
                      onClick={() => setConfirmar(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <Boton
                  variante="secundario"
                  tamano="sm"
                  className="w-fit"
                  icono={<Copy className="size-4" />}
                  disabled={copiando !== null}
                  onClick={() => setConfirmar(v.numero)}
                  aria-label={`Copiar la versión ${v.numero} al borrador`}
                >
                  Copiar al borrador
                </Boton>
              ))}
          </li>
        ))}
      </ol>
      <p className="text-xs text-tinta-tenue">
        Se muestran hasta 50 versiones. Las versiones publicadas no cambian nunca.
        {!puedeCopiar && ' Administración puede copiar una versión al borrador.'}
      </p>
    </>
  );
}

/** Cuerpo del panel «Publicar página»: cifras, qué cambia y la nota de la versión. */
export function ResumenPublicar({
  pagina,
  actual,
  sucio,
  nota,
  onNota,
}: {
  pagina: PaginaSitioDetalle;
  actual: { titulo: string; descripcion: string; bloques: BloqueSitio[] };
  sucio: boolean;
  nota: string;
  onNota: (v: string) => void;
}) {
  const previa = pagina.versionPublicada;
  const c = pagina.publicada ? cambiosDesde(pagina.publicada, actual) : null;
  const siguiente = (pagina.versiones[0]?.numero ?? 0) + 1;
  return (
    <>
      <dl className="ed-pub-res">
        <div>
          <dt>Versión nueva</dt>
          <dd>v{siguiente}</dd>
        </div>
        <div>
          <dt>Bloques</dt>
          <dd>{actual.bloques.length}</dd>
        </div>
        <div>
          <dt>Cambios</dt>
          <dd>{c ? c.total : 'Todo'}</dd>
        </div>
      </dl>
      {previa && c ? (
        c.total > 0 ? (
          <div className="grid gap-2">
            <span className="text-[0.7rem] font-bold tracking-[0.12em] text-tinta-tenue uppercase">
              Desde la versión {previa.numero}
            </span>
            <ul className="grid gap-1.5 text-[0.84rem]">
              {c.lineas.map((l) => (
                <li key={l} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-cian" aria-hidden="true" />
                  {l}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Info icono={<Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}>
            No hay cambios desde la versión {previa.numero}, que ya está en el sitio.
          </Info>
        )
      ) : (
        <Info icono={<Zap className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}>
          Es la primera vez que se publica. La página empieza a verse en <b>{pagina.ruta}</b>.
        </Info>
      )}
      {pagina.archivada && (
        <Info
          tono="ambar"
          icono={<TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
        >
          La página está archivada: se publica la versión, pero no se ve hasta desarchivarla.
        </Info>
      )}
      {sucio && (
        <Info
          tono="ambar"
          icono={<TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
        >
          Tienes cambios sin guardar. Al publicar, primero se guarda el borrador.
        </Info>
      )}
      <CampoArea
        id="nota-version"
        etiqueta="Nota de la versión"
        opcional
        max={200}
        rows={3}
        value={nota}
        placeholder="Ej.: Banner con la tasa de octubre"
        ayuda="Te ayuda a encontrar esta versión en el historial."
        onChange={(e) => onNota(e.currentTarget.value)}
      />
      <p className="text-xs text-tinta-tenue">
        Al publicar, la página cambia en la tienda para todos los clientes.
      </p>
    </>
  );
}

/** Hay algo que publicar: nunca se publicó o cambió algo desde la versión vigente. */
export function hayQuePublicar(
  pagina: PaginaSitioDetalle,
  actual: { titulo: string; descripcion: string; bloques: BloqueSitio[] },
): boolean {
  return !pagina.publicada || cambiosDesde(pagina.publicada, actual).total > 0;
}

/** Título y descripción de la página (se guardan con el borrador). */
export function DatosPagina({
  ruta,
  titulo,
  descripcion,
  errores,
  onTitulo,
  onDescripcion,
}: {
  ruta: string;
  titulo: string;
  descripcion: string;
  errores: Record<string, string>;
  onTitulo: (v: string) => void;
  onDescripcion: (v: string) => void;
}) {
  return (
    <>
      <CampoTexto
        etiqueta="Título de la página"
        max={120}
        value={titulo}
        autoComplete="off"
        ayuda="Se ve en la pestaña del navegador y en el editor"
        error={errores.titulo}
        onChange={(e) => onTitulo(e.currentTarget.value)}
      />
      <CampoArea
        etiqueta="Descripción"
        opcional
        max={300}
        value={descripcion}
        ayuda="Aparece en Google y al compartir el enlace"
        error={errores.descripcion}
        onChange={(e) => onDescripcion(e.currentTarget.value)}
      />
      <Info icono={<Layers className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}>
        Se guardan con el borrador y se ven en la tienda al publicar. La ruta <b>{ruta}</b> no se
        puede cambiar.
      </Info>
    </>
  );
}
