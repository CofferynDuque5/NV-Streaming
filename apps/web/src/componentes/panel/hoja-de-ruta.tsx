import { Check } from 'lucide-react';
import clsx from 'clsx';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';

const FASES = [
  { n: 0, titulo: 'Cimientos', texto: 'Acceso seguro, roles, auditoría y sistema de diseño.' },
  {
    n: 1,
    titulo: 'MVP operativo',
    texto: 'Clientes, planes, suscripciones, cobros manuales y soporte.',
  },
  {
    n: 2,
    titulo: 'Revendedores y editor visual',
    texto: 'Saldo prepagado, precios mayoristas y edición de páginas.',
  },
  {
    n: 3,
    titulo: 'Automatizaciones',
    texto: 'Recordatorios, renovaciones y avisos por correo y WhatsApp.',
  },
  {
    n: 4,
    titulo: 'Cobros automáticos autorizados',
    texto: 'PayPal y Mercado Pago con autorización expresa del cliente.',
  },
  {
    n: 5,
    titulo: 'Asistente IA',
    texto: 'Ayuda con permisos estrictos, confirmación y auditoría.',
  },
  {
    n: 6,
    titulo: 'Proveedores y producción',
    texto: 'Integraciones oficiales y puesta en marcha.',
  },
];

export function HojaDeRuta({ actual = 0 }: { actual?: number }) {
  return (
    <Tarjeta>
      <CabeceraTarjeta
        titulo="Hoja de ruta"
        descripcion="Cada fase se entrega probada y lista para usar."
      />
      <ol className="grid gap-0 px-5 py-4 sm:px-6">
        {FASES.map((f, i) => {
          const hecha = f.n <= actual;
          return (
            <li key={f.n} className="relative flex gap-4 pb-5 last:pb-0">
              <span
                className={clsx(
                  'relative z-10 grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold',
                  hecha
                    ? 'border-exito/40 bg-exito-suave text-exito'
                    : 'border-borde bg-hundida text-tinta-tenue',
                )}
              >
                {hecha ? <Check className="size-3.5" aria-label="Completada" /> : f.n}
              </span>
              {i < FASES.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-7 bottom-0 left-3.5 w-px bg-borde"
                />
              )}
              <div className="grid gap-0.5 pt-0.5">
                <p className={clsx('text-sm font-medium', !hecha && 'text-tinta-suave')}>
                  Fase {f.n} · {f.titulo}
                </p>
                <p className="text-sm text-tinta-tenue">{f.texto}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Tarjeta>
  );
}
