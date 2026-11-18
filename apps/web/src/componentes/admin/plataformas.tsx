'use client';

import {
  type CuentaServicioDetalle,
  esTitular,
  type PerfilCuentaPublico,
  type PlataformaCuentas,
  type ServicioInventario,
  TEXTOS_PLATAFORMA,
} from '@nv/shared';
import clsx from 'clsx';
import {
  ArrowUpDown,
  Eye,
  LayoutGrid,
  MailSearch,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { clasesEntrada } from '@/componentes/ui/clases';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { formatearDia, formatearFecha } from '@/lib/formato';
import { AccionesPerfil } from './cuentas';
import { AvisarDatos, type DatosAlta, Dialogo } from './cuentas-gestor';

const DIA_MS = 86_400_000;
/** Igual que en la API: «por vencer» son los próximos 3 días. */
const DIAS_POR_VENCER = 3;

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Inicial con el color de la marca cuando la plataforma no tiene logo. */
function Logo({
  nombre,
  url,
  grande = false,
}: {
  nombre: string;
  url: string | null;
  grande?: boolean;
}) {
  const tam = grande ? 'size-16 text-2xl' : 'size-12 text-lg';
  if (url) {
    return <img src={url} alt="" className={clsx(tam, 'shrink-0 rounded-2xl object-cover')} />;
  }
  return (
    <span
      aria-hidden
      className={clsx(
        tam,
        'grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-marca to-acento font-bold text-white',
      )}
    >
      {nombre.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/* ─────────────────────────── Grilla de plataformas ─────────────────────────── */

/** Una tarjeta por plataforma: clientes, por vencer y vencidos, como en el Gestor. */
export function GrillaPlataformas({ servicios }: { servicios: ServicioInventario[] }) {
  if (servicios.length === 0) {
    return (
      <EstadoVacio icono={LayoutGrid} titulo="Aún no hay plataformas con cuentas">
        Agrega la primera cuenta de una plataforma en «Todas las cuentas».
      </EstadoVacio>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {servicios.map((s) => {
        const ocupacion = s.conteo.perfiles ? s.conteo.ocupados / s.conteo.perfiles : 0;
        return (
          <li key={s.servicio.id}>
            <Link
              href={`/admin/plataformas/${s.servicio.id}`}
              className="flex items-center gap-3 rounded-2xl border border-borde bg-[rgb(10_14_32/0.55)] p-4 transition-colors hover:border-cian"
            >
              <Logo nombre={s.servicio.nombre} url={s.servicio.logoUrl} />
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{s.servicio.nombre}</span>
                  <span
                    className="rounded-full bg-hundida px-2 py-0.5 text-sm font-semibold tabular-nums"
                    title="Clientes"
                  >
                    {s.conteo.ocupados}
                  </span>
                </span>
                <span className="flex flex-wrap gap-x-3 text-xs text-tinta-suave">
                  {s.conteo.porVencer > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-aviso" aria-hidden />
                      {s.conteo.porVencer} por vencer
                    </span>
                  )}
                  {s.conteo.vencidos > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-peligro" aria-hidden />
                      {s.conteo.vencidos} {s.conteo.vencidos === 1 ? 'vencido' : 'vencidos'}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-exito" aria-hidden />
                    {s.conteo.libres} {s.conteo.libres === 1 ? 'libre' : 'libres'}
                  </span>
                  {s.conteo.caidas > 0 && (
                    <span className="text-peligro">{s.conteo.caidas} caídas</span>
                  )}
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-hundida" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-marca"
                    style={{ width: `${Math.round(ocupacion * 100)}%` }}
                  />
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ─────────────────────────── Página de una plataforma ─────────────────────────── */

type Situacion = 'libre' | 'respaldo' | 'ocupado' | 'por_vencer' | 'vencido' | 'bloqueado';

const ESTILO: Record<Situacion, { punto: string; barra: string; texto: string }> = {
  ocupado: { punto: 'bg-marca text-white', barra: 'bg-marca', texto: 'Ocupado' },
  por_vencer: { punto: 'bg-aviso text-black', barra: 'bg-aviso', texto: 'Por vencer' },
  vencido: { punto: 'bg-peligro/60 text-white', barra: 'bg-peligro/60', texto: 'Cliente vencido' },
  libre: { punto: 'bg-exito/25 text-exito', barra: 'bg-exito/50', texto: 'Libre' },
  respaldo: { punto: 'bg-aviso/25 text-aviso', barra: 'bg-aviso/40', texto: 'Respaldo' },
  bloqueado: {
    punto: 'bg-hundida text-tinta-tenue',
    barra: 'bg-tinta-tenue/40',
    texto: 'Bloqueado',
  },
};
const LEYENDA: Situacion[] = ['ocupado', 'por_vencer', 'vencido', 'libre', 'respaldo'];

function situacion(p: PerfilCuentaPublico, ahora: number): Situacion {
  if (p.estado === 'libre') return 'libre';
  if (p.estado === 'bloqueado') return 'bloqueado';
  if (p.estado === 'respaldo') return 'respaldo';
  const a = p.asignacion;
  if (!a || a.terminada) return 'vencido';
  if (a.venceEn && new Date(a.venceEn).getTime() <= ahora + DIAS_POR_VENCER * DIA_MS) {
    return 'por_vencer';
  }
  return 'ocupado';
}

/** «dd/mm» del vencimiento. */
const diaMes = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

function textoRelativo(iso: string, ahora: number): string {
  const dias = Math.ceil((new Date(iso).getTime() - ahora) / DIA_MS);
  if (dias < 0) return `venció hace ${-dias} d`;
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  return `en ${dias} d`;
}

const esIndividual = (c: CuentaServicioDetalle) => c.modo === 'completa' || c.perfiles.total === 1;

export interface PermisosPlataforma {
  gestionar: boolean;
  revelar: boolean;
  codigos: boolean;
  /** Datos para «Agregar cliente» (sin permiso de crear suscripciones, undefined). */
  alta: Omit<DatosAlta, 'servicioId' | 'facturaEn'> | undefined;
}

/** Un lugar de una cuenta: al tocarlo se abren sus acciones (agregar, mensaje, mover, cortar). */
function Lugar({
  cuenta,
  perfil,
  ahora,
  permisos,
  tipo,
  vigentes,
}: {
  cuenta: CuentaServicioDetalle;
  perfil: PerfilCuentaPublico;
  ahora: number;
  permisos: PermisosPlataforma;
  tipo: PlataformaCuentas['tipo'];
  vigentes: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const s = situacion(perfil, ahora);
  const a = perfil.asignacion;
  const activa = Boolean(a && ['activa', 'en_gracia'].includes(a.estado));
  return (
    <li>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={!permisos.gestionar}
        aria-label={`${perfil.nombre}: ${a ? a.cliente.nombre : ESTILO[s].texto}`}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-white/[0.04] disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span
          className={clsx(
            'grid size-6 shrink-0 place-items-center rounded-lg text-xs font-bold tabular-nums',
            ESTILO[s].punto,
          )}
          aria-hidden
        >
          {perfil.numero}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {a ? (
            <span className="font-medium">{a.cliente.nombre}</span>
          ) : (
            <span className="italic text-tinta-tenue">{ESTILO[s].texto}</span>
          )}
          {perfil.nota && <span className="ml-1.5 text-xs text-tinta-tenue">{perfil.nota}</span>}
        </span>
        {a?.venceEn && (
          <span
            className={clsx(
              'shrink-0 font-mono text-xs tabular-nums',
              s === 'por_vencer'
                ? 'text-aviso'
                : s === 'vencido'
                  ? 'text-peligro'
                  : 'text-tinta-suave',
            )}
          >
            {diaMes(a.venceEn)}
          </span>
        )}
      </button>
      {abierto && (
        <Dialogo
          titulo={`${perfil.nombre} · ${cuenta.pista}`}
          icono={<Users className="size-5 text-marca" aria-hidden="true" />}
          onCerrar={() => setAbierto(false)}
        >
          {a ? (
            <div className="grid gap-1 text-sm">
              <Link
                href={`/admin/clientes/${a.cliente.id}`}
                className="font-semibold hover:text-cian"
              >
                {a.cliente.nombre}
              </Link>
              <span className="text-tinta-suave">
                {a.plan.nombre}
                {a.venceEn
                  ? ` · vence el ${formatearFecha(a.venceEn)} (${textoRelativo(a.venceEn, ahora)})`
                  : ''}
              </span>
              <span className="flex flex-wrap gap-3 pt-1">
                <Link
                  href={`/admin/suscripciones/${a.suscripcionId}`}
                  className="inline-flex items-center gap-1 font-medium text-cian hover:underline"
                >
                  <RefreshCw className="size-3.5" aria-hidden /> Renovar
                </Link>
                <Link
                  href={`/admin/clientes/${a.cliente.id}`}
                  className="inline-flex items-center gap-1 font-medium text-cian hover:underline"
                >
                  <Eye className="size-3.5" aria-hidden /> Ficha del cliente
                </Link>
              </span>
            </div>
          ) : (
            <p className="text-sm text-tinta-suave">
              {perfil.estado === 'libre'
                ? `${TEXTOS_PLATAFORMA[tipo].lugar} libre: agrega un cliente nuevo o asigna una suscripción que ya existe.`
                : ESTILO[s].texto}
            </p>
          )}
          <AccionesPerfil
            cuentaId={cuenta.id}
            perfil={perfil}
            cuentaActiva={cuenta.estado === 'activa'}
            puedeRevelar={permisos.revelar}
            tipo={tipo}
            otrosActivos={Math.max(0, vigentes - (activa ? 1 : 0))}
            alta={
              permisos.alta
                ? { ...permisos.alta, servicioId: cuenta.servicio.id, facturaEn: cuenta.facturaEn }
                : undefined
            }
          />
        </Dialogo>
      )}
    </li>
  );
}

function TarjetaCuenta({
  c,
  ahora,
  permisos,
  tipo,
}: {
  c: CuentaServicioDetalle;
  ahora: number;
  permisos: PermisosPlataforma;
  tipo: PlataformaCuentas['tipo'];
}) {
  const perfiles = c.listaPerfiles;
  const ocupados = perfiles.filter((p) => p.estado === 'asignado').length;
  const libres = perfiles.filter((p) => p.estado === 'libre').length;
  const vigentes = perfiles.filter(
    (p) => p.asignacion && ['activa', 'en_gracia'].includes(p.asignacion.estado),
  ).length;
  const venceCuenta = c.facturaEn
    ? Math.ceil((new Date(`${c.facturaEn}T12:00:00Z`).getTime() - ahora) / DIA_MS)
    : null;
  return (
    <li className="grid content-start gap-3 rounded-2xl border border-borde bg-[rgb(10_14_32/0.55)] p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/admin/cuentas/${c.id}`}
          className="min-w-0 truncate font-mono text-sm font-semibold hover:text-cian"
          title="Abrir la cuenta: correo, clave, pagos al proveedor"
        >
          {c.pista}
        </Link>
        {c.estado === 'caida' ? (
          <Insignia tono="peligro">Caída</Insignia>
        ) : c.estado === 'en_espera' ? (
          <Insignia tono="aviso">Sin anotar</Insignia>
        ) : c.facturaEn ? (
          <Insignia tono={venceCuenta !== null && venceCuenta <= 3 ? 'aviso' : 'exito'}>
            Vence {formatearDia(c.facturaEn)}
          </Insignia>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {perfiles.map((p) => (
            <span
              key={p.id}
              className={clsx('h-1.5 flex-1 rounded-full', ESTILO[situacion(p, ahora)].barra)}
            />
          ))}
        </div>
        <span className="shrink-0 font-mono text-xs text-tinta-suave tabular-nums">
          {ocupados}/{perfiles.length}
          {libres > 0 && (
            <span className="text-exito">
              {' '}
              · {libres} {libres === 1 ? 'libre' : 'libres'}
            </span>
          )}
        </span>
      </div>
      <ul className="grid gap-0.5">
        {perfiles.map((p) => (
          <Lugar
            key={p.id}
            cuenta={c}
            perfil={p}
            ahora={ahora}
            permisos={permisos}
            tipo={tipo}
            vigentes={vigentes}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-borde pt-3 text-sm">
        <Link
          href={`/admin/cuentas/${c.id}`}
          className="inline-flex items-center gap-1.5 font-medium hover:text-cian"
        >
          <Pencil className="size-3.5" aria-hidden /> Editar y renovar
        </Link>
        {permisos.revelar && c.estado === 'activa' && vigentes > 0 && (
          <AvisarDatos cuentaId={c.id} asignados={vigentes} />
        )}
        {permisos.codigos && (
          <Link
            href={`/admin/codigos?cuenta=${c.id}`}
            className="inline-flex items-center gap-1.5 font-medium hover:text-cian"
          >
            <MailSearch className="size-3.5" aria-hidden /> Código
          </Link>
        )}
      </div>
    </li>
  );
}

type Pestana = 'completas' | 'individuales' | 'clientes';
type FiltroCuentas = 'todas' | 'libres' | 'llenas';
type FiltroClientes = 'todos' | 'activos' | 'por_vencer' | 'vencidos';

/** Una plataforma como en el Gestor: cuentas completas, individuales y sus clientes. */
export function PlataformaGestor({
  datos,
  ahora,
  permisos,
}: {
  datos: PlataformaCuentas;
  ahora: number;
  permisos: PermisosPlataforma;
}) {
  const completas = datos.cuentas.filter((c) => !esIndividual(c));
  const individuales = datos.cuentas.filter(esIndividual);
  const [pestana, setPestana] = useState<Pestana>(
    completas.length === 0 && individuales.length > 0 ? 'individuales' : 'completas',
  );
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroCuentas>('todas');
  const [filtroClientes, setFiltroClientes] = useState<FiltroClientes>('todos');
  const [orden, setOrden] = useState<'vence' | 'libres'>('vence');

  const lugares = datos.cuentas.flatMap((c) => c.listaPerfiles.map((p) => ({ c, p })));
  const clientes = lugares.filter(({ p }) => p.asignacion);
  const libres = lugares.filter(({ p }) => p.estado === 'libre').length;
  const respaldos = lugares.filter(({ p }) => p.estado === 'respaldo').length;
  const porVencer = clientes.filter(({ p }) => situacion(p, ahora) === 'por_vencer').length;
  const vencidos = clientes.filter(({ p }) => situacion(p, ahora) === 'vencido').length;
  const q = normalizar(busqueda.trim());

  const cuentasVisibles = useMemo(() => {
    const base = pestana === 'individuales' ? individuales : completas;
    const lista = base.filter((c) => {
      const l = c.listaPerfiles.filter((p) => p.estado === 'libre').length;
      if (filtro === 'libres' && l === 0) return false;
      if (filtro === 'llenas' && l > 0) return false;
      if (!q) return true;
      return [
        c.pista,
        c.proveedor ?? '',
        c.notas ?? '',
        ...c.listaPerfiles.flatMap((p) => [
          p.nombre,
          p.nota ?? '',
          p.asignacion?.cliente.nombre ?? '',
        ]),
      ].some((t) => normalizar(t).includes(q));
    });
    if (orden === 'libres') {
      return [...lista].sort(
        (a, b) =>
          b.listaPerfiles.filter((p) => p.estado === 'libre').length -
          a.listaPerfiles.filter((p) => p.estado === 'libre').length,
      );
    }
    return lista;
  }, [pestana, individuales, completas, filtro, q, orden]);

  const clientesVisibles = useMemo(
    () =>
      clientes
        .filter(({ c, p }) => {
          const s = situacion(p, ahora);
          if (filtroClientes === 'activos' && s === 'vencido') return false;
          if (filtroClientes === 'por_vencer' && s !== 'por_vencer') return false;
          if (filtroClientes === 'vencidos' && s !== 'vencido') return false;
          if (!q) return true;
          return [p.asignacion?.cliente.nombre ?? '', c.pista, p.nombre].some((t) =>
            normalizar(t).includes(q),
          );
        })
        .sort((x, y) =>
          (x.p.asignacion?.venceEn ?? '9').localeCompare(y.p.asignacion?.venceEn ?? '9'),
        ),
    [clientes, filtroClientes, q, ahora],
  );

  const cuentaDe = (base: CuentaServicioDetalle[], f: FiltroCuentas) =>
    base.filter((c) => {
      const l = c.listaPerfiles.filter((p) => p.estado === 'libre').length;
      return f === 'todas' || (f === 'libres' ? l > 0 : l === 0);
    }).length;
  const baseCuentas = pestana === 'individuales' ? individuales : completas;

  const pestanas: { clave: Pestana; nombre: string; n: number }[] = [
    { clave: 'completas', nombre: 'Cuentas completas', n: completas.length },
    { clave: 'individuales', nombre: 'Cuentas individuales', n: individuales.length },
    { clave: 'clientes', nombre: 'Clientes', n: clientes.length },
  ];

  return (
    <div className="grid gap-5">
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-borde bg-[rgb(10_14_32/0.55)] p-4 sm:p-5">
        <Logo nombre={datos.servicio.nombre} url={datos.servicio.logoUrl} grande />
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="text-xl font-bold">{datos.servicio.nombre}</h2>
          <p className="text-xs text-tinta-suave">{TEXTOS_PLATAFORMA[datos.tipo].descripcion}</p>
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1">
            <dt className="text-tinta-suave">Clientes:</dt>
            <dd className="font-semibold">
              {clientes.length}{' '}
              <span className="font-normal text-exito">({libres} disponibles)</span>
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-tinta-suave">Cuentas:</dt>
            <dd className="font-semibold">{datos.cuentas.length}</dd>
          </div>
          {porVencer > 0 && (
            <div className="flex gap-1 text-aviso">
              <dt>Por vencer:</dt>
              <dd className="font-semibold">{porVencer}</dd>
            </div>
          )}
          {vencidos > 0 && (
            <div className="flex gap-1 text-peligro">
              <dt>Vencidos:</dt>
              <dd className="font-semibold">{vencidos}</dd>
            </div>
          )}
          <div
            className="flex items-center gap-1"
            title="Perfiles libres guardados para reponer caídas"
          >
            <dt className="inline-flex items-center gap-1 text-tinta-suave">
              <ShieldCheck className="size-3.5" aria-hidden /> Respaldo:
            </dt>
            <dd className="font-semibold">{respaldos}</dd>
          </div>
        </dl>
      </section>

      <div role="tablist" aria-label="Vista" className="flex flex-wrap gap-1 border-b border-borde">
        {pestanas.map((t) => (
          <button
            key={t.clave}
            type="button"
            role="tab"
            aria-selected={pestana === t.clave}
            onClick={() => {
              setPestana(t.clave);
              setFiltro('todas');
            }}
            className={clsx(
              '-mb-px border-b-2 px-3 py-2 text-sm font-semibold',
              pestana === t.clave
                ? 'border-marca text-marca'
                : 'border-transparent text-tinta-suave hover:text-tinta',
            )}
          >
            {t.nombre} <span className="ml-1 text-xs tabular-nums opacity-70">{t.n}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        <label className="relative">
          <span className="sr-only">Buscar</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tinta-tenue"
            aria-hidden
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.currentTarget.value)}
            placeholder={
              pestana === 'clientes'
                ? 'Buscar por cliente, correo o perfil'
                : 'Buscar por correo, cliente, perfil o nota'
            }
            className={clsx(clasesEntrada, 'pl-10')}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtro">
            {pestana === 'clientes'
              ? (
                  [
                    ['todos', 'Todos', clientes.length],
                    ['activos', 'Activos', clientes.length - vencidos],
                    ['por_vencer', 'Por vencer', porVencer],
                    ['vencidos', 'Vencidos', vencidos],
                  ] as const
                ).map(([k, n, cuenta]) => (
                  <Chip
                    key={k}
                    activo={filtroClientes === k}
                    onClick={() => setFiltroClientes(k)}
                    n={cuenta}
                  >
                    {n}
                  </Chip>
                ))
              : (
                  [
                    ['todas', 'Todas'],
                    ['libres', 'Con libres'],
                    ['llenas', 'Llenas'],
                  ] as const
                ).map(([k, n]) => (
                  <Chip
                    key={k}
                    activo={filtro === k}
                    onClick={() => setFiltro(k)}
                    n={cuentaDe(baseCuentas, k)}
                  >
                    {n}
                  </Chip>
                ))}
          </div>
          {pestana !== 'clientes' && (
            <label className="inline-flex items-center gap-2 text-sm">
              <ArrowUpDown className="size-4 text-tinta-tenue" aria-hidden />
              <span className="sr-only">Orden</span>
              <select
                value={orden}
                onChange={(e) => setOrden(e.currentTarget.value as 'vence' | 'libres')}
                className="h-9 rounded-xl border border-borde bg-hundida px-2 text-sm"
              >
                <option value="vence">Vence primero</option>
                <option value="libres">Más libres</option>
              </select>
            </label>
          )}
        </div>
        {pestana !== 'clientes' && (
          <ul
            className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-suave"
            aria-label="Colores"
          >
            {LEYENDA.map((s) => (
              <li key={s} className="inline-flex items-center gap-1.5">
                <span className={clsx('size-2.5 rounded-sm', ESTILO[s].barra)} aria-hidden />
                {ESTILO[s].texto}
              </li>
            ))}
          </ul>
        )}
      </div>

      {pestana === 'clientes' ? (
        clientesVisibles.length === 0 ? (
          <EstadoVacio icono={Users} titulo="No hay clientes con ese filtro" />
        ) : (
          <ul className="grid gap-2">
            {clientesVisibles.map(({ c, p }) => {
              const a = p.asignacion!;
              const s = situacion(p, ahora);
              return (
                <FilaCliente
                  key={p.id}
                  cuenta={c}
                  perfil={p}
                  situacion={s}
                  ahora={ahora}
                  permisos={permisos}
                  tipo={datos.tipo}
                  vigentes={
                    c.listaPerfiles.filter(
                      (x) => x.asignacion && ['activa', 'en_gracia'].includes(x.asignacion.estado),
                    ).length
                  }
                  titular={esTitular(datos.tipo, p.numero)}
                  nombre={a.cliente.nombre}
                />
              );
            })}
          </ul>
        )
      ) : cuentasVisibles.length === 0 ? (
        <EstadoVacio icono={LayoutGrid} titulo="No hay cuentas con ese filtro">
          {baseCuentas.length === 0
            ? pestana === 'individuales'
              ? 'Las cuentas de un solo perfil o completas aparecen aquí.'
              : 'Las cuentas con varios perfiles aparecen aquí.'
            : 'Cambia la búsqueda o el filtro.'}
        </EstadoVacio>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {cuentasVisibles.map((c) => (
            <TarjetaCuenta key={c.id} c={c} ahora={ahora} permisos={permisos} tipo={datos.tipo} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({
  activo,
  onClick,
  n,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  n: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm',
        activo ? 'border-marca bg-marca/15 font-semibold' : 'border-borde hover:border-tinta-tenue',
      )}
    >
      {children}
      <span className="rounded-full bg-hundida px-1.5 text-xs tabular-nums">{n}</span>
    </button>
  );
}

/** Un cliente de la plataforma: dónde está, cuándo vence y sus acciones. */
function FilaCliente({
  cuenta,
  perfil,
  situacion: s,
  ahora,
  permisos,
  tipo,
  vigentes,
  titular,
  nombre,
}: {
  cuenta: CuentaServicioDetalle;
  perfil: PerfilCuentaPublico;
  situacion: Situacion;
  ahora: number;
  permisos: PermisosPlataforma;
  tipo: PlataformaCuentas['tipo'];
  vigentes: number;
  titular: boolean;
  nombre: string;
}) {
  const a = perfil.asignacion!;
  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]!.toUpperCase())
    .join('');
  return (
    <li
      className={clsx(
        'flex flex-wrap items-center gap-3 rounded-2xl border border-borde bg-[rgb(10_14_32/0.55)] p-3 border-l-4',
        s === 'por_vencer'
          ? 'border-l-aviso'
          : s === 'vencido'
            ? 'border-l-peligro'
            : 'border-l-marca',
      )}
    >
      <span
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-hundida text-sm font-bold"
        aria-hidden
      >
        {iniciales}
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <Link
          href={`/admin/clientes/${a.cliente.id}`}
          className="truncate font-semibold hover:text-cian"
        >
          {nombre}
        </Link>
        <span className="truncate text-xs text-tinta-suave">
          {cuenta.pista} · {perfil.nombre}
          {titular ? ' (titular)' : ''} · {a.plan.nombre}
        </span>
      </div>
      {a.venceEn && (
        <span className="grid text-right">
          <span className="font-mono text-sm tabular-nums">{formatearFecha(a.venceEn)}</span>
          <span
            className={clsx(
              'text-xs',
              s === 'por_vencer'
                ? 'text-aviso'
                : s === 'vencido'
                  ? 'text-peligro'
                  : 'text-tinta-tenue',
            )}
          >
            {textoRelativo(a.venceEn, ahora)}
          </span>
        </span>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link
          href={`/admin/clientes/${a.cliente.id}`}
          className="inline-flex items-center gap-1 hover:text-cian"
        >
          <Eye className="size-3.5" aria-hidden /> Ver
        </Link>
        <Link
          href={`/admin/suscripciones/${a.suscripcionId}`}
          className="inline-flex items-center gap-1 hover:text-cian"
        >
          <RefreshCw className="size-3.5" aria-hidden /> Renovar
        </Link>
      </div>
      {permisos.gestionar && (
        <AccionesPerfil
          cuentaId={cuenta.id}
          perfil={perfil}
          cuentaActiva={cuenta.estado === 'activa'}
          puedeRevelar={permisos.revelar}
          tipo={tipo}
          otrosActivos={Math.max(0, vigentes - 1)}
        />
      )}
    </li>
  );
}
