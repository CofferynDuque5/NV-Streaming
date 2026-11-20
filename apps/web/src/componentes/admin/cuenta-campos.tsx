'use client';

import clsx from 'clsx';
import { Dices, Star } from 'lucide-react';
import { useState } from 'react';
import { BotonCopiar } from '@/componentes/accesos';
import { Campo } from '@/componentes/ui/campo';
import { clasesEntrada } from '@/componentes/ui/clases';
import { Selector } from '@/componentes/ui/selector';

/*
 * Piezas de «Nueva cuenta» y «Editar cuenta» que replican la ventana de cuentas
 * del Gestor: plan con botones, país con bandera, método de pago con los 4
 * últimos dígitos, fecha con +1/+2/+3/+6 meses, generar clave con su medidor y
 * el resumen de la derecha (costo por perfil, cuenta llena, margen, día de pago).
 */

export const PLANES_CUENTA = ['Plan Básico', 'Estándar', 'Premium'] as const;

/** Los mismos países del Gestor, en su orden. */
export const PAISES_CUENTA = [
  ['VE', '🇻🇪 Venezuela'],
  ['CO', '🇨🇴 Colombia'],
  ['AR', '🇦🇷 Argentina'],
  ['BR', '🇧🇷 Brasil'],
  ['NG', '🇳🇬 Nigeria'],
  ['IN', '🇮🇳 India'],
  ['PK', '🇵🇰 Pakistán'],
  ['EG', '🇪🇬 Egipto'],
  ['PA', '🇵🇦 Panamá'],
  ['US', '🇺🇸 USA'],
  ['PE', '🇵🇪 Perú'],
  ['TR', '🇹🇷 Turquía'],
] as const;

/** Bandera de un código de país de 2 letras («VE» → 🇻🇪). */
export function bandera(pais: string): string {
  if (!/^[A-Za-z]{2}$/.test(pais)) return '';
  return String.fromCodePoint(
    ...pais
      .toUpperCase()
      .split('')
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

type Metodo = 'sin' | 'tarjeta' | 'paypal' | 'otro';

/** Separa «Tarjeta ···· 3907», «PayPal» u otro texto en el método y su detalle. */
export function leerMetodoPago(valor: string | null | undefined): {
  metodo: Metodo;
  detalle: string;
} {
  const v = (valor ?? '').trim();
  if (!v) return { metodo: 'sin', detalle: '' };
  const tarjeta = /^tarjeta\b(.*)$/i.exec(v);
  if (tarjeta) return { metodo: 'tarjeta', detalle: tarjeta[1]!.replace(/\D/g, '').slice(-4) };
  if (/^paypal$/i.test(v)) return { metodo: 'paypal', detalle: '' };
  return { metodo: 'otro', detalle: v };
}

export function textoMetodoPago(metodo: Metodo, detalle: string): string {
  if (metodo === 'tarjeta') {
    const d = detalle.replace(/\D/g, '').slice(-4);
    return d ? `Tarjeta ···· ${d}` : 'Tarjeta';
  }
  if (metodo === 'paypal') return 'PayPal';
  if (metodo === 'otro') return detalle.trim().slice(0, 60) || 'Otro';
  return '';
}

/** Suma meses a un día «AAAA-MM-DD» (el 31 pasa al último día del mes si no existe). */
export function sumarMeses(dia: string, meses: number): string {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number];
  const destino = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(
    Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0),
  ).getUTCDate();
  destino.setUTCDate(Math.min(d, ultimo));
  return destino.toISOString().slice(0, 10);
}

/** Hoy en Venezuela, «AAAA-MM-DD». */
export function hoyVenezuela(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(ahora);
}

/** Días desde hoy hasta el día dado (negativo si ya pasó). */
export function diasHasta(dia: string, hoy = hoyVenezuela()): number {
  return Math.round((Date.parse(`${dia}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}

export function textoVencimiento(dias: number): string {
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  if (dias > 1) return `vence en ${dias} días`;
  if (dias === -1) return 'venció ayer';
  return `venció hace ${-dias} días`;
}

const diaSemana = new Intl.DateTimeFormat('es', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Clave aleatoria de 14 caracteres, con mayúsculas, minúsculas, números y un símbolo. */
export function generarClave(largo = 14): string {
  const grupos = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*?'];
  const todos = grupos.join('');
  const azar = (n: number) => {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return b[0]! % n;
  };
  const letras = grupos.map((g) => g[azar(g.length)]!);
  while (letras.length < largo) letras.push(todos[azar(todos.length)]!);
  for (let i = letras.length - 1; i > 0; i--) {
    const j = azar(i + 1);
    [letras[i], letras[j]] = [letras[j]!, letras[i]!];
  }
  return letras.join('');
}

/** Mismo medidor que el Gestor: 0 a 4. */
export function fuerzaClave(clave: string): number {
  let s = 0;
  if (clave.length >= 8) s++;
  if (clave.length >= 12) s++;
  if (/[A-Z]/.test(clave) && /[a-z]/.test(clave)) s++;
  if (/\d/.test(clave) && /[^\w]/.test(clave)) s++;
  return s;
}

const NIVELES = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte'] as const;
const COLORES = ['bg-peligro', 'bg-peligro', 'bg-aviso', 'bg-marca', 'bg-exito'] as const;

/** PIN de 4 cifras distinto para cada perfil. */
export function pinsUnicos(cantidad: number): string[] {
  const usados = new Set<string>();
  const b = new Uint32Array(1);
  while (usados.size < cantidad) {
    crypto.getRandomValues(b);
    usados.add(String(1000 + (b[0]! % 9000)));
  }
  return [...usados];
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="chip" aria-pressed={activo} onClick={onClick}>
      {children}
    </button>
  );
}

/** Plan de la cuenta: Plan Básico, Estándar, Premium u otro escrito. */
export function CampoPlan({ inicial, error }: { inicial: string | null; error?: string }) {
  const base = (inicial ?? '').trim();
  const fijo = PLANES_CUENTA.find((p) => p.toLowerCase() === base.toLowerCase());
  const [plan, setPlan] = useState<string>(fijo ?? (base ? 'otro' : ''));
  const [otro, setOtro] = useState(fijo ? '' : base);
  const valor = plan === 'otro' ? otro.trim() : plan;
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-semibold">Plan</legend>
      <input type="hidden" name="plan" value={valor} />
      <div role="group" aria-label="Plan de la cuenta" className="flex flex-wrap gap-2">
        {PLANES_CUENTA.map((p) => (
          <Chip key={p} activo={plan === p} onClick={() => setPlan(plan === p ? '' : p)}>
            {p === 'Premium' && <Star className="size-3.5" aria-hidden="true" />}
            {p}
          </Chip>
        ))}
        <Chip activo={plan === 'otro'} onClick={() => setPlan(plan === 'otro' ? '' : 'otro')}>
          Otro
        </Chip>
      </div>
      {plan === 'otro' && (
        <input
          value={otro}
          onChange={(e) => setOtro(e.currentTarget.value)}
          maxLength={60}
          placeholder="Familiar, Duo, 4K…"
          aria-label="Nombre del plan"
          className={clasesEntrada}
        />
      )}
      {error && <p className="text-sm text-peligro">{error}</p>}
    </fieldset>
  );
}

export function CampoPais({ inicial, error }: { inicial: string | null; error?: string }) {
  const actual = (inicial ?? '').toUpperCase();
  const conocido = PAISES_CUENTA.some(([c]) => c === actual);
  return (
    <Selector etiqueta="País" name="pais" defaultValue={actual} error={error}>
      <option value="">Sin especificar</option>
      {PAISES_CUENTA.map(([c, n]) => (
        <option key={c} value={c}>
          {n}
        </option>
      ))}
      {actual && !conocido && (
        <option value={actual}>
          {bandera(actual)} {actual}
        </option>
      )}
    </Selector>
  );
}

/** Método de pago con botones; con tarjeta, los 4 últimos dígitos (nunca el número completo). */
export function CampoMetodoPago({ inicial, error }: { inicial: string | null; error?: string }) {
  const leido = leerMetodoPago(inicial);
  const [metodo, setMetodo] = useState<Metodo>(leido.metodo);
  const [digitos, setDigitos] = useState(leido.metodo === 'tarjeta' ? leido.detalle : '');
  const [otro, setOtro] = useState(leido.metodo === 'otro' ? leido.detalle : '');
  const valor = textoMetodoPago(metodo, metodo === 'tarjeta' ? digitos : otro);
  const opciones: [Metodo, string][] = [
    ['sin', 'Sin dato'],
    ['tarjeta', 'Tarjeta'],
    ['paypal', 'PayPal'],
    ['otro', 'Otro'],
  ];
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-semibold">Método de pago</legend>
      <input type="hidden" name="metodoPago" value={valor} />
      <div role="group" aria-label="Método de pago" className="flex flex-wrap gap-2">
        {opciones.map(([m, t]) => (
          <Chip key={m} activo={metodo === m} onClick={() => setMetodo(m)}>
            {t}
          </Chip>
        ))}
      </div>
      {metodo === 'tarjeta' && (
        <Campo
          etiqueta="Últimos 4 dígitos de la tarjeta"
          value={digitos}
          onChange={(e) => setDigitos(e.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          placeholder="3907"
          ayuda="Nunca el número completo."
          className="max-w-56"
        />
      )}
      {metodo === 'otro' && (
        <input
          value={otro}
          onChange={(e) => setOtro(e.currentTarget.value)}
          maxLength={60}
          placeholder="Binance, Zinli, transferencia…"
          aria-label="Cómo la pagas"
          className={clasesEntrada}
        />
      )}
      {error && <p className="text-sm text-peligro">{error}</p>}
    </fieldset>
  );
}

/** Próximo cobro del proveedor con +1, +2, +3 y +6 meses y cuántos días faltan. */
export function CampoFechaCobro({
  valor,
  onCambio,
  error,
}: {
  valor: string;
  onCambio: (dia: string) => void;
  error?: string;
}) {
  const dias = valor ? diasHasta(valor) : null;
  return (
    <div className="grid content-start gap-1.5">
      <Campo
        etiqueta="Fecha de vencimiento"
        name="facturaEn"
        type="date"
        value={valor}
        onChange={(e) => onCambio(e.currentTarget.value)}
        error={error}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-tinta-tenue" aria-live="polite">
          {valor && dias !== null ? (
            <>
              <span className="font-semibold text-tinta-suave">
                {diaSemana.format(new Date(`${valor}T00:00:00Z`))}
              </span>{' '}
              ·{' '}
              <span
                className={clsx(dias < 0 && 'text-peligro', dias >= 0 && dias <= 3 && 'text-aviso')}
              >
                {textoVencimiento(dias)}
              </span>
            </>
          ) : (
            'Sin fecha'
          )}
        </p>
        <div role="group" aria-label="Sumar meses" className="flex gap-1.5">
          {[1, 2, 3, 6].map((m) => (
            <button
              key={m}
              type="button"
              className="chip"
              onClick={() => onCambio(sumarMeses(valor || hoyVenezuela(), m))}
              aria-label={`Sumar ${m} ${m === 1 ? 'mes' : 'meses'}`}
            >
              +{m === 1 ? '1 mes' : m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Medidor de la clave, como en el Gestor. */
export function MedidorClave({ clave }: { clave: string }) {
  if (!clave) return null;
  const n = fuerzaClave(clave);
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <i
            key={i}
            className={clsx(
              'h-1 flex-1 rounded-full',
              i < Math.max(1, n) ? COLORES[n] : 'bg-borde',
            )}
          />
        ))}
      </div>
      <span className="text-xs text-tinta-tenue">{NIVELES[n]}</span>
    </div>
  );
}

/** Correo y clave con copiar, generar clave y medidor. */
export function CamposCredenciales({
  usuario,
  clave,
  onUsuario,
  onClave,
  errores,
  obligatorios,
  pista,
}: {
  usuario: string;
  clave: string;
  onUsuario: (v: string) => void;
  onClave: (v: string) => void;
  errores: { usuario?: string | undefined; clave?: string | undefined };
  /** Alta: hacen falta. Edición: vacíos conservan los actuales. */
  obligatorios: boolean;
  /** Pista del correo actual (edición). */
  pista?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid content-start gap-1.5">
        <Campo
          etiqueta={obligatorios ? 'Correo o usuario' : 'Correo o usuario'}
          name="usuario"
          value={usuario}
          onChange={(e) => onUsuario(e.currentTarget.value)}
          required={obligatorios}
          autoComplete="off"
          spellCheck={false}
          maxLength={254}
          placeholder={pista}
          error={errores.usuario}
          accesorio={usuario ? <BotonCopiar texto={usuario} que="el correo" /> : undefined}
        />
      </div>
      <div className="grid content-start gap-1.5">
        <Campo
          etiqueta="Clave"
          name="clave"
          type="password"
          value={clave}
          onChange={(e) => onClave(e.currentTarget.value)}
          required={obligatorios}
          autoComplete="new-password"
          spellCheck={false}
          maxLength={200}
          placeholder={obligatorios ? undefined : 'Vacía: se conserva la actual'}
          error={errores.clave}
          accesorio={
            <span className="flex gap-1.5">
              <button
                type="button"
                className="chip"
                onClick={() => onClave(generarClave())}
                aria-label="Generar una clave segura"
              >
                <Dices className="size-3.5" aria-hidden="true" /> Generar
              </button>
              {clave && <BotonCopiar texto={clave} que="la clave" />}
            </span>
          }
        />
        <MedidorClave clave={clave} />
      </div>
    </div>
  );
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/** Resumen de la derecha: costo por perfil, cuenta llena, margen y día de pago. */
export function ResumenCuenta({
  costoUsd,
  cicloMeses,
  total,
  asignados,
  ingresoMensualUsd,
  facturaEn,
}: {
  costoUsd: number;
  cicloMeses: number;
  total: number;
  asignados: number;
  /** Suma de lo que pagan los clientes asignados, llevado a un mes. */
  ingresoMensualUsd: number;
  facturaEn: string;
}) {
  const costoMes = cicloMeses > 0 ? costoUsd / cicloMeses : costoUsd;
  const porPerfil = total > 0 ? costoMes / total : 0;
  const llena = total > 0 && asignados >= total;
  const margen = ingresoMensualUsd - costoMes;
  const dias = facturaEn ? diasHasta(facturaEn) : null;
  const diaPago = facturaEn ? Number(facturaEn.slice(8, 10)) : null;
  return (
    <aside className="grid content-start gap-3" aria-label="Resumen de la cuenta">
      <dl className="grid divide-y divide-borde rounded-xl border border-borde text-sm">
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <dt className="text-tinta-suave">Por perfil</dt>
          <dd className="font-semibold tabular-nums">{costoMes > 0 ? usd(porPerfil) : '—'}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <dt className="text-tinta-suave">Cuenta llena</dt>
          <dd className={clsx('font-semibold tabular-nums', llena && 'text-exito')}>
            {total > 0 ? `${llena ? 'Sí' : 'No'} · ${asignados} de ${total}` : '—'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <dt className="text-tinta-suave">Margen al mes</dt>
          <dd
            className={clsx(
              'font-semibold tabular-nums',
              asignados > 0 && (margen >= 0 ? 'text-exito' : 'text-peligro'),
            )}
          >
            {asignados > 0 ? `${margen < 0 ? '−' : ''}${usd(Math.abs(margen))}` : '—'}
          </dd>
        </div>
      </dl>
      {diaPago !== null && dias !== null && (
        <div className="flex items-center gap-3 rounded-xl border border-borde px-3.5 py-3">
          <span
            className={clsx(
              'grid size-11 shrink-0 place-items-center rounded-full border-2 text-sm font-bold tabular-nums',
              dias < 0
                ? 'border-peligro text-peligro'
                : dias <= 3
                  ? 'border-aviso text-aviso'
                  : 'border-marca text-marca',
            )}
          >
            {dias}
          </span>
          <div className="grid gap-0.5">
            <p className="text-sm font-semibold">Se paga el día {diaPago} de cada mes</p>
            <p className="text-xs text-tinta-tenue">
              {dias < 0 ? 'La fecha ya pasó' : textoVencimiento(dias)}
            </p>
          </div>
        </div>
      )}
      <p className="text-xs text-tinta-tenue">
        El margen usa el precio del plan de cada cliente llevado a un mes.
      </p>
    </aside>
  );
}
