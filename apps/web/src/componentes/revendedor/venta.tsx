'use client';

import {
  type CategoriaServicio,
  formatearMonto,
  INFO_CATEGORIA,
  type PlanMayorista,
  type ResultadoCompra,
} from '@nv/shared';
import clsx from 'clsx';
import { Check, UserRound, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useRef, useState } from 'react';
import { claseEntrada, Mensaje, MensajeError, type Validacion } from '@/componentes/cliente/pago';
import { Aviso, claseEnlace, MiniaturaServicio, Vacio } from '@/componentes/cliente/piezas-cuenta';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { formatearDuracion } from '@/lib/formato';
import { CampoBuscar } from './busqueda';
import { Lateral } from './lateral';
import { CeldaPlan, claseTabla, usd } from './panel';

/** Clave nueva por intento de venta: si la red falla y se reintenta, no se cobra dos veces. */
const claveNueva = () => crypto.randomUUID();

const duracion = (p: PlanMayorista) => formatearDuracion(p.duracionCantidad, p.duracionUnidad);

interface ClienteBreve {
  id: string;
  nombre: string;
}

/**
 * Nueva venta: buscador y filtros, la tabla de planes con el precio del nivel,
 * el público y el margen, y la venta en un panel lateral.
 */
export function NuevaVenta({
  planes,
  nivel,
  clientes,
  saldoUsd,
  bloqueo,
  planInicial,
  clienteInicial,
}: {
  planes: PlanMayorista[];
  nivel: string;
  clientes: ClienteBreve[];
  saldoUsd: string;
  bloqueo: string | null;
  /** Plan elegido desde la tienda: empieza con su venta abierta. */
  planInicial: string | null;
  /** «Vender otro plan a…» desde la ficha del cliente: ya queda elegido. */
  clienteInicial: ClienteBreve | null;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<'todos' | CategoriaServicio>('todos');
  const [para, setPara] = useState(clienteInicial);
  const [abierto, setAbierto] = useState<PlanMayorista | null>(
    bloqueo ? null : (planes.find((p) => p.id === planInicial) ?? null),
  );
  // Cada apertura empieza el formulario de cero.
  const [vez, setVez] = useState(0);
  const categorias = [
    ...new Set(planes.map((p) => p.servicio.categoria).filter((c) => c !== null)),
  ];
  const q = busqueda.trim().toLowerCase();
  const visibles = planes.filter(
    (p) =>
      (categoria === 'todos' || p.servicio.categoria === categoria) &&
      (!q || `${p.servicio.nombre} ${p.nombre}`.toLowerCase().includes(q)),
  );

  function abrir(p: PlanMayorista) {
    setVez((v) => v + 1);
    setAbierto(p);
  }

  return (
    <>
      {para && (
        <Aviso
          tono="cian"
          icono={<UserRound className="size-4" aria-hidden="true" />}
          titulo={`Vendiendo a ${para.nombre}`}
          accion={
            <button
              type="button"
              className={claseEnlace}
              onClick={() => {
                setPara(null);
                router.replace('/revendedor/catalogo', { scroll: false });
              }}
            >
              Quitar
            </button>
          }
        >
          Elige el plan y ya queda elegido como cliente.
        </Aviso>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <CampoBuscar
          id="buscar-plan"
          etiqueta="Buscar plan"
          placeholder="Busca un servicio o plan"
          valor={busqueda}
          onCambiar={setBusqueda}
        />
        {categorias.length > 1 && (
          <div role="group" aria-label="Categoría" className="flex flex-wrap gap-2">
            {(['todos', ...categorias] as const).map((c) => (
              <button
                key={c}
                type="button"
                className="chip"
                aria-pressed={categoria === c}
                onClick={() => setCategoria(c)}
              >
                {c === 'todos' ? 'Todos' : INFO_CATEGORIA[c].nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      {visibles.length === 0 ? (
        <Vacio>Ningún plan coincide.</Vacio>
      ) : (
        <div className={claseTabla}>
          <table className="t-tab">
            <thead>
              <tr>
                <th scope="col">Servicio y plan</th>
                <th scope="col" className="num">
                  Tu precio
                </th>
                <th scope="col" className="num">
                  Al público
                </th>
                <th scope="col" className="num">
                  Tu margen
                </th>
                <th scope="col">
                  <span className="sr-only">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const margen = Number(p.precioPublicoUsd) - Number(p.precioUsd);
                const nombre = `${p.servicio.nombre} ${p.nombre}`;
                return (
                  <tr key={p.id}>
                    <td data-l="Plan">
                      <CeldaPlan
                        servicio={p.servicio}
                        titulo={nombre}
                        detalle={`${duracion(p)}${p.servicio.categoria ? ` · ${INFO_CATEGORIA[p.servicio.categoria].nombre}` : ''}`}
                      />
                    </td>
                    <td data-l="Tu precio" className="num">
                      <b>{usd(p.precioUsd)}</b>
                      {p.precioVes && <small>≈ {formatearMonto(p.precioVes, 'VES')}</small>}
                    </td>
                    <td data-l="Al público" className="num">
                      {usd(p.precioPublicoUsd)}
                    </td>
                    <td data-l="Tu margen" className="num text-[#4ade80]">
                      {margen > 0 ? usd(margen) : '—'}
                    </td>
                    <td className="acc">
                      <Boton
                        tamano="sm"
                        variante="secundario"
                        disabled={Boolean(bloqueo)}
                        title={bloqueo ?? undefined}
                        aria-label={`Vender ${nombre}`}
                        aria-haspopup="dialog"
                        onClick={() => abrir(p)}
                      >
                        Vender
                      </Boton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Lateral
        abierto={Boolean(abierto)}
        titulo="Nueva venta"
        subtitulo={
          abierto ? `${abierto.servicio.nombre} ${abierto.nombre} · ${duracion(abierto)}` : ''
        }
        onCerrar={() => setAbierto(null)}
      >
        {abierto && (
          <FormularioVenta
            key={`${abierto.id}-${vez}`}
            plan={abierto}
            nivel={nivel}
            clientes={clientes}
            clienteInicial={para?.id ?? null}
            saldoUsd={saldoUsd}
            onCerrar={() => setAbierto(null)}
            onHecha={() => setPara(null)}
          />
        )}
      </Lateral>
    </>
  );
}

type Campo = 'nombre' | 'correo' | 'whatsapp' | 'cliente';
type Datos = Record<Campo, string>;

function validar(c: Campo, v: string): Validacion {
  const t = v.trim();
  if (c === 'nombre') {
    if (t.length < 2) return ['mal', 'Escribe el nombre de tu cliente.'];
    if (t.length > 120) return ['mal', 'Máximo 120 caracteres.'];
    return ['ok', 'Nombre listo'];
  }
  if (c === 'correo') {
    if (!t) return ['', 'Opcional'];
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)
      ? ['ok', 'Correo listo']
      : ['mal', 'Revisa el correo, falta algo.'];
  }
  if (c === 'whatsapp') {
    if (!t) return ['', 'Opcional, con código de país'];
    return /^\+\d{7,15}$/.test(t.replace(/[\s().-]/g, ''))
      ? ['ok', 'WhatsApp listo']
      : ['mal', 'Empieza con + y el código de país.'];
  }
  return t ? ['ok', ''] : ['mal', 'Elige un cliente de tu cartera.'];
}

const CAMPO_API: Record<Campo, string> = {
  nombre: 'cliente.nombre',
  correo: 'cliente.correo',
  whatsapp: 'cliente.whatsapp',
  cliente: 'clienteId',
};

/** Formulario de la venta con validación en vivo y, al terminar, el aviso de «Listo». */
function FormularioVenta({
  plan,
  nivel,
  clientes,
  clienteInicial,
  saldoUsd,
  onCerrar,
  onHecha,
}: {
  plan: PlanMayorista;
  nivel: string;
  clientes: ClienteBreve[];
  clienteInicial: string | null;
  saldoUsd: string;
  onCerrar: () => void;
  onHecha: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const notificar = useNotificar();
  const [modo, setModo] = useState<'nuevo' | 'cartera'>(clienteInicial ? 'cartera' : 'nuevo');
  const [datos, setDatos] = useState<Datos>({
    nombre: '',
    correo: '',
    whatsapp: '',
    cliente: clienteInicial ?? '',
  });
  const [tocados, setTocados] = useState<Partial<Record<Campo, boolean>>>({});
  const [intento, setIntento] = useState(false);
  const [clave, setClave] = useState(claveNueva);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [hecha, setHecha] = useState<{ cliente: string; saldoUsd: string } | null>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const servidor = erroresPorCampo(error);
  const campos: Campo[] = modo === 'nuevo' ? ['nombre', 'correo', 'whatsapp'] : ['cliente'];
  const queda = Number(saldoUsd) - Number(plan.precioUsd);
  const nombrePlan = `${plan.servicio.nombre} ${plan.nombre}`;

  function estado(c: Campo): Validacion {
    const deApi = servidor[CAMPO_API[c]];
    if (deApi) return ['mal', deApi];
    const v = validar(c, datos[c]);
    // En vivo mientras escribe; el error de un campo vacío, al salir de él o al enviar.
    if (intento || tocados[c] || datos[c].trim()) return v;
    return ['', c === 'nombre' ? 'Así lo verás en tu cartera' : v[1]];
  }

  function cambiar(c: Campo, v: string) {
    setDatos((d) => ({ ...d, [c]: v }));
    setError(null);
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIntento(true);
    const malos = campos.filter((c) => validar(c, datos[c])[0] === 'mal');
    if (malos.length > 0) {
      notificar(
        malos.length === 1
          ? 'Revisa el campo marcado en rojo'
          : `Revisa los ${malos.length} campos marcados en rojo`,
        'error',
      );
      requestAnimationFrame(() =>
        formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setCargando(true);
    setError(null);
    const r = await llamarApi<ResultadoCompra>('POST', '/revendedor/compras', {
      tipo: 'alta',
      planId: plan.id,
      claveIdempotencia: clave,
      ...(modo === 'cartera'
        ? { clienteId: datos.cliente }
        : {
            cliente: {
              nombre: datos.nombre.trim(),
              ...(datos.correo.trim() ? { correo: datos.correo.trim() } : {}),
              ...(datos.whatsapp.trim() ? { whatsapp: datos.whatsapp.trim() } : {}),
            },
          }),
    });
    setCargando(false);
    if (!r.ok) {
      setError(r.error);
      notificar(r.error.mensaje, 'error');
      // Si la red falló, la misma clave evita cobrar dos veces al reintentar.
      if (r.error.estado !== 0) setClave(claveNueva());
      return;
    }
    setClave(claveNueva());
    notificar(`Venta hecha. Saldo: ${usd(r.datos.saldoUsd)}`);
    setHecha({ cliente: r.datos.compra.cliente.nombre, saldoUsd: r.datos.saldoUsd });
    onHecha();
    router.refresh();
  }

  const cabecera = (
    <div className="flex items-center gap-3 rounded-[1rem] border border-borde bg-white/[0.03] p-3">
      <MiniaturaServicio
        slug={plan.servicio.slug}
        categoria={plan.servicio.categoria}
        nombre={plan.servicio.nombre}
        className="size-11 rounded-xl"
      />
      <div className="grid min-w-0 gap-0.5">
        <b className="text-[0.95rem]">{nombrePlan}</b>
        <small className="text-[0.8rem] text-tinta-suave">
          Tu precio {usd(plan.precioUsd)} · al público {usd(plan.precioPublicoUsd)}
        </small>
      </div>
    </div>
  );

  if (hecha) {
    return (
      <>
        {cabecera}
        <div
          role="status"
          className="grid gap-2.5 rounded-2xl border border-exito/45 bg-exito/[0.07] p-3.5"
        >
          <b className="flex items-center gap-2 text-[0.95rem]">
            <Check className="size-4.5 shrink-0 text-exito" aria-hidden="true" />
            Listo: {nombrePlan} para {hecha.cliente}
          </b>
          <p className="text-[0.86rem] text-tinta-suave">
            Pagaste {usd(plan.precioUsd)} con tu saldo. Te quedan {usd(hecha.saldoUsd)}. Cuando el
            acceso esté listo lo verás en Accesos de clientes.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
            <BotonEnlace href="/revendedor/accesos">Ver accesos</BotonEnlace>
            <button type="button" className={claseEnlace} onClick={onCerrar}>
              Seguir vendiendo
            </button>
          </div>
        </div>
      </>
    );
  }

  const malos = intento ? campos.filter((c) => estado(c)[0] === 'mal').length : 0;
  const deCampo = Object.values(CAMPO_API).some((c) => servidor[c]);

  function entrada(c: Exclude<Campo, 'cliente'>, etiqueta: string, extra: object) {
    const [e, t] = estado(c);
    return (
      <div className="grid content-start gap-1.5">
        <label htmlFor={`${id}-${c}`} className="text-sm font-semibold">
          {etiqueta}
        </label>
        <input
          id={`${id}-${c}`}
          autoComplete="off"
          value={datos[c]}
          onChange={(ev) => cambiar(c, ev.target.value)}
          onBlur={() => setTocados((x) => ({ ...x, [c]: true }))}
          aria-invalid={e === 'mal' ? true : undefined}
          aria-describedby={`${id}-${c}-m`}
          className={claseEntrada(e)}
          {...extra}
        />
        <Mensaje id={`${id}-${c}-m`} estado={e} texto={t} />
      </div>
    );
  }

  return (
    <>
      {cabecera}
      <form
        ref={formulario}
        noValidate
        onSubmit={enviar}
        aria-label={`Vender ${nombrePlan}`}
        className="grid gap-3.5"
      >
        <div
          role="group"
          aria-label="¿Para quién?"
          className="grid grid-cols-2 gap-1.5 rounded-[0.875rem] border border-borde bg-[rgb(3_5_14/0.6)] p-1"
        >
          {(
            [
              ['nuevo', 'Cliente nuevo'],
              ['cartera', 'De mi cartera'],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={modo === valor}
              disabled={valor === 'cartera' && clientes.length === 0}
              title={
                valor === 'cartera' && clientes.length === 0
                  ? 'Todavía no tienes clientes en tu cartera'
                  : undefined
              }
              onClick={() => {
                setModo(valor);
                setIntento(false);
                setError(null);
              }}
              className="rounded-[0.625rem] px-2 py-2.5 text-sm font-semibold text-tinta-suave transition-colors aria-pressed:bg-marca/20 aria-pressed:text-tinta aria-pressed:shadow-[inset_0_0_0_1px_var(--nv-marca)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {texto}
            </button>
          ))}
        </div>

        {modo === 'nuevo' ? (
          <>
            {entrada('nombre', 'Nombre del cliente', {
              maxLength: 120,
              placeholder: 'Ej.: María Pérez',
              autoFocus: true,
            })}
            {entrada('correo', 'Correo', {
              type: 'email',
              inputMode: 'email',
              placeholder: 'cliente@correo.com',
            })}
            {entrada('whatsapp', 'WhatsApp', {
              inputMode: 'tel',
              placeholder: '+58 414 000 0000',
            })}
          </>
        ) : (
          (() => {
            const [e, t] = estado('cliente');
            return (
              <div className="grid content-start gap-1.5">
                <label htmlFor={`${id}-cliente`} className="text-sm font-semibold">
                  Cliente
                </label>
                <select
                  id={`${id}-cliente`}
                  value={datos.cliente}
                  onChange={(ev) => {
                    cambiar('cliente', ev.target.value);
                    setTocados((x) => ({ ...x, cliente: true }));
                  }}
                  aria-invalid={e === 'mal' ? true : undefined}
                  aria-describedby={`${id}-cliente-m`}
                  className={claseEntrada(e === 'ok' ? '' : e)}
                >
                  <option value="">Elige un cliente</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                <Mensaje id={`${id}-cliente-m`} estado={e === 'ok' ? '' : e} texto={t} />
              </div>
            );
          })()
        )}

        <dl className="grid gap-1.5 rounded-[0.875rem] border border-borde bg-white/[0.03] px-3.5 py-3 text-sm tabular-nums">
          <div className="flex justify-between gap-2.5">
            <dt className="text-tinta-suave">Precio {nivel}</dt>
            <dd className="font-semibold">{usd(plan.precioUsd)}</dd>
          </div>
          <div className="flex justify-between gap-2.5">
            <dt className="text-tinta-suave">Tu saldo</dt>
            <dd className="font-semibold">{usd(saldoUsd)}</dd>
          </div>
          <div className={clsx('flex justify-between gap-2.5', queda < 0 && 'text-peligro')}>
            <dt className={queda < 0 ? '' : 'text-tinta-suave'}>
              {queda < 0 ? 'Te faltan' : 'Te quedan'}
            </dt>
            <dd className="font-semibold">{usd(Math.abs(queda))}</dd>
          </div>
        </dl>

        {malos > 0 && (
          <p role="alert" className="flex items-center gap-2 text-sm font-medium text-peligro">
            <X className="size-4 shrink-0" aria-hidden="true" />
            {malos === 1
              ? 'Revisa el campo marcado en rojo.'
              : `Revisa los ${malos} campos marcados en rojo.`}
          </p>
        )}
        {error && !deCampo && (
          <MensajeError
            error={error}
            extra={
              error.estado === 0 || error.estado >= 500
                ? 'Tus datos siguen aquí: inténtalo de nuevo.'
                : undefined
            }
          />
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          {queda < 0 || error?.codigo === 'SALDO_INSUFICIENTE' ? (
            <BotonEnlace href="/revendedor/saldo">Recargar saldo</BotonEnlace>
          ) : (
            <Boton type="submit" cargando={cargando}>
              {cargando ? 'Vendiendo…' : `Vender por ${usd(plan.precioUsd)}`}
            </Boton>
          )}
          <button type="button" className={claseEnlace} disabled={cargando} onClick={onCerrar}>
            Cancelar
          </button>
        </div>
        <p className="text-xs text-tinta-tenue">
          Se activa al instante en la cuenta propia de tu cliente. Nunca entregamos usuarios ni
          contraseñas.
        </p>
      </form>
    </>
  );
}
