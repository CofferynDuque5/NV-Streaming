import { analizarTexto, esEnlaceSeguro, type NodoEnLinea } from '@nv/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { Fragment } from 'react';

const claseEnlace = 'font-medium text-marca underline underline-offset-2 hover:text-marca-fuerte';

/** Enlace del sitio: interno con Link; externo (https) sin pasar el origen ni dar acceso a la ventana. */
export function EnlaceSitio({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (!esEnlaceSeguro(href)) return <span className={className}>{children}</span>;
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} rel="noopener noreferrer">
      {children}
    </a>
  );
}

function EnLinea({ nodos }: { nodos: NodoEnLinea[] }) {
  return nodos.map((n, i) => {
    switch (n.tipo) {
      case 'texto':
        return <Fragment key={i}>{n.texto}</Fragment>;
      case 'salto':
        return <br key={i} />;
      case 'negrita':
        return (
          <strong key={i} className="font-semibold text-tinta">
            <EnLinea nodos={n.hijos} />
          </strong>
        );
      case 'cursiva':
        return (
          <em key={i}>
            <EnLinea nodos={n.hijos} />
          </em>
        );
      case 'enlace':
        return (
          <EnlaceSitio key={i} href={n.href} className={claseEnlace}>
            <EnLinea nodos={n.hijos} />
          </EnlaceSitio>
        );
    }
  });
}

/**
 * Texto con el marcado seguro del editor, pintado como elementos de React.
 * Nunca usa HTML crudo: las etiquetas que escriba alguien se ven como texto.
 */
export function TextoEnriquecido({ fuente, className }: { fuente: string; className?: string }) {
  return (
    <div className={clsx('grid gap-4 leading-relaxed text-tinta-suave', className)}>
      {analizarTexto(fuente).map((b, i) => {
        if (b.tipo === 'parrafo') {
          return (
            <p key={i}>
              <EnLinea nodos={b.hijos} />
            </p>
          );
        }
        const Lista = b.ordenada ? 'ol' : 'ul';
        return (
          <Lista
            key={i}
            className={clsx('grid gap-1.5 pl-5', b.ordenada ? 'list-decimal' : 'list-disc')}
          >
            {b.elementos.map((e, j) => (
              <li key={j} className="pl-1">
                <EnLinea nodos={e} />
              </li>
            ))}
          </Lista>
        );
      })}
    </div>
  );
}
