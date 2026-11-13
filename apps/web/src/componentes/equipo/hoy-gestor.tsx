import { formatearMonto, type InicioGestor } from '@nv/shared';
import Link from 'next/link';
import { claseEnlace } from '@/componentes/cliente/piezas-cuenta';
import { Kpi, Kpis } from '@/componentes/revendedor/panel';
import { Seccion } from './centro';
import { EditarMeta } from './meta-mes';

const usd = (v: string) => formatearMonto(Number(v).toFixed(2), 'USD');
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function Barra({ valor, total }: { valor: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-hundida"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="h-full rounded-full bg-marca" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Meta({ m, puedeFijar }: { m: NonNullable<InicioGestor['meta']>; puedeFijar: boolean }) {
  const mes = MESES[Number(m.mes.slice(5, 7)) - 1] ?? '';
  const logrado = Number(m.logradoUsd);
  const meta = m.montoUsd ? Number(m.montoUsd) : null;
  const proyeccion = Number(m.proyeccionUsd);
  return (
    <section
      aria-label="Meta del mes"
      className="grid gap-3 rounded-[1.25rem] border border-borde-fuerte bg-[rgb(8_11_26/0.7)] px-4 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <span className="text-[0.78rem] font-semibold text-tinta-suave">Meta de {mes}</span>
          <b className="font-titulo text-[1.55rem] leading-tight font-extrabold tabular-nums">
            {usd(m.logradoUsd)}
            {meta !== null && (
              <span className="text-base font-semibold text-tinta-suave">
                {' '}
                de {usd(m.montoUsd!)}
              </span>
            )}
          </b>
        </div>
        {puedeFijar && <EditarMeta actual={m.montoUsd} />}
      </div>
      {meta !== null ? (
        <>
          <Barra valor={logrado} total={meta} />
          <p className="text-sm text-tinta-suave">
            {logrado >= meta ? '¡Meta cumplida!' : `Faltan ${usd((meta - logrado).toFixed(2))}.`} Al
            ritmo de estos {m.diasTranscurridos} días, cerrarías el mes en{' '}
            <b className="text-tinta">{usd(m.proyeccionUsd)}</b>
            {proyeccion >= meta ? ', por encima de la meta.' : ', por debajo de la meta.'}
          </p>
        </>
      ) : (
        <p className="text-sm text-tinta-suave">
          Sin meta para este mes. Al ritmo de estos {m.diasTranscurridos} días, cerrarías en{' '}
          <b className="text-tinta">{usd(m.proyeccionUsd)}</b>.
        </p>
      )}
    </section>
  );
}

/**
 * Lo que el Gestor mostraba arriba del panel: renovados hoy «x de y», notas por
 * avisar, cuentas liberadas, la meta del mes y una tarjeta por plataforma.
 */
export function HoyGestor({
  datos,
  puedeFijarMeta,
  puedeVerCuentas,
}: {
  datos: InicioGestor;
  puedeFijarMeta: boolean;
  puedeVerCuentas: boolean;
}) {
  const { renovadosHoy: r } = datos;
  return (
    <Seccion
      id="titulo-hoy"
      titulo="Hoy en el negocio"
      accion={
        <Link href="/admin/suscripciones/vencimientos" className={claseEnlace}>
          Vencimientos y cortes
        </Link>
      }
    >
      <Kpis>
        <Kpi
          titulo="Renovados hoy"
          valor={`${r.hechos} de ${r.total}`}
          detalle={
            r.total === 0
              ? 'Hoy no vence nadie'
              : r.hechos >= r.total
                ? 'Todo lo de hoy, renovado'
                : `Faltan ${r.total - r.hechos}`
          }
          tono={r.total > r.hechos ? 'aviso' : 'ok'}
        />
        <Kpi
          titulo="Notas por avisar"
          valor={datos.notasPorAvisar}
          detalle={
            datos.misTareas > 0 ? (
              <Link href="/admin/notas?vista=mias">
                {datos.misTareas === 1 ? '1 tarea tuya' : `${datos.misTareas} tareas tuyas`}
              </Link>
            ) : (
              <Link href="/admin/notas">Ver notas</Link>
            )
          }
          tono={datos.notasPorAvisar > 0 || datos.misTareas > 0 ? 'aviso' : undefined}
        />
        {puedeVerCuentas && (
          <Kpi
            titulo="Cuentas liberadas"
            valor={datos.cuentasLiberadas}
            detalle={<Link href="/admin/cuentas/sin-anotar">Sin anotar</Link>}
            tono={datos.cuentasLiberadas > 0 ? 'aviso' : undefined}
          />
        )}
        {puedeVerCuentas && (
          <Kpi
            titulo="Por reponer"
            valor={datos.plataformas.reduce((t, p) => t + p.porReponer, 0)}
            detalle={<Link href="/admin/cuentas/reposicion">Caídas y reposición</Link>}
          />
        )}
      </Kpis>
      {datos.meta && <Meta m={datos.meta} puedeFijar={puedeFijarMeta} />}
      {datos.plataformas.length > 0 && (
        <ul
          className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-3"
          aria-label="Plataformas"
        >
          {datos.plataformas.map((p) => (
            <li
              key={p.servicio.id}
              className="grid content-start gap-2 rounded-[1.125rem] border border-borde-fuerte bg-[rgb(8_11_26/0.7)] px-4 py-3.5"
            >
              <span className="truncate font-semibold">{p.servicio.nombre}</span>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-tinta-suave">Activas</dt>
                <dd className="text-right font-semibold tabular-nums">{p.activas}</dd>
                <dt className="text-tinta-suave">Vencen hoy</dt>
                <dd
                  className={`text-right tabular-nums ${p.vencenHoy ? 'font-semibold text-aviso' : ''}`}
                >
                  {p.vencenHoy}
                </dd>
                <dt className="text-tinta-suave">Mañana</dt>
                <dd className="text-right tabular-nums">{p.vencenManana}</dd>
                {puedeVerCuentas && (
                  <>
                    <dt className="text-tinta-suave">Por reponer</dt>
                    <dd
                      className={`text-right tabular-nums ${p.porReponer ? 'font-semibold text-peligro' : ''}`}
                    >
                      {p.porReponer}
                    </dd>
                    <dt className="text-tinta-suave">Perfiles libres</dt>
                    <dd className="text-right tabular-nums">{p.libres}</dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}
