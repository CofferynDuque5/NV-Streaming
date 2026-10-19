'use client';

import type { DiaVentas } from '@nv/shared';
import clsx from 'clsx';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { Caja, diaCorto, usd } from './panel';

type Metrica = 'ventas' | 'gasto' | 'ganancia';

const METRICAS: [Metrica, string, string][] = [
  ['ventas', 'Ventas', 'Ventas'],
  ['gasto', 'Gastado', 'Gastado'],
  ['ganancia', 'Ganancia', 'Ganancia estimada'],
];

const valorDe = (d: DiaVentas, m: Metrica) =>
  Math.max(0, m === 'ventas' ? d.ventas : Number(m === 'gasto' ? d.pagadoUsd : d.gananciaUsd));

const ventas = (n: number) => `${n} ${n === 1 ? 'venta' : 'ventas'}`;

/**
 * Ventas por día de los últimos 30 días: una sola serie en barras con la
 * punta redondeada sobre una rejilla discreta. Las cifras vienen de la API
 * (aquí solo se dibujan). Al pasar el ratón o tocar una barra se ve el día;
 * para lectores de pantalla hay una tabla con los mismos datos.
 */
export function GraficaVentas({ dias }: { dias: DiaVentas[] }) {
  const [metrica, setMetrica] = useState<Metrica>('ventas');
  const [activa, setActiva] = useState<number | null>(null);
  const [estrecha, setEstrecha] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; texto: string } | null>(null);
  const hayVentas = dias.some((d) => d.ventas > 0);

  // Menos ancho de dibujo en el teléfono para que los rótulos se lean.
  useEffect(() => {
    const m = window.matchMedia('(width < 43.75rem)');
    const cambiar = () => setEstrecha(m.matches);
    cambiar();
    m.addEventListener('change', cambiar);
    return () => m.removeEventListener('change', cambiar);
  }, []);

  const W = estrecha ? 340 : 600;
  const H = 190;
  const iz = 34;
  const ab = 22;
  const ar = 8;
  const n = dias.length;
  const anch = (W - iz - 4) / n;
  const valores = dias.map((d) => valorDe(d, metrica));
  const max = Math.max(...valores, 1);
  const paso =
    metrica === 'ventas' ? Math.max(1, Math.ceil(max / 3)) : Math.max(5, Math.ceil(max / 15) * 5);
  const tope = paso * 3;
  const y = (v: number) => ar + (H - ar - ab) * (1 - v / tope);
  const rotuloY = (v: number) => (metrica === 'ventas' ? String(v) : `$${v}`);
  const texto = (i: number) => {
    const d = dias[i]!;
    const v = metrica === 'ventas' ? ventas(d.ventas) : usd(valores[i]!);
    return `${diaCorto(d.fecha)}: ${v}`;
  };
  const nombre = METRICAS.find((m) => m[0] === metrica)![2];

  function apuntar(e: PointerEvent<SVGGElement>, i: number) {
    const c = caja.current?.getBoundingClientRect();
    const b = e.currentTarget.getBoundingClientRect();
    if (!c) return;
    setActiva(i);
    // Centrada en la barra, sin salirse de la caja.
    const x = Math.min(Math.max(b.left + b.width / 2 - c.left, 70), c.width - 70);
    setTip({ x, texto: texto(i) });
  }

  return (
    <Caja
      id="titulo-grafica"
      titulo="Ventas de los últimos 30 días"
      nota={
        hayVentas ? 'Pasa el dedo o el ratón por una barra para ver el día.' : 'Aún no hay ventas.'
      }
      accion={
        <div role="group" aria-label="Qué mostrar" className="flex flex-wrap gap-1.5">
          {METRICAS.map(([m, t]) => (
            <button
              key={m}
              type="button"
              className="chip min-h-9 px-3 text-[0.82rem]"
              aria-pressed={metrica === m}
              onClick={() => {
                setMetrica(m);
                setTip(null);
                setActiva(null);
              }}
            >
              {t}
            </button>
          ))}
        </div>
      }
    >
      <div
        ref={caja}
        className="relative px-2.5 pt-2 pb-3"
        onPointerLeave={() => {
          setTip(null);
          setActiva(null);
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${nombre} por día en los últimos ${n} días`}
          className="block h-auto w-full overflow-visible"
        >
          {[0, 1, 2, 3].map((k) => (
            <g key={k}>
              <line
                x1={iz}
                x2={W}
                y1={y(k * paso)}
                y2={y(k * paso)}
                stroke="rgb(148 163 184 / 0.15)"
                strokeWidth={1}
              />
              <text
                x={iz - 6}
                y={y(k * paso) + 4}
                textAnchor="end"
                className="fill-tinta-tenue text-[11px] font-medium tabular-nums"
              >
                {rotuloY(k * paso)}
              </text>
            </g>
          ))}
          {dias.map((d, i) => {
            const v = valores[i]!;
            const bx = iz + 4 + i * anch;
            const alto = v ? Math.max(5, H - ab - y(v)) : 0;
            return (
              <g
                key={d.fecha}
                onPointerEnter={(e) => apuntar(e, i)}
                onPointerDown={(e) => apuntar(e, i)}
              >
                <rect
                  x={bx}
                  y={ar}
                  width={anch}
                  height={H - ab - ar}
                  className={activa === i ? 'fill-[rgb(148_163_184/0.08)]' : 'fill-transparent'}
                />
                {v > 0 && (
                  <path
                    d={`M${bx + 2},${H - ab} v${-(alto - 3)} q0,-3 3,-3 h${anch - 10} q3,0 3,3 v${alto - 3} z`}
                    className={clsx(
                      'transition-[fill] duration-150',
                      activa === i ? 'fill-[#a5f3fc]' : 'fill-cian',
                    )}
                  />
                )}
              </g>
            );
          })}
          {dias.map((d, i) =>
            i % 7 === 1 || i === n - 1 ? (
              <text
                key={d.fecha}
                x={iz + 4 + i * anch + anch / 2}
                y={H - 5}
                textAnchor="middle"
                className="fill-tinta-tenue text-[11px] font-medium"
              >
                {i === n - 1 ? 'Hoy' : diaCorto(d.fecha)}
              </text>
            ) : null,
          )}
        </svg>
        {tip && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0.5 -translate-x-1/2 rounded-[0.625rem] border border-borde-fuerte bg-[#0b1026] px-2.5 py-1 text-[0.78rem] font-semibold whitespace-nowrap shadow-[0_10px_24px_-8px_rgb(0_0_0/0.7)]"
            style={{ left: tip.x }}
          >
            {tip.texto}
          </div>
        )}
        <table className="sr-only">
          <caption>Ventas, gastado y ganancia estimada de cada día</caption>
          <thead>
            <tr>
              <th scope="col">Día</th>
              <th scope="col">Ventas</th>
              <th scope="col">Gastado</th>
              <th scope="col">Ganancia estimada</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.fecha}>
                <th scope="row">{diaCorto(d.fecha)}</th>
                <td>{d.ventas}</td>
                <td>{usd(d.pagadoUsd)}</td>
                <td>{usd(d.gananciaUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Caja>
  );
}
