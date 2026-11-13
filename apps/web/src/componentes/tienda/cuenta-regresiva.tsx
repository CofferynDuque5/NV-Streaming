'use client';

import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

const DOS = (n: number) => String(n).padStart(2, '0');

/** «2 d 04:12:33» o «04:12:33» hasta `hasta`; null si ya pasó. */
export function restante(hasta: string, ahora: number): string | null {
  const ms = new Date(hasta).getTime() - ahora;
  if (!(ms > 0)) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const reloj = `${DOS(Math.floor((s % 86_400) / 3600))}:${DOS(Math.floor((s % 3600) / 60))}:${DOS(s % 60)}`;
  return d > 0 ? `${d} d ${reloj}` : reloj;
}

/**
 * Cuenta regresiva de una oferta. En el servidor y en el primer pintado no
 * muestra segundos (evita diferencias de hidratación); luego avanza cada segundo.
 * Para lectores de pantalla anuncia la fecha de fin, no cada segundo.
 */
export function CuentaRegresiva({
  hasta,
  prefijo = 'Termina en',
  className,
}: {
  hasta: string;
  prefijo?: string;
  className?: string;
}) {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    const tic = () => setAhora(Date.now());
    const primero = setTimeout(tic, 0);
    const t = setInterval(tic, 1000);
    return () => {
      clearTimeout(primero);
      clearInterval(t);
    };
  }, []);
  const fin = new Date(hasta);
  const texto = ahora === null ? null : restante(hasta, ahora);
  if (ahora !== null && texto === null) {
    return <span className={className}>Oferta terminada</span>;
  }
  return (
    <span className={className}>
      <Clock className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">
        Oferta hasta el {fin.toLocaleString('es-VE', { dateStyle: 'long', timeStyle: 'short' })}
      </span>
      <span aria-hidden="true" className="tabular-nums">
        {prefijo} {texto ?? '…'}
      </span>
    </span>
  );
}
