'use client';

import { requisitosContrasena } from '@nv/shared';
import clsx from 'clsx';
import { Check, Circle } from 'lucide-react';
import { useState } from 'react';
import { Campo } from './campo';

/** Requisitos de la contraseña marcados en vivo (las mismas reglas que valida la API). */
export function ListaContrasena({ valor, id }: { valor: string; id?: string }) {
  const requisitos = requisitosContrasena(valor);
  return (
    <ul id={id} className="grid gap-1 text-xs" aria-label="Requisitos de la contraseña">
      {requisitos.map((r) => (
        <li
          key={r.clave}
          className={clsx(
            'flex items-center gap-2 transition-colors',
            r.cumple ? 'text-exito' : 'text-tinta-tenue',
          )}
        >
          {r.cumple ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <Circle className="size-3.5" aria-hidden="true" />
          )}
          <span>
            {r.texto}
            <span className="sr-only">{r.cumple ? ': cumple' : ': falta'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Contraseña nueva con sus requisitos marcados en vivo mientras se escribe.
 */
export function CampoContrasenaNueva({
  etiqueta,
  name = 'contrasena',
  error,
}: {
  etiqueta: string;
  name?: string;
  error?: string | undefined;
}) {
  const [valor, setValor] = useState('');
  const cumple = requisitosContrasena(valor).every((r) => r.cumple);
  return (
    <div className="grid gap-2">
      <Campo
        etiqueta={etiqueta}
        name={name}
        type="password"
        autoComplete="new-password"
        required
        value={valor}
        onChange={(e) => setValor(e.currentTarget.value)}
        valido={cumple}
        error={error}
        ayuda="Una frase fácil de recordar funciona muy bien."
      />
      <ListaContrasena valor={valor} />
    </div>
  );
}
