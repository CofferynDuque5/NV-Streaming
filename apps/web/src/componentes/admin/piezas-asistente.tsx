import type { EstadoAccionPropuesta, UsoHerramienta } from '@nv/shared';
import clsx from 'clsx';
import {
  CircleAlert,
  ListChecks,
  type LucideIcon,
  MessagesSquare,
  Settings2,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { Insignia } from '@/componentes/ui/insignia';
import { ESTADO_ACCION, RUTA_ASISTENTE } from '@/lib/asistente';

/*
 * Piezas sin estado de las pantallas del asistente. Sin 'use client': las usan
 * las páginas de servidor y el chat (componente de cliente) por igual.
 */

type Vista = 'conversaciones' | 'acciones' | 'configuracion';

export function PestanasAsistente({
  vista,
  puedeConfigurar,
}: {
  vista: Vista;
  puedeConfigurar: boolean;
}) {
  const pestanas: { id: Vista; texto: string; href: string; icono: LucideIcon }[] = [
    { id: 'conversaciones', texto: 'Conversaciones', href: RUTA_ASISTENTE, icono: MessagesSquare },
    { id: 'acciones', texto: 'Acciones', href: `${RUTA_ASISTENTE}/acciones`, icono: ListChecks },
  ];
  if (puedeConfigurar)
    pestanas.push({
      id: 'configuracion',
      texto: 'Configuración',
      href: `${RUTA_ASISTENTE}/configuracion`,
      icono: Settings2,
    });
  return (
    <nav aria-label="Vistas del asistente" className="-mt-2 max-w-full overflow-x-auto">
      <ul className="inline-flex gap-1 rounded-xl border border-borde bg-hundida p-1">
        {pestanas.map(({ id, texto, href, icono: Icono }) => {
          const activa = vista === id;
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={activa ? 'page' : undefined}
                className={clsx(
                  'inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-3',
                  activa
                    ? 'bg-superficie text-tinta shadow-nv'
                    : 'text-tinta-suave hover:bg-superficie/60 hover:text-tinta',
                )}
              >
                <Icono className={clsx('size-4', activa && 'text-marca')} aria-hidden="true" />
                {texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const EstadoAccionInsignia = ({ estado }: { estado: EstadoAccionPropuesta }) => (
  <Insignia tono={ESTADO_ACCION[estado].tono}>{ESTADO_ACCION[estado].texto}</Insignia>
);

/** Herramientas que usó el asistente al contestar, como fichas pequeñas. */
export function FichasHerramientas({ herramientas }: { herramientas: UsoHerramienta[] }) {
  if (herramientas.length === 0) return null;
  return (
    <ul aria-label="Herramientas usadas" className="flex flex-wrap gap-1.5">
      {herramientas.map((h, i) => (
        <li
          key={`${h.herramienta}-${i}`}
          className={clsx(
            'inline-flex max-w-full items-start gap-1 rounded-lg border px-2 py-0.5 text-xs',
            h.ok
              ? 'border-borde bg-hundida text-tinta-suave'
              : 'border-peligro/30 bg-peligro-suave text-peligro',
          )}
        >
          {h.ok ? (
            <Wrench className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          ) : (
            <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 break-words">
            {h.etiqueta}
            {!h.ok && (
              <>
                <span className="sr-only"> (falló)</span>
                {h.error && <span className="text-tinta-suave">: {h.error}</span>}
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Formato del texto del asistente ──────────────────────────────────────────

type Bloque =
  | { tipo: 'parrafo'; lineas: string[] }
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'lista'; ordenada: boolean; items: string[] };

/**
 * Divide el texto en párrafos, títulos y listas. Solo reconoce un puñado de
 * marcas sencillas; todo lo demás queda como texto (React lo escapa).
 */
export function bloquesDeTexto(texto: string): Bloque[] {
  const salida: Bloque[] = [];
  let actual: Bloque | null = null;
  const cerrar = () => {
    if (actual) salida.push(actual);
    actual = null;
  };

  for (const cruda of texto.replace(/\r\n?/g, '\n').split('\n')) {
    const linea = cruda.trim();
    if (!linea) {
      cerrar();
      continue;
    }
    const vineta = /^[-*•]\s+(.+)$/.exec(linea);
    const numerada = /^\d{1,3}[.)]\s+(.+)$/.exec(linea);
    const titulo = /^#{1,6}\s+(.+)$/.exec(linea);
    const bloque = actual as Bloque | null;

    if (vineta || numerada) {
      const ordenada = Boolean(numerada);
      const item = (vineta ?? numerada)![1]!;
      if (bloque?.tipo === 'lista' && bloque.ordenada === ordenada) bloque.items.push(item);
      else {
        cerrar();
        actual = { tipo: 'lista', ordenada, items: [item] };
      }
    } else if (titulo) {
      cerrar();
      salida.push({ tipo: 'titulo', texto: titulo[1]! });
    } else if (bloque?.tipo === 'lista' && /^\s{2,}/.test(cruda)) {
      // Línea sangrada bajo un elemento: continúa ese elemento.
      bloque.items[bloque.items.length - 1] += ` ${linea}`;
    } else if (bloque?.tipo === 'parrafo') {
      bloque.lineas.push(linea);
    } else {
      cerrar();
      actual = { tipo: 'parrafo', lineas: [linea] };
    }
  }
  cerrar();
  return salida;
}

/** **negrita** y `código`; lo demás, texto plano. */
function enLinea(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((parte, i) => {
    if (parte.length > 4 && parte.startsWith('**') && parte.endsWith('**'))
      return (
        <strong key={i} className="font-semibold text-tinta">
          {parte.slice(2, -2)}
        </strong>
      );
    if (parte.length > 2 && parte.startsWith('`') && parte.endsWith('`'))
      return (
        <code key={i} className="rounded bg-hundida px-1 py-0.5 font-mono text-[0.85em]">
          {parte.slice(1, -1)}
        </code>
      );
    return <Fragment key={i}>{parte}</Fragment>;
  });
}

/** Texto del asistente con formato mínimo y seguro (sin HTML crudo). */
export function TextoAsistente({ texto }: { texto: string }) {
  const bloques = bloquesDeTexto(texto);
  return (
    <div className="grid gap-2.5 text-[0.95rem] leading-relaxed [overflow-wrap:anywhere]">
      {bloques.map((b, i) => {
        if (b.tipo === 'titulo')
          return (
            <p key={i} className="font-semibold text-tinta">
              {enLinea(b.texto)}
            </p>
          );
        if (b.tipo === 'lista') {
          const Lista = b.ordenada ? 'ol' : 'ul';
          return (
            <Lista
              key={i}
              className={clsx('grid gap-1 pl-5', b.ordenada ? 'list-decimal' : 'list-disc')}
            >
              {b.items.map((item, j) => (
                <li key={j} className="pl-0.5 marker:text-tinta-tenue">
                  {enLinea(item)}
                </li>
              ))}
            </Lista>
          );
        }
        return (
          <p key={i}>
            {b.lineas.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {enLinea(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
