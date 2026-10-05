'use client';

import { Bot, House, Landmark, LayoutGrid, MessageCircle } from 'lucide-react';
import { BarraInferior, type Pestana } from '@/componentes/panel/barra-inferior';

/**
 * Pestañas del teléfono del equipo: el centro, lo de todos los días (cobros
 * con lo que espera, soporte y asistente, si el rol los abre) y los módulos.
 */
export function BarraEquipo({
  cobros,
  soporte,
  asistente,
}: {
  /** Pendientes de Cobros; null si el rol no lo abre. */
  cobros: number | null;
  soporte: boolean;
  asistente: boolean;
}) {
  const pestanas: Pestana[] = [{ href: '/admin', texto: 'Centro', icono: House }];
  if (cobros !== null) {
    pestanas.push({
      href: '/admin/cobros',
      texto: 'Cobros',
      icono: Landmark,
      insignia: { n: cobros, que: ['por atender', 'por atender'] },
    });
  }
  if (soporte) pestanas.push({ href: '/admin/soporte', texto: 'Soporte', icono: MessageCircle });
  if (asistente) pestanas.push({ href: '/admin/asistente', texto: 'Asistente', icono: Bot });
  pestanas.push({ href: '/admin#modulos', texto: 'Módulos', icono: LayoutGrid });
  return <BarraInferior raiz="/admin" pestanas={pestanas} />;
}
