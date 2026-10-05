import { INFO_PASARELA, type Moneda, PASARELAS, type Pasarela } from '@nv/shared';

export const esPasarela = (v: string | null | undefined): v is Pasarela =>
  typeof v === 'string' && (PASARELAS as readonly string[]).includes(v);

/** La pasarela cobra en esa moneda. Venezuela (VES) sigue con pago manual: nunca en línea. */
export function pasarelaAdmiteMoneda(pasarela: Pasarela, moneda: Moneda): boolean {
  return moneda !== 'VES' && INFO_PASARELA[pasarela].monedas.includes(moneda);
}

/** Admite guardar el método para cobrar sin el cliente presente. */
export const admiteRecurrente = (pasarela: Pasarela) =>
  INFO_PASARELA[pasarela].admiteCobroRecurrente;
