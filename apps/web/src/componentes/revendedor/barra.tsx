'use client';

import { Clock, House, Plus, UsersRound, Wallet } from 'lucide-react';
import { BarraInferior } from '@/componentes/panel/barra-inferior';

/**
 * Pestañas del teléfono del panel del revendedor. «Renovar» lleva cuántos
 * servicios están vencidos o vencen en 7 días.
 */
export function BarraRevendedor({ urgentes }: { urgentes: number }) {
  return (
    <BarraInferior
      raiz="/revendedor"
      pestanas={[
        { href: '/revendedor', texto: 'Resumen', icono: House },
        { href: '/revendedor/catalogo', texto: 'Vender', icono: Plus },
        {
          href: '/revendedor/renovaciones',
          texto: 'Renovar',
          icono: Clock,
          insignia: { n: urgentes, que: ['urgente', 'urgentes'] },
        },
        { href: '/revendedor/clientes', texto: 'Clientes', icono: UsersRound },
        { href: '/revendedor/saldo', texto: 'Saldo', icono: Wallet },
      ]}
    />
  );
}
