'use client';

import type {
  CuentaInventario,
  Inventario,
  PerfilInventario,
  ServicioInventario,
} from '@nv/shared';
import clsx from 'clsx';
import { Boxes, KeyRound, Lock, MailSearch, Search, StickyNote } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { clasesEntrada } from '@/componentes/ui/clases';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { formatearDia } from '@/lib/formato';

/** Igual que en la API: «por vencer» son los próximos 3 días. */
const DIAS_POR_VENCER = 3;
const DIA_MS = 86_400_000;

type Situacion = 'libre' | 'respaldo' | 'ocupado' | 'por_vencer' | 'vencido' | 'bloqueado';
type Filtro = 'todos' | Situacion | 'caidas';

const FILTROS: { clave: Filtro; nombre: string }[] = [
  { clave: 'todos', nombre: 'Todos' },
  { clave: 'libre', nombre: 'Libres' },
  { clave: 'ocupado', nombre: 'Ocupados' },
  { clave: 'por_vencer', nombre: 'Por vencer' },
  { clave: 'vencido', nombre: 'Vencidos' },
  { clave: 'respaldo', nombre: 'Respaldo' },
  { clave: 'bloqueado', nombre: 'Bloqueados' },
  { clave: 'caidas', nombre: 'Cuentas caídas' },
];

const ESTILO: Record<Situacion, { punto: string; fila: string; texto: string }> = {
  libre: { punto: 'bg-exito', fila: 'border-exito/25 bg-exito-suave/40', texto: 'Libre' },
  ocupado: { punto: 'bg-acento', fila: 'border-borde bg-white/[0.02]', texto: 'Ocupado' },
  por_vencer: { punto: 'bg-aviso', fila: 'border-aviso/30 bg-aviso-suave/50', texto: 'Por vencer' },
  vencido: { punto: 'bg-peligro', fila: 'border-peligro/30 bg-peligro-suave/50', texto: 'Vencido' },
  respaldo: { punto: 'bg-aviso', fila: 'border-aviso/25 bg-aviso-suave/30', texto: 'Respaldo' },
  bloqueado: { punto: 'bg-tinta-tenue', fila: 'border-borde bg-hundida/60', texto: 'Bloqueado' },
};

function situacion(p: PerfilInventario, ahora: number): Situacion {
  if (p.estado === 'libre') return 'libre';
  if (p.estado === 'bloqueado') return 'bloqueado';
  if (p.estado === 'respaldo') return 'respaldo';
  if (p.estadoSuscripcion === 'vencida' || p.estadoSuscripcion === 'cancelada') return 'vencido';
  if (p.venceEn && new Date(p.venceEn).getTime() <= ahora + DIAS_POR_VENCER * DIA_MS) {
    return 'por_vencer';
  }
  return 'ocupado';
}

function textoVence(iso: string, ahora: number): string {
  const dias = Math.ceil((new Date(iso).getTime() - ahora) / DIA_MS);
  if (dias < 0) return `venció hace ${-dias} ${dias === -1 ? 'día' : 'días'}`;
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  return `vence en ${dias} días`;
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function Perfil({ p, ahora, tenue }: { p: PerfilInventario; ahora: number; tenue: boolean }) {
  const s = situacion(p, ahora);
  const e = ESTILO[s];
  return (
    <li
      className={clsx(
        'flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-opacity',
        e.fila,
        tenue && 'opacity-35',
      )}
    >
      <span className={clsx('size-2.5 shrink-0 rounded-full', e.punto)} aria-hidden />
      <span className="w-6 shrink-0 text-xs font-semibold text-tinta-tenue tabular-nums">
        {p.numero}
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{p.nombre}</span>
          {p.tienePin && (
            <Lock className="size-3.5 shrink-0 text-tinta-tenue" aria-label="Tiene PIN" />
          )}
          {p.nota && (
            <StickyNote className="size-3.5 shrink-0 text-tinta-tenue" aria-label={p.nota} />
          )}
        </span>
        <span className="truncate text-xs text-tinta-suave">
          {p.cliente ? (
            <>
              {p.cliente.nombre}
              {p.venceEn && <> · {textoVence(p.venceEn, ahora)}</>}
            </>
          ) : (
            e.texto
          )}
          {p.nota && !p.cliente && <> · {p.nota}</>}
        </span>
      </span>
      {p.cliente && (
        <span className="sr-only">
          {e.texto}
          {p.nota ? `. Nota: ${p.nota}` : ''}
        </span>
      )}
    </li>
  );
}

function TarjetaCuenta({
  c,
  ahora,
  coincide,
  verCodigos,
}: {
  c: CuentaInventario;
  ahora: number;
  coincide: (p: PerfilInventario) => boolean;
  verCodigos: boolean;
}) {
  const libres = c.perfiles.filter((p) => p.estado === 'libre').length;
  return (
    <li className="grid content-start gap-3 rounded-2xl border border-borde bg-[rgb(10_14_32/0.55)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <Link
            href={`/admin/cuentas/${c.id}`}
            className="truncate font-mono text-sm font-semibold hover:text-cian"
          >
            {c.pista}
          </Link>
          <span className="text-xs text-tinta-tenue">
            {[
              c.modo === 'completa'
                ? 'Cuenta completa'
                : `${libres} de ${c.perfiles.length} libres`,
              c.plan,
              c.pais,
              c.facturaEn ? `cobro ${formatearDia(c.facturaEn)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        {c.estado === 'caida' && <Insignia tono="peligro">Caída</Insignia>}
        {c.estado === 'retirada' && <Insignia>Retirada</Insignia>}
      </div>
      <ul className="grid gap-1.5">
        {c.perfiles.map((p) => (
          <Perfil key={p.id} p={p} ahora={ahora} tenue={!coincide(p)} />
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link
          href={`/admin/cuentas/${c.id}`}
          className="inline-flex items-center gap-1.5 font-medium text-cian hover:underline"
        >
          <KeyRound className="size-3.5" aria-hidden /> Asignar, PIN y datos
        </Link>
        {verCodigos && (
          <Link
            href={`/admin/codigos?cuenta=${c.id}`}
            className="inline-flex items-center gap-1.5 font-medium text-cian hover:underline"
          >
            <MailSearch className="size-3.5" aria-hidden /> Ver código
          </Link>
        )}
      </div>
    </li>
  );
}

function Contador({ n, etiqueta, tono }: { n: number; etiqueta: string; tono?: string }) {
  return (
    <div className="grid gap-0.5 rounded-2xl border border-borde bg-white/[0.02] px-4 py-3">
      <span className={clsx('text-2xl font-bold tabular-nums', tono)}>{n}</span>
      <span className="text-xs text-tinta-suave">{etiqueta}</span>
    </div>
  );
}

/** Inventario como el del Gestor: todas las cuentas con sus perfiles, filtrables. */
export function InventarioCuentas({
  inventario,
  ahora,
  verCodigos,
}: {
  inventario: Inventario;
  ahora: number;
  verCodigos: boolean;
}) {
  const [servicio, setServicio] = useState<string>('todos');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [texto, setTexto] = useState('');

  const total = useMemo(() => {
    const t = { cuentas: 0, libres: 0, ocupados: 0, porVencer: 0, vencidos: 0, caidas: 0 };
    for (const s of inventario.servicios) {
      t.cuentas += s.conteo.cuentas;
      t.libres += s.conteo.libres;
      t.ocupados += s.conteo.ocupados;
      t.porVencer += s.conteo.porVencer;
      t.vencidos += s.conteo.vencidos;
      t.caidas += s.conteo.caidas;
    }
    return t;
  }, [inventario]);

  const busqueda = normalizar(texto.trim());
  const coincidePerfil = (c: CuentaInventario, p: PerfilInventario) => {
    if (filtro !== 'todos' && filtro !== 'caidas' && situacion(p, ahora) !== filtro) return false;
    if (!busqueda) return true;
    return [c.pista, p.nombre, p.nota ?? '', p.cliente?.nombre ?? '']
      .map(normalizar)
      .some((x) => x.includes(busqueda));
  };

  const grupos: { s: ServicioInventario; cuentas: CuentaInventario[] }[] = inventario.servicios
    .filter((s) => servicio === 'todos' || s.servicio.id === servicio)
    .map((s) => ({
      s,
      cuentas: s.cuentas.filter((c) =>
        filtro === 'caidas'
          ? c.estado === 'caida' && (!busqueda || c.perfiles.some((p) => coincidePerfil(c, p)))
          : c.perfiles.some((p) => coincidePerfil(c, p)),
      ),
    }))
    .filter((g) => g.cuentas.length > 0);

  if (inventario.servicios.length === 0) {
    return (
      <Tarjeta>
        <EstadoVacio
          icono={Boxes}
          titulo="Todavía no hay cuentas"
          accion={
            <Link href="/admin/cuentas" className="font-semibold text-cian hover:underline">
              Agregar o importar cuentas
            </Link>
          }
        >
          Agrega tus cuentas en «Cuentas de servicio» (una por una, desde la lista del proveedor o
          desde el Gestor viejo) y aquí verás todos sus perfiles.
        </EstadoVacio>
      </Tarjeta>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Contador n={total.cuentas} etiqueta="Cuentas" />
        <Contador n={total.libres} etiqueta="Perfiles libres" tono="text-exito" />
        <Contador n={total.ocupados} etiqueta="Perfiles ocupados" tono="text-acento" />
        <Contador n={total.porVencer} etiqueta="Vencen en 3 días" tono="text-aviso" />
        <Contador n={total.vencidos} etiqueta="Vencidos (liberar)" tono="text-peligro" />
        <Contador n={total.caidas} etiqueta="Cuentas caídas" tono="text-peligro" />
      </div>

      <Tarjeta className="grid gap-4 p-4 sm:p-5">
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          role="group"
          aria-label="Servicio"
        >
          {[
            { id: 'todos', nombre: 'Todos', libres: total.libres },
            ...inventario.servicios.map((s) => ({
              id: s.servicio.id,
              nombre: s.servicio.nombre,
              libres: s.conteo.libres,
            })),
          ].map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={servicio === x.id}
              onClick={() => setServicio(x.id)}
              className={clsx(
                'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                servicio === x.id
                  ? 'border-cian bg-acento-suave text-tinta'
                  : 'border-borde text-tinta-suave hover:border-borde-fuerte hover:text-tinta',
              )}
            >
              {x.nombre}
              <span className="rounded-full bg-exito-suave px-1.5 text-xs text-exito tabular-nums">
                {x.libres}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-60">
            <span className="sr-only">Buscar</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tinta-tenue"
              aria-hidden
            />
            <input
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
              placeholder="Cliente, correo, perfil o nota"
              className={clsx(clasesEntrada, 'pl-10')}
            />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estado">
            {FILTROS.map((f) => (
              <button
                key={f.clave}
                type="button"
                aria-pressed={filtro === f.clave}
                onClick={() => setFiltro(f.clave)}
                className={clsx(
                  'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
                  filtro === f.clave
                    ? 'border-cian bg-acento-suave text-tinta'
                    : 'border-borde text-tinta-suave hover:text-tinta',
                )}
              >
                {f.nombre}
              </button>
            ))}
          </div>
        </div>
      </Tarjeta>

      {grupos.length === 0 ? (
        <Tarjeta>
          <EstadoVacio icono={Search} titulo="Nada coincide">
            Prueba con otro filtro o búsqueda.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        grupos.map(({ s, cuentas }) => (
          <section
            key={s.servicio.id}
            className="grid gap-3"
            aria-labelledby={`srv-${s.servicio.id}`}
          >
            <header className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {s.servicio.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.servicio.logoUrl}
                  alt=""
                  className="size-8 rounded-lg object-contain"
                  loading="lazy"
                />
              )}
              <h2 id={`srv-${s.servicio.id}`} className="text-lg font-bold">
                {s.servicio.nombre}
              </h2>
              <p className="text-sm text-tinta-suave tabular-nums">
                {s.conteo.cuentas} {s.conteo.cuentas === 1 ? 'cuenta' : 'cuentas'} ·{' '}
                <span className="text-exito">{s.conteo.libres} libres</span> · {s.conteo.ocupados}{' '}
                ocupados
                {s.conteo.porVencer > 0 && (
                  <span className="text-aviso"> · {s.conteo.porVencer} por vencer</span>
                )}
                {s.conteo.vencidos > 0 && (
                  <span className="text-peligro"> · {s.conteo.vencidos} vencidos</span>
                )}
              </p>
            </header>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {cuentas.map((c) => (
                <TarjetaCuenta
                  key={c.id}
                  c={c}
                  ahora={ahora}
                  coincide={(p) => coincidePerfil(c, p)}
                  verCodigos={verCodigos}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
