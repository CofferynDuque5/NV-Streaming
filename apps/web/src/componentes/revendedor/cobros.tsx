'use client';

import type { SuscripcionConLugar, VencimientosCortes } from '@nv/shared';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Vacio } from '@/componentes/cliente/piezas-cuenta';
import { Cobrar, cuandoCobro } from '@/componentes/cobro/cobrar';
import { CeldaPlan } from '@/componentes/revendedor/panel';
import { formatearFecha } from '@/lib/formato';

export type SeccionCobros = 'vencimientos' | 'cortes';

function cuando(seccion: SeccionCobros, d: number): { texto: string; tono: string } {
  if (d === 0)
    return { texto: seccion === 'cortes' ? 'Venció hoy' : 'Vence hoy', tono: 'text-aviso' };
  if (d === -1) return { texto: 'Vence mañana', tono: 'text-cian' };
  if (d < -1) return { texto: `En ${-d} días`, tono: 'text-tinta-suave' };
  if (d === 1) return { texto: 'Venció ayer', tono: 'text-peligro' };
  return { texto: `Hace ${d} días`, tono: 'text-peligro' };
}

const sinTildes = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Cobros del revendedor: sus clientes que vencen hoy y mañana (Vencimientos) y
 * los ya vencidos (Cortes), con «Cobrar» para copiar el mensaje o enviarlo por
 * WhatsApp o Telegram. Al hacerlo, el equipo de NV lo ve marcado como cobrado.
 */
export function CobrosRevendedor({
  seccion,
  datos,
}: {
  seccion: SeccionCobros;
  datos: VencimientosCortes;
}) {
  const [busqueda, setBusqueda] = useState('');
  const lista = seccion === 'cortes' ? datos.cortes : datos.vencimientos;
  const visibles = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    if (!q) return lista;
    return lista.filter((s) =>
      sinTildes(`${s.cliente.nombre} ${s.plan.servicio} ${s.plan.nombre}`).includes(q),
    );
  }, [lista, busqueda]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Sección" className="flex flex-wrap gap-2">
          <Link
            href="/revendedor/cobros"
            className="chip"
            aria-current={seccion === 'vencimientos' ? 'page' : undefined}
            scroll={false}
          >
            Vencimientos · {datos.vencimientos.length}
          </Link>
          <Link
            href="/revendedor/cobros?seccion=cortes"
            className="chip"
            aria-current={seccion === 'cortes' ? 'page' : undefined}
            scroll={false}
          >
            Vencidos · {datos.cortes.length}
          </Link>
        </div>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.currentTarget.value)}
          placeholder="Buscar cliente o servicio"
          aria-label="Buscar cliente o servicio"
          className="h-10 min-w-0 flex-1 rounded-xl border border-borde bg-hundida px-3 text-sm sm:max-w-xs"
        />
      </div>
      {visibles.length === 0 ? (
        <Vacio>
          {seccion === 'cortes'
            ? 'Ningún cliente vencido por cobrar.'
            : 'Ningún cliente vence hoy ni mañana.'}
        </Vacio>
      ) : (
        <ul className="grid gap-2.5">
          {visibles.map((s) => (
            <Fila key={s.id} s={s} seccion={seccion} />
          ))}
        </ul>
      )}
    </>
  );
}

function Fila({ s, seccion }: { s: SuscripcionConLugar; seccion: SeccionCobros }) {
  const w = cuando(seccion, s.diasVencida);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-[1.125rem] border border-borde-fuerte bg-[rgb(8_11_26/0.7)] px-4 py-3">
      <span className="grid min-w-0 gap-0.5">
        <b className="font-semibold break-words">{s.cliente.nombre}</b>
        <CeldaPlan
          servicio={{
            slug: s.plan.servicioSlug,
            categoria: s.plan.categoria,
            nombre: s.plan.servicio,
          }}
          titulo={s.plan.servicio}
          detalle={s.plan.nombre}
        />
      </span>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="grid text-right">
          <span className={w.tono}>{w.texto}</span>
          {s.venceEn && (
            <time dateTime={s.venceEn} className="text-xs text-tinta-tenue">
              {formatearFecha(s.venceEn)}
            </time>
          )}
        </span>
        {s.cobro && (
          <span className="inline-flex items-center gap-1 rounded-full bg-exito-suave px-2 py-0.5 text-xs font-semibold text-exito">
            <Check className="size-3" aria-hidden="true" />
            Cobrado {cuandoCobro(s.cobro.en)}
          </span>
        )}
        <Cobrar s={s} ruta={`/revendedor/suscripciones/${s.id}/cobrado`} />
      </div>
    </li>
  );
}
