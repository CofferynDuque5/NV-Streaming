'use client';

import type { BilleteraPublica, FacturaDetalle } from '@nv/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { llamarApi } from '@/lib/api-cliente';

/** Cada cuánto se pregunta al principio y, pasados unos minutos, más espaciado. */
const RAPIDO_MS = 8_000;
const LENTO_MS = 30_000;
const MINUTOS_RAPIDO = 5;

/**
 * Pregunta en segundo plano hasta que `revisar` devuelve un aviso (el equipo ya
 * confirmó o rechazó el pago). Entonces avisa y actualiza la página sola: el
 * cliente no tiene que recargar. Se detiene con la pestaña oculta y vuelve a
 * preguntar al regresar.
 */
function useEsperar(clave: string, revisar: () => Promise<string | null>) {
  const router = useRouter();
  const notificar = useNotificar();
  const revisarRef = useRef(revisar);
  useEffect(() => {
    revisarRef.current = revisar;
  });

  useEffect(() => {
    let terminado = false;
    const inicio = Date.now();
    let t: ReturnType<typeof setTimeout> | undefined;

    function programar() {
      if (terminado) return;
      const rapido = Date.now() - inicio < MINUTOS_RAPIDO * 60_000;
      t = setTimeout(() => void consultar(), rapido ? RAPIDO_MS : LENTO_MS);
    }

    async function consultar() {
      if (terminado) return;
      if (document.hidden) return programar();
      const aviso = await revisarRef.current();
      if (terminado) return;
      if (aviso) {
        terminado = true;
        notificar(aviso);
        router.refresh();
        return;
      }
      programar();
    }

    function alVolver() {
      if (document.hidden || terminado) return;
      clearTimeout(t);
      void consultar();
    }

    programar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      terminado = true;
      clearTimeout(t);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [clave, router, notificar]);
}

/** Factura con un pago manual en revisión: se actualiza sola cuando el equipo lo revisa. */
export function EsperarConfirmacion({ facturaId }: { facturaId: string }) {
  useEsperar(`factura:${facturaId}`, async () => {
    const r = await llamarApi<FacturaDetalle>('GET', `/mi/facturas/${facturaId}`);
    if (!r.ok || r.datos.pagoEnRevision) return null;
    return r.datos.estado === 'pagada'
      ? '¡Pago confirmado! Ya actualizamos tu servicio.'
      : 'Revisamos tu pago. Mira el resultado aquí.';
  });
  return null;
}

/** Recargas de la billetera en revisión: el saldo se actualiza solo al revisarlas. */
export function EsperarRecargas({ enRevision }: { enRevision: number }) {
  useEsperar(`recargas:${enRevision}`, async () => {
    const r = await llamarApi<BilleteraPublica>('GET', '/mi/billetera');
    if (!r.ok || r.datos.recargasPorEstado.en_revision >= enRevision) return null;
    return 'Revisamos tu recarga. Tu saldo ya está actualizado.';
  });
  return null;
}
