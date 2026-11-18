'use client';

import {
  type ContactoPlataforma,
  type CredencialesCuenta,
  type CuentaServicioDetalle,
  esTitular,
  type PerfilCuentaPublico,
  type PlataformaCuentas,
  type ServicioInventario,
  TEXTOS_PLATAFORMA,
} from '@nv/shared';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  Copy,
  Eye,
  EyeOff,
  LayoutGrid,
  Mail,
  MailSearch,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { clasesEntrada } from '@/componentes/ui/clases';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { llamarApi } from '@/lib/api-cliente';
import { formatearFecha } from '@/lib/formato';
import { AgregarCliente, type LugarElegido, type PermisosAlta } from './agregar-cliente';
import { AccionesPerfil, ArmarMensaje, NuevaCuenta } from './cuentas';
import { AvisarDatos, Dialogo } from './cuentas-gestor';

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
export function GrillaPlataformas({
  servicios,
  actual,
  vista,
}: {
  servicios: ServicioInventario[];
  /** La plataforma abierta (se resalta). */
  actual?: string;
  /** Abrir cada plataforma en esta vista. */
  vista?: 'clientes';
}) {
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
              href={`/admin/plataformas/${s.servicio.id}${vista ? `?vista=${vista}` : ''}`}
              aria-current={actual === s.servicio.id ? 'page' : undefined}
              className={clsx(
                'flex items-center gap-3 rounded-2xl border bg-[rgb(10_14_32/0.55)] p-4 transition-colors hover:border-cian',
                actual === s.servicio.id ? 'border-marca' : 'border-borde',
              )}
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
  if (a.venceEn && new Date(a.venceEn).getTime() < ahora) return 'vencido';
  if (a.venceEn && new Date(a.venceEn).getTime() <= ahora + DIAS_POR_VENCER * DIA_MS) {
    return 'por_vencer';
  }
  return 'ocupado';
}

/** «dd/mm» de una fecha ISO o de un día «AAAA-MM-DD». */
const diaMes = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

function textoRelativo(iso: string, ahora: number): string {
  const dias = Math.ceil((new Date(iso).getTime() - ahora) / DIA_MS);
  if (dias < 0) return `venció hace ${-dias} ${-dias === 1 ? 'día' : 'días'}`;
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  return `en ${dias} días`;
}

const esIndividual = (c: CuentaServicioDetalle) => c.modo === 'completa' || c.perfiles.total === 1;

const vigentesDe = (c: CuentaServicioDetalle) =>
  c.listaPerfiles.filter(
    (x) => x.asignacion && ['activa', 'en_gracia'].includes(x.asignacion.estado),
  ).length;

export interface PermisosPlataforma {
  gestionar: boolean;
  revelar: boolean;
  codigos: boolean;
  /** «Agregar cliente» (sin permiso de crear suscripciones, undefined). */
  alta: PermisosAlta | undefined;
}

/** Cuando el texto del cliente se ve en la tarjeta y en la lista (contacto y responsable). */
function contactoTexto(c: ContactoPlataforma | undefined): string {
  if (!c) return '';
  return c.whatsapp ?? c.telegram ?? c.correo ?? '';
}

/** Correo completo y contraseña con puntos (ver y copiar), como en el Gestor. */
function DatosAcceso({
  cuenta,
  correo,
  puedeRevelar,
}: {
  cuenta: CuentaServicioDetalle;
  correo: string;
  puedeRevelar: boolean;
}) {
  const [clave, setClave] = useState<string | null>(null);
  const [ver, setVer] = useState(false);
  const [error, setError] = useState(false);
  const [copiado, setCopiado] = useState<'correo' | 'clave' | null>(null);

  async function traer(): Promise<string | null> {
    if (clave !== null) return clave;
    const r = await llamarApi<CredencialesCuenta>('POST', `/cuentas/${cuenta.id}/revelar`, {});
    if (!r.ok) {
      setError(true);
      return null;
    }
    setClave(r.datos.clave);
    return r.datos.clave;
  }

  async function copiar(que: 'correo' | 'clave') {
    const texto = que === 'correo' ? correo : await traer();
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(que);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      setCopiado(null);
    }
  }

  return (
    <div className="grid gap-1 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Mail className="size-4 shrink-0 text-marca" aria-hidden />
        <Link
          href={`/admin/cuentas/${cuenta.id}`}
          className="min-w-0 truncate font-mono font-semibold hover:text-cian"
          title={correo}
        >
          {correo}
        </Link>
        {puedeRevelar && (
          <button
            type="button"
            onClick={() => void copiar('correo')}
            aria-label={`Copiar el correo ${correo}`}
            className="rounded-md p-1 text-tinta-tenue hover:text-tinta"
          >
            {copiado === 'correo' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        )}
      </div>
      {puedeRevelar && (
        <div className="flex items-center gap-2 pl-6">
          <span className="min-w-0 truncate font-mono text-tinta-suave" aria-label="Contraseña">
            {ver && clave !== null ? clave : '••••••••'}
          </span>
          <button
            type="button"
            onClick={async () => {
              if (!ver && (await traer()) === null) return;
              setVer((v) => !v);
            }}
            aria-label={ver ? 'Ocultar la contraseña' : 'Ver la contraseña'}
            className="rounded-md p-1 text-tinta-tenue hover:text-tinta"
          >
            {ver ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => void copiar('clave')}
            aria-label="Copiar la contraseña"
            className="rounded-md p-1 text-tinta-tenue hover:text-tinta"
          >
            {copiado === 'clave' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
          {error && <span className="text-xs text-peligro">No se pudo ver</span>}
        </div>
      )}
    </div>
  );
}

/** Confirmación antes de marcar la cuenta caída o borrarla (retirarla). */
function CambiarEstadoCuenta({
  cuenta,
  correo,
  estado,
}: {
  cuenta: CuentaServicioDetalle;
  correo: string;
  estado: 'caida' | 'retirada' | 'activa';
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nombre = estado === 'caida' ? 'Caída' : estado === 'retirada' ? 'Borrar' : 'Reactivar';
  const Icono = estado === 'caida' ? AlertTriangle : estado === 'retirada' ? Trash2 : RefreshCw;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={clsx(
          'inline-flex items-center gap-1.5 font-medium',
          estado === 'retirada'
            ? 'text-peligro hover:brightness-125'
            : estado === 'caida'
              ? 'text-aviso hover:brightness-125'
              : 'hover:text-cian',
        )}
      >
        <Icono className="size-3.5" aria-hidden /> {nombre}
      </button>
      {abierto && (
        <Dialogo
          titulo={
            estado === 'caida'
              ? 'Marcar la cuenta como caída'
              : estado === 'retirada'
                ? 'Borrar la cuenta'
                : 'Reactivar la cuenta'
          }
          icono={<Icono className="size-5 text-aviso" aria-hidden="true" />}
          onCerrar={() => setAbierto(false)}
          bloquear={cargando}
        >
          <p className="text-sm">
            <span className="font-mono font-semibold">{correo}</span>
          </p>
          <p className="text-sm text-tinta-suave">
            {estado === 'caida'
              ? 'La cuenta deja de ofrecer lugares libres y aparece en Caídas para reponer a sus clientes. Puedes reactivarla después.'
              : estado === 'retirada'
                ? 'La cuenta sale de la plataforma y queda guardada como retirada en «Todas las cuentas» (no se borra el historial). Los perfiles deben estar libres.'
                : 'La cuenta vuelve a ofrecer sus lugares libres.'}
          </p>
          {error && <Alerta tono="peligro">{error}</Alerta>}
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)} disabled={cargando}>
              Cancelar
            </Boton>
            <Boton
              variante={estado === 'activa' ? 'primario' : 'peligro'}
              cargando={cargando}
              onClick={async () => {
                setCargando(true);
                setError(null);
                const r = await llamarApi('PATCH', `/cuentas/${cuenta.id}`, { estado });
                setCargando(false);
                if (!r.ok) {
                  setError(r.error.mensaje);
                  return;
                }
                setAbierto(false);
                router.refresh();
              }}
            >
              {nombre}
            </Boton>
          </div>
        </Dialogo>
      )}
    </>
  );
}

/** Un lugar de la cuenta: número, cliente, responsable y vencimiento. */
function Lugar({
  cuenta,
  correo,
  perfil,
  ahora,
  permisos,
  tipo,
  contacto,
  onAgregar,
}: {
  cuenta: CuentaServicioDetalle;
  correo: string;
  perfil: PerfilCuentaPublico;
  ahora: number;
  permisos: PermisosPlataforma;
  tipo: PlataformaCuentas['tipo'];
  contacto: ContactoPlataforma | undefined;
  onAgregar: (l: LugarElegido) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const s = situacion(perfil, ahora);
  const a = perfil.asignacion;
  const vigentes = vigentesDe(cuenta);
  const activa = Boolean(a && ['activa', 'en_gracia'].includes(a.estado));
  const libreParaAgregar =
    perfil.estado === 'libre' && cuenta.estado === 'activa' && Boolean(permisos.alta);
  const textos = TEXTOS_PLATAFORMA[tipo];
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        onClick={() =>
          libreParaAgregar
            ? onAgregar({ cuentaId: cuenta.id, perfilId: perfil.id })
            : setAbierto(true)
        }
        disabled={!permisos.gestionar && !libreParaAgregar}
        aria-label={`${textos.lugar} ${perfil.numero}: ${a ? a.cliente.nombre : ESTILO[s].texto}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-white/[0.04] disabled:cursor-default disabled:hover:bg-transparent"
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
            <>
              <span className={clsx('font-medium', s === 'vencido' && 'text-peligro')}>
                {a.cliente.nombre}
              </span>
              {contacto?.responsable && (
                <span className="ml-1.5 text-xs text-tinta-tenue">{contacto.responsable}</span>
              )}
            </>
          ) : perfil.estado === 'libre' ? (
            <span className="text-exito">
              Libre
              {libreParaAgregar && (
                <span className="ml-1.5 text-xs text-tinta-tenue opacity-0 group-hover:opacity-100">
                  + Agregar cliente
                </span>
              )}
            </span>
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
                  ? 'text-peligro line-through'
                  : 'text-tinta-suave',
            )}
          >
            {diaMes(a.venceEn)}
          </span>
        )}
      </button>
      {permisos.gestionar && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label={`Más acciones del ${textos.lugar.toLowerCase()} ${perfil.numero}`}
          className="rounded-lg p-1.5 text-tinta-tenue hover:bg-white/[0.04] hover:text-tinta"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
      )}
      {abierto && (
        <Dialogo
          titulo={`${textos.lugar} ${perfil.numero} · ${correo}`}
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
              {(contacto?.responsable || contactoTexto(contacto)) && (
                <span className="text-tinta-suave">
                  {[contactoTexto(contacto), contacto?.responsable].filter(Boolean).join(' · ')}
                </span>
              )}
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
            <div className="grid gap-2 text-sm text-tinta-suave">
              <p>
                {perfil.estado === 'libre'
                  ? `${textos.lugar} libre: agrega un cliente nuevo o asigna una suscripción que ya existe.`
                  : ESTILO[s].texto}
              </p>
              {libreParaAgregar && (
                <Boton
                  tamano="sm"
                  icono={<UserPlus className="size-4" />}
                  onClick={() => {
                    setAbierto(false);
                    onAgregar({ cuentaId: cuenta.id, perfilId: perfil.id });
                  }}
                >
                  Agregar cliente
                </Boton>
              )}
            </div>
          )}
          <AccionesPerfil
            cuentaId={cuenta.id}
            perfil={perfil}
            cuentaActiva={cuenta.estado === 'activa'}
            puedeRevelar={permisos.revelar}
            tipo={tipo}
            otrosActivos={Math.max(0, vigentes - (activa ? 1 : 0))}
          />
        </Dialogo>
      )}
    </li>
  );
}

function TarjetaCuenta({
  c,
  correo,
  ahora,
  permisos,
  datos,
  onAgregar,
}: {
  c: CuentaServicioDetalle;
  correo: string;
  ahora: number;
  permisos: PermisosPlataforma;
  datos: PlataformaCuentas;
  onAgregar: (l: LugarElegido) => void;
}) {
  const perfiles = c.listaPerfiles;
  const ocupados = perfiles.filter((p) => p.estado === 'asignado').length;
  const libres = perfiles.filter((p) => p.estado === 'libre').length;
  const vigentes = vigentesDe(c);
  const venceCuenta = c.facturaEn
    ? Math.ceil((new Date(`${c.facturaEn}T12:00:00Z`).getTime() - ahora) / DIA_MS)
    : null;
  return (
    <li
      className={clsx(
        'grid content-start gap-3 rounded-2xl border bg-[rgb(10_14_32/0.55)] p-4',
        c.estado === 'caida' ? 'border-peligro/60' : 'border-borde',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <DatosAcceso cuenta={c} correo={correo} puedeRevelar={permisos.revelar} />
        </div>
        {c.estado === 'caida' ? (
          <Insignia tono="peligro">Caída</Insignia>
        ) : c.estado === 'en_espera' ? (
          <Insignia tono="aviso">Sin anotar</Insignia>
        ) : c.facturaEn ? (
          <Insignia
            tono={
              venceCuenta !== null && venceCuenta < 0
                ? 'peligro'
                : venceCuenta !== null && venceCuenta <= 3
                  ? 'aviso'
                  : 'exito'
            }
          >
            Vence {diaMes(c.facturaEn)}
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
            correo={correo}
            perfil={p}
            ahora={ahora}
            permisos={permisos}
            tipo={datos.tipo}
            contacto={p.asignacion ? datos.clientes[p.asignacion.cliente.id] : undefined}
            onAgregar={onAgregar}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-borde pt-3 text-sm">
        <Link
          href={`/admin/cuentas/${c.id}`}
          className="inline-flex items-center gap-1.5 font-medium hover:text-cian"
        >
          <Pencil className="size-3.5" aria-hidden /> Editar
        </Link>
        <Link
          href={`/admin/cuentas/${c.id}#pagos`}
          className="inline-flex items-center gap-1.5 font-medium hover:text-cian"
          title="Anotar el pago al proveedor y la nueva fecha"
        >
          <RefreshCw className="size-3.5" aria-hidden /> Renovar
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
        {permisos.gestionar && (
          <span className="ml-auto flex gap-4">
            <CambiarEstadoCuenta
              cuenta={c}
              correo={correo}
              estado={c.estado === 'caida' ? 'activa' : 'caida'}
            />
            {ocupados === 0 && <CambiarEstadoCuenta cuenta={c} correo={correo} estado="retirada" />}
          </span>
        )}
      </div>
    </li>
  );
}

type Pestana = 'completas' | 'individuales';
type FiltroCuentas = 'todas' | 'libres' | 'llenas';
type FiltroClientes = 'todos' | 'activos' | 'por_vencer' | 'vencidos';
export type VistaPlataforma = 'cuentas' | 'clientes';

/** Una plataforma como en el Gestor: cuentas completas, individuales y la lista de clientes. */
export function PlataformaGestor({
  datos,
  ahora,
  permisos,
  vista: vistaInicial = 'cuentas',
  servicios,
  nuevaCuenta,
}: {
  datos: PlataformaCuentas;
  ahora: number;
  permisos: PermisosPlataforma;
  vista?: VistaPlataforma;
  /** Las demás plataformas, para la grilla de arriba de la vista Clientes. */
  servicios?: ServicioInventario[] | undefined;
  /** Puede crear cuentas de esta plataforma. */
  nuevaCuenta: boolean;
}) {
  const completas = datos.cuentas.filter((c) => !esIndividual(c));
  const individuales = datos.cuentas.filter(esIndividual);
  const [vista, setVista] = useState<VistaPlataforma>(vistaInicial);
  const [pestana, setPestana] = useState<Pestana>(
    completas.length === 0 && individuales.length > 0 ? 'individuales' : 'completas',
  );
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroCuentas>('todas');
  const [filtroClientes, setFiltroClientes] = useState<FiltroClientes>('todos');
  const [responsable, setResponsable] = useState('');
  const [orden, setOrden] = useState<'vence' | 'libres'>('vence');
  const [ordenClientes, setOrdenClientes] = useState<'vence' | 'nombre'>('vence');
  const [agregar, setAgregar] = useState<LugarElegido | 'nuevo' | null>(null);
  const correoDe = (c: CuentaServicioDetalle) => datos.correos?.[c.id] ?? c.pista;

  const lugares = datos.cuentas.flatMap((c) => c.listaPerfiles.map((p) => ({ c, p })));
  const clientes = lugares.filter(({ p }) => p.asignacion);
  const libres = lugares.filter(({ p }) => p.estado === 'libre').length;
  const porVencer = clientes.filter(({ p }) => situacion(p, ahora) === 'por_vencer').length;
  const vencidos = clientes.filter(({ p }) => situacion(p, ahora) === 'vencido').length;
  const responsables = [
    ...new Set(
      Object.values(datos.clientes)
        .map((x) => x.responsable)
        .filter((x): x is string => Boolean(x)),
    ),
  ].sort((a, b) => a.localeCompare(b, 'es'));
  const q = normalizar(busqueda.trim());
  const baseCuentas = pestana === 'individuales' ? individuales : completas;

  const cuentasVisibles = useMemo(() => {
    const lista = baseCuentas.filter((c) => {
      const l = c.listaPerfiles.filter((p) => p.estado === 'libre').length;
      if (filtro === 'libres' && l === 0) return false;
      if (filtro === 'llenas' && l > 0) return false;
      if (!q) return true;
      return [
        datos.correos?.[c.id] ?? c.pista,
        c.proveedor ?? '',
        c.notas ?? '',
        ...c.listaPerfiles.flatMap((p) => [
          p.nombre,
          p.nota ?? '',
          p.asignacion?.cliente.nombre ?? '',
          (p.asignacion && datos.clientes[p.asignacion.cliente.id]?.responsable) ?? '',
        ]),
      ].some((t) => normalizar(t).includes(q));
    });
    const libresDe = (c: CuentaServicioDetalle) =>
      c.listaPerfiles.filter((p) => p.estado === 'libre').length;
    return [...lista].sort((a, b) =>
      orden === 'libres'
        ? libresDe(b) - libresDe(a)
        : (a.facturaEn ?? '9999').localeCompare(b.facturaEn ?? '9999'),
    );
  }, [baseCuentas, filtro, q, orden, datos.correos, datos.clientes]);

  const clientesVisibles = useMemo(
    () =>
      clientes
        .filter(({ c, p }) => {
          const s = situacion(p, ahora);
          const contacto = datos.clientes[p.asignacion!.cliente.id];
          if (filtroClientes === 'activos' && s === 'vencido') return false;
          if (filtroClientes === 'por_vencer' && s !== 'por_vencer') return false;
          if (filtroClientes === 'vencidos' && s !== 'vencido') return false;
          if (responsable && contacto?.responsable !== responsable) return false;
          if (!q) return true;
          return [
            p.asignacion?.cliente.nombre ?? '',
            datos.correos?.[c.id] ?? c.pista,
            p.nombre,
            contacto?.responsable ?? '',
            contactoTexto(contacto),
          ].some((t) => normalizar(t).includes(q));
        })
        .sort((x, y) =>
          ordenClientes === 'nombre'
            ? x.p.asignacion!.cliente.nombre.localeCompare(y.p.asignacion!.cliente.nombre, 'es')
            : (x.p.asignacion?.venceEn ?? '9').localeCompare(y.p.asignacion?.venceEn ?? '9'),
        ),
    [clientes, filtroClientes, responsable, q, ahora, ordenClientes, datos.clientes, datos.correos],
  );

  const cuentaDe = (base: CuentaServicioDetalle[], f: FiltroCuentas) =>
    base.filter((c) => {
      const l = c.listaPerfiles.filter((p) => p.estado === 'libre').length;
      return f === 'todas' || (f === 'libres' ? l > 0 : l === 0);
    }).length;
  const totalLugares = baseCuentas.reduce((n, c) => n + c.listaPerfiles.length, 0);
  const ocupadosBase = baseCuentas.reduce(
    (n, c) => n + c.listaPerfiles.filter((p) => p.estado === 'asignado').length,
    0,
  );
  const libresBase = baseCuentas.reduce(
    (n, c) => n + c.listaPerfiles.filter((p) => p.estado === 'libre').length,
    0,
  );
  const textos = TEXTOS_PLATAFORMA[datos.tipo];

  return (
    <div className="grid gap-5">
      {vista === 'clientes' && servicios && servicios.length > 1 && (
        <GrillaPlataformas servicios={servicios} actual={datos.servicio.id} vista="clientes" />
      )}

      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-borde bg-[rgb(10_14_32/0.55)] p-4 sm:p-5">
        <Logo nombre={datos.servicio.nombre} url={datos.servicio.logoUrl} grande />
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="text-xl font-bold">{datos.servicio.nombre}</h2>
          {vista === 'clientes' ? (
            <p className="flex flex-wrap gap-x-3 text-sm text-tinta-suave">
              <span>
                <strong className="text-tinta">{clientes.length - vencidos}</strong> activos
              </span>
              <span className="text-aviso">
                <strong>{porVencer}</strong> por vencer
              </span>
              <span>
                <strong className="text-tinta">{datos.cuentas.length}</strong> cuentas
              </span>
            </p>
          ) : (
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
            </dl>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {vista === 'clientes' ? (
            <Boton
              variante="secundario"
              tamano="sm"
              icono={<LayoutGrid className="size-4" />}
              onClick={() => setVista('cuentas')}
            >
              Cuentas
            </Boton>
          ) : (
            <Boton
              variante="secundario"
              tamano="sm"
              icono={<Users className="size-4" />}
              onClick={() => setVista('clientes')}
            >
              Ver clientes
            </Boton>
          )}
          {vista === 'cuentas' && permisos.gestionar && (
            <BotonEnlace href="/admin/cuentas/reposicion" variante="secundario" tamano="sm">
              <ShieldCheck className="size-4" aria-hidden /> Respaldo
            </BotonEnlace>
          )}
          {permisos.alta && (
            <Boton
              tamano="sm"
              icono={<UserPlus className="size-4" />}
              onClick={() => setAgregar('nuevo')}
            >
              Agregar cliente
            </Boton>
          )}
        </div>
      </section>

      {vista === 'cuentas' && (
        <div
          role="tablist"
          aria-label="Cuentas"
          className="flex flex-wrap gap-1 border-b border-borde"
        >
          {(
            [
              ['completas', 'Cuentas completas', completas.length],
              ['individuales', 'Cuentas individuales', individuales.length],
            ] as const
          ).map(([clave, nombre, n]) => (
            <button
              key={clave}
              type="button"
              role="tab"
              aria-selected={pestana === clave}
              onClick={() => {
                setPestana(clave);
                setFiltro('todas');
              }}
              className={clsx(
                '-mb-px border-b-2 px-3 py-2 text-sm font-semibold',
                pestana === clave
                  ? 'border-marca text-marca'
                  : 'border-transparent text-tinta-suave hover:text-tinta',
              )}
            >
              {nombre} <span className="ml-1 text-xs tabular-nums opacity-70">{n}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3">
        <div className="flex flex-wrap items-start gap-2">
          <label className="relative min-w-0 flex-1">
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
                vista === 'clientes'
                  ? 'Buscar cliente, contacto, responsable o correo'
                  : 'Buscar por correo, cliente, responsable o nota'
              }
              className={clsx(clasesEntrada, 'pl-10')}
            />
          </label>
          {vista === 'cuentas' && nuevaCuenta && (
            <NuevaCuenta
              servicios={[datos.servicio]}
              servicioFijo={datos.servicio}
              modoInicial={pestana === 'individuales' ? 'completa' : 'perfiles'}
              etiqueta={
                pestana === 'individuales' ? 'Agregar cuenta individual' : 'Agregar cuenta completa'
              }
            />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtro">
            {vista === 'clientes'
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
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {vista === 'clientes' && responsables.length > 0 && (
              <label className="inline-flex items-center gap-2">
                <span className="sr-only">Responsable</span>
                <select
                  value={responsable}
                  onChange={(e) => setResponsable(e.currentTarget.value)}
                  className="h-9 rounded-xl border border-borde bg-hundida px-2 text-sm"
                >
                  <option value="">Todos los responsables</option>
                  {responsables.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="inline-flex items-center gap-2">
              <ArrowUpDown className="size-4 text-tinta-tenue" aria-hidden />
              <span className="sr-only">Orden</span>
              {vista === 'clientes' ? (
                <select
                  value={ordenClientes}
                  onChange={(e) => setOrdenClientes(e.currentTarget.value as 'vence' | 'nombre')}
                  className="h-9 rounded-xl border border-borde bg-hundida px-2 text-sm"
                >
                  <option value="vence">Vence primero</option>
                  <option value="nombre">Nombre A–Z</option>
                </select>
              ) : (
                <select
                  value={orden}
                  onChange={(e) => setOrden(e.currentTarget.value as 'vence' | 'libres')}
                  className="h-9 rounded-xl border border-borde bg-hundida px-2 text-sm"
                >
                  <option value="vence">Vence primero</option>
                  <option value="libres">Más libres</option>
                </select>
              )}
            </label>
          </div>
        </div>
        {vista === 'cuentas' && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-tinta-suave">
            <p>
              {cuentasVisibles.length} {cuentasVisibles.length === 1 ? 'cuenta' : 'cuentas'} ·{' '}
              {ocupadosBase}/{totalLugares} {textos.lugares.toLowerCase()} ·{' '}
              <span className="text-exito">{libresBase} libres</span>
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Colores">
              {LEYENDA.map((s) => (
                <li key={s} className="inline-flex items-center gap-1.5">
                  <span className={clsx('size-2.5 rounded-sm', ESTILO[s].barra)} aria-hidden />
                  {ESTILO[s].texto}
                </li>
              ))}
              <li className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm border border-peligro" aria-hidden />
                Caída
              </li>
            </ul>
          </div>
        )}
      </div>

      {vista === 'clientes' ? (
        clientesVisibles.length === 0 ? (
          <EstadoVacio icono={Users} titulo="No hay clientes con ese filtro" />
        ) : (
          <ul className="grid gap-2">
            {clientesVisibles.map(({ c, p }) => (
              <FilaCliente
                key={p.id}
                cuenta={c}
                correo={correoDe(c)}
                perfil={p}
                situacion={situacion(p, ahora)}
                ahora={ahora}
                permisos={permisos}
                tipo={datos.tipo}
                contacto={datos.clientes[p.asignacion!.cliente.id]}
              />
            ))}
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
            <TarjetaCuenta
              key={c.id}
              c={c}
              correo={correoDe(c)}
              ahora={ahora}
              permisos={permisos}
              datos={datos}
              onAgregar={setAgregar}
            />
          ))}
        </ul>
      )}

      {agregar && permisos.alta && (
        <AgregarCliente
          datos={datos}
          permisos={permisos.alta}
          inicial={agregar === 'nuevo' ? undefined : agregar}
          onCerrar={() => setAgregar(null)}
        />
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

/** Un cliente de la plataforma: contacto, responsable, dónde está, cuándo vence y sus acciones. */
function FilaCliente({
  cuenta,
  correo,
  perfil,
  situacion: s,
  ahora,
  permisos,
  tipo,
  contacto,
}: {
  cuenta: CuentaServicioDetalle;
  correo: string;
  perfil: PerfilCuentaPublico;
  situacion: Situacion;
  ahora: number;
  permisos: PermisosPlataforma;
  tipo: PlataformaCuentas['tipo'];
  contacto: ContactoPlataforma | undefined;
}) {
  const [mas, setMas] = useState(false);
  const a = perfil.asignacion!;
  const nombre = a.cliente.nombre;
  const textos = TEXTOS_PLATAFORMA[tipo];
  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]!.toUpperCase())
    .join('');
  const lugar = esIndividual(cuenta)
    ? 'Individual'
    : `${textos.lugar} ${perfil.numero}${esTitular(tipo, perfil.numero) ? ' (titular)' : ''}`;
  const detalle = [contactoTexto(contacto), contacto?.responsable, correo, lugar].filter(Boolean);
  return (
    <li
      className={clsx(
        'flex flex-wrap items-center gap-3 rounded-2xl border border-l-4 border-borde bg-[rgb(10_14_32/0.55)] p-3',
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
        <span className="truncate text-xs text-tinta-suave">{detalle.join(' · ')}</span>
      </div>
      {a.venceEn && (
        <span className="grid text-right">
          <span
            className={clsx(
              'font-mono text-sm tabular-nums',
              s === 'vencido' && 'text-peligro line-through',
            )}
          >
            {formatearFecha(a.venceEn)}
          </span>
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
        {permisos.revelar && cuenta.estado === 'activa' && (
          <ArmarMensaje cuentaId={cuenta.id} perfil={perfil} />
        )}
        <Link
          href={`/admin/suscripciones/${a.suscripcionId}`}
          className="inline-flex items-center gap-1 hover:text-cian"
        >
          <RefreshCw className="size-3.5" aria-hidden /> Renovar
        </Link>
        <Link
          href={`/admin/clientes/${a.cliente.id}`}
          className="inline-flex items-center gap-1 hover:text-cian"
        >
          <Pencil className="size-3.5" aria-hidden /> Editar
        </Link>
        {permisos.gestionar && (
          <button
            type="button"
            onClick={() => setMas(true)}
            aria-label={`Más acciones de ${nombre}`}
            className="rounded-lg p-1 text-tinta-tenue hover:text-tinta"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {mas && (
        <Dialogo
          titulo={`${nombre} · ${lugar}`}
          icono={<Users className="size-5 text-marca" aria-hidden="true" />}
          onCerrar={() => setMas(false)}
        >
          <p className="text-sm text-tinta-suave">
            Mover a otra cuenta, cortar el {textos.lugar.toLowerCase()} o editarlo.
          </p>
          <AccionesPerfil
            cuentaId={cuenta.id}
            perfil={perfil}
            cuentaActiva={cuenta.estado === 'activa'}
            puedeRevelar={permisos.revelar}
            tipo={tipo}
            otrosActivos={Math.max(0, vigentesDe(cuenta) - 1)}
          />
        </Dialogo>
      )}
    </li>
  );
}
