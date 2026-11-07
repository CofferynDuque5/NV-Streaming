// Sin 'use client': guía de puesta en marcha del centro de módulos.
import type { CentroEquipo } from '@nv/shared';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { claseEnlace, claseLista } from '@/componentes/cliente/piezas-cuenta';
import { Seccion } from './centro';

interface Paso {
  clave: string;
  titulo: string;
  detalle: string;
  hecho: boolean;
  href: string;
  accion: string;
}

/**
 * Pasos para que la tienda pueda vender, en el orden en que conviene darlos. Cada uno
 * sale solo si quien mira tiene el permiso de ese módulo (si no, la API manda null).
 */
export function pasosPuestaEnMarcha(c: CentroEquipo): Paso[] {
  const pasos: Paso[] = [];
  const correo = c.sistema.canales?.correo;
  if (correo) {
    pasos.push({
      clave: 'correo',
      titulo: 'Configura el correo',
      detalle:
        'Sin correo, los clientes no confirman su cuenta ni recuperan la contraseña. Se hace en el servidor.',
      hecho: correo === 'listo',
      href: '/admin/automatizaciones',
      accion: 'Ver estado',
    });
  }
  if (c.tasasFaltantes) {
    pasos.push({
      clave: 'tasas',
      titulo: 'Registra las tasas de cambio',
      detalle: 'Hacen falta para mostrar y cobrar los precios en bolívares y otras monedas.',
      hecho: c.tasasFaltantes.length === 0,
      href: '/admin/finanzas',
      accion: 'Poner tasas',
    });
  }
  if (c.modulos.metodosCobro !== null) {
    pasos.push({
      clave: 'cobro',
      titulo: 'Agrega un método de cobro',
      detalle: 'Pago Móvil, transferencia o el que uses: es lo que ve el cliente al pagar.',
      hecho: c.modulos.metodosCobro > 0,
      href: '/admin/finanzas',
      accion: 'Agregar método',
    });
  }
  const cat = c.modulos.catalogo;
  if (cat) {
    pasos.push(
      {
        clave: 'proveedor',
        titulo: 'Crea un proveedor',
        detalle: 'De dónde salen las cuentas o los códigos que vendes.',
        hecho: cat.proveedores > 0,
        href: '/admin/catalogo',
        accion: 'Ir al catálogo',
      },
      {
        clave: 'servicio',
        titulo: 'Crea un servicio',
        detalle: 'Lo que el cliente reconoce: Netflix, Disney+, Spotify…',
        hecho: cat.servicios > 0,
        href: '/admin/catalogo',
        accion: 'Ir al catálogo',
      },
      {
        clave: 'plan',
        titulo: 'Crea un plan con su precio',
        detalle: 'Sin planes activos, la tienda no tiene nada a la venta.',
        hecho: cat.planes > 0,
        href: '/admin/catalogo',
        accion: 'Ir al catálogo',
      },
    );
  }
  if (c.modulos.paginasPublicadas !== null) {
    pasos.push({
      clave: 'pagina',
      titulo: 'Publica tu portada',
      detalle: 'Revisa los textos y los datos de contacto (WhatsApp) antes de recibir visitas.',
      hecho: c.modulos.paginasPublicadas > 0,
      href: '/admin/sitio',
      accion: 'Ir al sitio',
    });
  }
  return pasos;
}

/** Lista «Primeros pasos» con su avance. Desaparece cuando todo está hecho. */
export function PrimerosPasos({ centro }: { centro: CentroEquipo }) {
  const pasos = pasosPuestaEnMarcha(centro);
  const hechos = pasos.filter((p) => p.hecho).length;
  // Con menos de 3 pasos visibles no es una guía: lo dicen los avisos de cada módulo.
  if (pasos.length < 3 || hechos === pasos.length) return null;
  const siguiente = pasos.find((p) => !p.hecho)!;
  return (
    <Seccion
      id="titulo-primeros-pasos"
      titulo="Primeros pasos"
      nota={`${hechos} de ${pasos.length} listos. Al terminar, esta guía se oculta sola.`}
    >
      <div
        className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-label="Avance de la puesta en marcha"
        aria-valuemin={0}
        aria-valuemax={pasos.length}
        aria-valuenow={hechos}
      >
        <div
          className="h-full rounded-full bg-marca transition-[width]"
          style={{ width: `${(hechos / pasos.length) * 100}%` }}
        />
      </div>
      <ol className={claseLista}>
        {pasos.map((p, i) => (
          <li
            key={p.clave}
            className={clsx(
              'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-3.5 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]',
              p === siguiente && 'bg-marca/[0.06]',
            )}
          >
            <span
              className={clsx(
                'grid size-7 place-items-center rounded-full text-xs font-bold tabular-nums',
                p.hecho ? 'bg-exito/20 text-exito' : 'border border-borde-fuerte text-tinta-suave',
              )}
              aria-hidden="true"
            >
              {p.hecho ? <Check className="size-3.5" /> : i + 1}
            </span>
            <div className="grid min-w-0 gap-0.5">
              <b className={clsx('text-[0.94rem]', p.hecho && 'text-tinta-suave line-through')}>
                <span className="sr-only">{p.hecho ? 'Hecho: ' : 'Pendiente: '}</span>
                {p.titulo}
              </b>
              {!p.hecho && <p className="text-[0.82rem] text-tinta-suave">{p.detalle}</p>}
            </div>
            {!p.hecho && (
              <Link href={p.href} className={clsx(claseEnlace, 'col-start-2 sm:col-start-auto')}>
                {p.accion}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Seccion>
  );
}
