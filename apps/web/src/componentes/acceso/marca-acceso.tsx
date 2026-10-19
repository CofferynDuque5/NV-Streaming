import type { ServicioTienda } from '@nv/shared';
import { LayoutGrid, LifeBuoy, Wallet } from 'lucide-react';
import type { CSSProperties } from 'react';
import { ArteServicio } from '@/componentes/tienda/arte';
import { OrbeAcceso } from './panel-acceso';

const VENTAJAS = [
  {
    icono: <LayoutGrid />,
    color: '#4f8dff',
    titulo: 'Tus servicios en un panel',
    texto: 'Actívalos y míralos en un solo lugar',
  },
  {
    icono: <Wallet />,
    color: '#a855f7',
    titulo: 'Billetera NV',
    texto: 'Recarga saldo y paga en un toque',
  },
  {
    icono: <LifeBuoy />,
    color: '#22c55e',
    titulo: 'Ayuda con tu pedido',
    texto: 'Soporte con tu número de pedido a la mano',
  },
];

/**
 * Panel de marca de las pantallas de acceso (solo en escritorio): el anillo del
 * portal con los servicios reales del catálogo en órbita y tres ventajas de
 * tener cuenta. En el teléfono no se muestra y sus imágenes no se descargan
 * (son diferidas y quedan ocultas).
 */
export function MarcaAcceso({ servicios }: { servicios: ServicioTienda[] }) {
  const orbita = [...servicios]
    .sort(
      (a, b) => (a.ranking ?? Number.POSITIVE_INFINITY) - (b.ranking ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, 8);
  // Con pocos servicios se repiten para llenar la órbita (es decorativa: aria-hidden).
  const vueltas =
    orbita.length > 0 && orbita.length < 6
      ? Array.from({ length: 6 }, (_, i) => orbita[i % orbita.length]).filter(
          (s): s is ServicioTienda => s !== undefined,
        )
      : orbita;
  return (
    <div className="hidden content-center justify-items-start gap-5.5 lg:grid">
      <span className="etiqueta-orbita">Tu cuenta NV</span>
      <p className="font-titulo text-[clamp(2.1rem,4vw,3.25rem)] leading-[1.04] font-extrabold text-balance">
        Tu portal a <span className="texto-degradado">todos los universos</span>
      </p>
      <p className="max-w-[29rem] text-[1.03rem] text-tinta-suave">
        Con tu cuenta ves tus servicios, pagas tus pedidos y pides ayuda con tu número de pedido.
      </p>
      <div
        aria-hidden="true"
        className="relative -mt-2.5 -mb-5 grid h-[20.5rem] w-full place-items-center [perspective:1100px]"
      >
        <div className="absolute size-[14.5rem] rounded-full bg-[radial-gradient(circle,#02030a_52%,transparent_53%),conic-gradient(from_200deg,#4f8dff,#22d3ee,#e879f9,#8b5cf6,#4f8dff)] shadow-[0_0_80px_10px_rgb(79_141_255/0.35),0_0_160px_40px_rgb(139_92_246/0.18)] motion-safe:animate-[nv-girar_6s_linear_infinite]" />
        <div className="absolute size-[9rem] rounded-full bg-[radial-gradient(circle,rgb(34_211_238/0.3),rgb(79_141_255/0.1)_45%,transparent_70%)] blur-[6px]" />
        {orbita.length > 0 && (
          <div className="relative z-1 [transform-style:preserve-3d] [transform:rotateX(-10deg)_rotateZ(-6deg)]">
            <div className="relative size-px [transform-style:preserve-3d] motion-safe:animate-[nv-orbitar_34s_linear_infinite]">
              {vueltas.map((s, i) => (
                <div
                  key={`${s.servicio.id}-${i}`}
                  className="absolute -top-[3.25rem] -left-[2.125rem] grid w-[4.25rem] place-items-center [backface-visibility:hidden] [transform:rotateY(var(--a))_translateZ(12rem)]"
                  style={{ '--a': `${(i * 360) / vueltas.length}deg` } as CSSProperties}
                >
                  <ArteServicio
                    arte={s.arte}
                    nombre={s.servicio.nombre}
                    categoria={s.servicio.categoria}
                    color={s.color}
                    orbe="md"
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <ul className="grid gap-3">
        {VENTAJAS.map((v) => (
          <li key={v.titulo} className="flex items-center gap-3 text-[0.9rem]">
            <OrbeAcceso color={v.color} className="size-[2.4rem] text-[1.05rem]">
              {v.icono}
            </OrbeAcceso>
            <span className="grid">
              <b className="font-semibold">{v.titulo}</b>
              <span className="text-[0.82rem] text-tinta-suave">{v.texto}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
