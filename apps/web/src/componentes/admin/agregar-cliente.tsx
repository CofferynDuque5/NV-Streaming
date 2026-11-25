'use client';

import {
  type ClienteResumen,
  contratoServicio,
  type CredencialesCuenta,
  type CuentaServicioDetalle,
  cuentaVigente,
  esTitular,
  fechaContrato,
  formatearMonto,
  generarClave,
  MESES_ALTA,
  type MetodoCobroPublico,
  type Moneda,
  MONEDAS,
  type PerfilCuentaPublico,
  type PlanPublico,
  type PlataformaCuentas,
  recomendarLugar,
  type ResultadoAltaPerfil,
  TEXTOS_PLATAFORMA,
} from '@nv/shared';
import clsx from 'clsx';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Layers,
  Mail,
  MessageCircle,
  Monitor,
  Pencil,
  Plus,
  Save,
  Send,
  Star,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { Dialogo } from './cuentas-gestor';

/** Modo de subir al cliente, como en el Gestor (depende del tipo de plataforma). */
type Modo = 'perfil' | 'individual' | 'alquiler' | 'plan' | 'correo_cliente';
type Canal = 'whatsapp' | 'telegram' | 'correo';

/** Como en el Gestor: con el responsable «Cliente» y sin número, los cobros van a este WhatsApp. */
const WHATSAPP_VENTA_DIRECTA = '584225200631';

interface ContactoResponsable {
  responsable: string;
  whatsapp: string | null;
  telegram: string | null;
}
const PASOS = ['Cuenta', 'Cliente', 'Plazo y precio', 'Contrato'] as const;

export interface LugarElegido {
  cuentaId: string;
  perfilId: string;
}

export interface PermisosAlta {
  cobrar: boolean;
  crearCliente: boolean;
  revelar: boolean;
  /** Puede crear cuentas (modo «Correo del cliente»). */
  crearCuenta: boolean;
}

const esIndividual = (c: CuentaServicioDetalle) => c.modo === 'completa' || c.perfiles.total === 1;

/** «AAAA-MM-DD» más n meses (sin pasar del último día del mes). */
export function sumarMeses(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number];
  const base = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, ultimo));
  return base.toISOString().slice(0, 10);
}

const diasEntre = (desde: string, hasta: string) =>
  Math.round(
    (new Date(`${hasta}T12:00:00Z`).getTime() - new Date(`${desde}T12:00:00Z`).getTime()) /
      86_400_000,
  );

const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

const fechaLarga = (dia: string) =>
  new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${dia}T12:00:00Z`));

/** Precio de un mes del plan (los planes de días se pasan a 30 días). */
function precioMes(plan: PlanPublico, moneda: Moneda): string {
  const p = plan.precios[moneda]?.precio ?? (moneda === 'USD' ? plan.precioUsd : null);
  if (!p) return '';
  const meses = plan.duracionUnidad === 'mes' ? plan.duracionCantidad : plan.duracionCantidad / 30;
  return (Number(p) / Math.max(meses, 1 / 30)).toFixed(2);
}

const hoyCaracas = () =>
  new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone: 'America/Caracas' }).format(
    new Date(),
  );

/** Los modos que ofrece cada tipo de plataforma, con su nombre en el Gestor. */
const MODOS: Record<PlataformaCuentas['tipo'], { modo: Modo; nombre: string }[]> = {
  perfiles: [
    { modo: 'perfil', nombre: 'Perfil' },
    { modo: 'individual', nombre: 'Individual' },
  ],
  familiar: [
    { modo: 'alquiler', nombre: 'Correo de alquiler' },
    { modo: 'plan', nombre: 'Unido a un plan' },
    { modo: 'correo_cliente', nombre: 'Correo del cliente' },
  ],
  correo: [
    { modo: 'alquiler', nombre: 'Cuenta de alquiler' },
    { modo: 'correo_cliente', nombre: 'Correo del cliente' },
  ],
};

interface Libre {
  cuenta: CuentaServicioDetalle;
  perfil: PerfilCuentaPublico;
  cuentaId: string;
  perfilId: string;
  facturaEn: string | null;
}

/** Qué lugares libres sirven para cada modo. */
function libresDe(datos: PlataformaCuentas, modo: Modo, hoy: string): Libre[] {
  const lista: Libre[] = [];
  for (const c of datos.cuentas) {
    // Ni caídas ni vencidas (ni sin fecha): no se le da a un cliente una cuenta que no sirve.
    if (!cuentaVigente(c, hoy)) continue;
    const individual = esIndividual(c);
    for (const p of c.listaPerfiles) {
      if (p.estado !== 'libre') continue;
      const titular = esTitular(datos.tipo, p.numero);
      const sirve =
        modo === 'perfil'
          ? !individual
          : modo === 'individual'
            ? individual
            : modo === 'alquiler'
              ? datos.tipo === 'correo' || individual || titular
              : modo === 'plan'
                ? !individual && !titular
                : false;
      if (sirve) {
        lista.push({
          cuenta: c,
          perfil: p,
          cuentaId: c.id,
          perfilId: p.id,
          facturaEn: c.facturaEn,
        });
      }
    }
  }
  return lista;
}

/**
 * «Agregar cliente» como en el Gestor: 1 Cuenta (dónde va, con la cuenta
 * recomendada), 2 Cliente, 3 Plazo y precio, y 4 el contrato listo para
 * copiar o enviar por WhatsApp. A la derecha se ve en vivo cómo queda el contrato.
 */
export function AgregarCliente({
  datos,
  permisos,
  inicial,
  onCerrar,
}: {
  datos: PlataformaCuentas;
  permisos: PermisosAlta;
  inicial?: LugarElegido | undefined;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const servicio = datos.servicio;
  const textos = TEXTOS_PLATAFORMA[datos.tipo];
  const modos = MODOS[datos.tipo].filter(
    (m) => m.modo !== 'correo_cliente' || permisos.crearCuenta,
  );
  const [hoy] = useState(hoyCaracas);

  const modoInicial = (): Modo => {
    if (inicial) {
      const c = datos.cuentas.find((x) => x.id === inicial.cuentaId);
      const p = c?.listaPerfiles.find((x) => x.id === inicial.perfilId);
      if (c && p) {
        if (datos.tipo === 'perfiles') return esIndividual(c) ? 'individual' : 'perfil';
        if (datos.tipo === 'familiar' && !esIndividual(c) && !esTitular('familiar', p.numero)) {
          return 'plan';
        }
        return 'alquiler';
      }
    }
    return modos[0]!.modo;
  };

  const [paso, setPaso] = useState(inicial && modoInicial() !== 'plan' ? 1 : 0);
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [lugar, setLugar] = useState<LugarElegido | null>(inicial ?? null);
  const [abiertas, setAbiertas] = useState<Set<string>>(
    () => new Set(inicial ? [inicial.cuentaId] : []),
  );
  const [credenciales, setCredenciales] = useState<Record<string, CredencialesCuenta>>({});
  const [usuarioMiembro, setUsuarioMiembro] = useState('');
  const [claveMiembro, setClaveMiembro] = useState('');
  const [correoCliente, setCorreoCliente] = useState('');
  const [claveCliente, setClaveCliente] = useState('');
  // Paso 2
  const [existente, setExistente] = useState<ClienteResumen | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [encontrados, setEncontrados] = useState<ClienteResumen[] | null>(null);
  const [nombre, setNombre] = useState('');
  const [responsable, setResponsable] = useState('');
  const [responsables, setResponsables] = useState<string[]>([]);
  const [contactosResponsables, setContactosResponsables] = useState<ContactoResponsable[]>([]);
  // El contacto que se llenó solo al escribir el responsable (se cambia si cambia el responsable).
  const [contactoAuto, setContactoAuto] = useState<string | null>(null);
  const [canal, setCanal] = useState<Canal>('whatsapp');
  const [contacto, setContacto] = useState('');
  const [extras, setExtras] = useState<{ canal: Canal; valor: string }[]>([]);
  const [aceptaWhatsapp, setAceptaWhatsapp] = useState(true);
  // Paso 3
  const [planes, setPlanes] = useState<PlanPublico[] | null>(null);
  const [metodos, setMetodos] = useState<MetodoCobroPublico[]>([]);
  const [planId, setPlanId] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [precio, setPrecio] = useState('');
  const [plazo, setPlazo] = useState<number | 'fecha'>(1);
  const [fecha, setFecha] = useState('');
  const [metodoId, setMetodoId] = useState('');
  // Final
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [contrato, setContrato] = useState('');
  const [editandoTexto, setEditandoTexto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const campos = erroresPorCampo(error);

  const plan = planes?.find((p) => p.id === planId) ?? null;
  const vence = plazo === 'fecha' ? fecha : sumarMeses(hoy, plazo);
  const meses = plazo === 'fecha' ? 1 : plazo;
  const total = Number(precio || 0) * meses;
  const libres = useMemo(() => libresDe(datos, modo, hoy), [datos, modo, hoy]);
  const recomendado = recomendarLugar(libres, sumarMeses(hoy, 1));
  const cuentaElegida = lugar ? datos.cuentas.find((c) => c.id === lugar.cuentaId) : undefined;
  const perfilElegido = cuentaElegida?.listaPerfiles.find((p) => p.id === lugar?.perfilId);
  const cred = lugar ? credenciales[lugar.cuentaId] : undefined;
  const credPerfil = cred?.perfiles.find((p) => p.numero === perfilElegido?.numero);
  const correoCuenta = (c: CuentaServicioDetalle) => datos.correos?.[c.id] ?? c.pista;

  useEffect(() => {
    void (async () => {
      const [rp, rm, rr] = await Promise.all([
        llamarApi<PlanPublico[]>('GET', `/catalogo/planes?servicioId=${servicio.id}`),
        permisos.cobrar
          ? llamarApi<MetodoCobroPublico[]>('GET', '/pagos/metodos')
          : Promise.resolve(null),
        llamarApi<string[]>('GET', '/clientes/responsables'),
      ]);
      void llamarApi<ContactoResponsable[]>('GET', '/clientes/responsables/contactos').then((r) => {
        if (r.ok) setContactosResponsables(r.datos);
      });
      const lista = rp.ok ? rp.datos.filter((p) => p.activo && p.tipo === 'suscripcion') : [];
      setPlanes(lista);
      if (lista[0]) {
        setPlanId(lista[0].id);
        setPrecio(precioMes(lista[0], 'USD'));
      }
      if (rm?.ok) setMetodos(rm.datos);
      if (rr.ok) setResponsables(rr.datos);
    })();
  }, [servicio.id, permisos.cobrar]);

  // Los datos de la cuenta elegida (clave y PIN) para el contrato: quedan en la auditoría.
  useEffect(() => {
    if (!lugar || !permisos.revelar || credenciales[lugar.cuentaId]) return;
    const id = lugar.cuentaId;
    void llamarApi<CredencialesCuenta>('POST', `/cuentas/${id}/revelar`, {}).then((r) => {
      if (r.ok) setCredenciales((x) => ({ ...x, [id]: r.datos }));
    });
  }, [lugar, permisos.revelar, credenciales]);

  /* ─────────── El contrato en vivo ─────────── */
  const nombreCliente = existente?.nombre ?? nombre.trim();
  const datosContrato = (() => {
    if (modo === 'correo_cliente') {
      return { correo: correoCliente.trim(), clave: claveCliente, perfil: '', pin: '' };
    }
    if (!cuentaElegida || !perfilElegido) return { correo: '', clave: '', perfil: '', pin: '' };
    if (modo === 'plan') {
      return { correo: usuarioMiembro.trim(), clave: claveMiembro, perfil: '', pin: '' };
    }
    return {
      correo: cred?.usuario ?? datos.correos?.[cuentaElegida.id] ?? '',
      clave: cred?.clave ?? '',
      perfil: modo === 'perfil' ? nombreCliente : '',
      pin: textos.usaPin ? (credPerfil?.pin ?? '') : '',
    };
  })();
  const vistaContrato = contratoServicio({
    servicio: servicio.nombre,
    ...datosContrato,
    vence: vence ? fechaContrato(vence) : '',
  });

  /* ─────────── Validaciones por paso ─────────── */
  function faltaEnPaso(): string | null {
    if (paso === 0) {
      if (modo === 'correo_cliente') {
        return /^\S+@\S+\.\S+$/.test(correoCliente.trim())
          ? null
          : 'Escribe el correo del cliente.';
      }
      if (!lugar) return `Elige un ${textos.lugar.toLowerCase()} libre.`;
      if (modo === 'plan') {
        if (!usuarioMiembro.trim()) return 'Escribe el correo del miembro.';
        if (!claveMiembro) return 'Escribe la contraseña del miembro.';
        if (cred && usuarioMiembro.trim().toLowerCase() === cred.usuario.toLowerCase()) {
          return 'El correo del miembro debe ser distinto al de la cuenta.';
        }
      }
    }
    if (paso === 1) {
      if (existente) return null;
      if (!permisos.crearCliente) return 'Busca al cliente: tu rol no crea clientes nuevos.';
      if (nombre.trim().length < 2) return 'Escribe el nombre del cliente.';
      if (!contacto.trim()) {
        return canal === 'whatsapp'
          ? 'Escribe el número de WhatsApp.'
          : canal === 'telegram'
            ? 'Escribe el usuario de Telegram.'
            : 'Escribe el correo del cliente.';
      }
    }
    if (paso === 2) {
      if (!planId) return 'Este servicio no tiene planes: crea uno en el catálogo.';
      if (plazo === 'fecha' && (!fecha || fecha <= hoy)) return 'Elige una fecha futura.';
    }
    return null;
  }
  const falta = faltaEnPaso();

  function elegirLugar(l: Libre) {
    setLugar({ cuentaId: l.cuentaId, perfilId: l.perfilId });
    setError(null);
    // Como en el Gestor: al tocar el perfil libre se pasa solo al paso 2 (salvo «Unido a un plan»).
    if (modo !== 'plan') setPaso(1);
  }

  function cambiarModo(m: Modo) {
    setModo(m);
    setLugar(null);
    setError(null);
  }

  async function buscarClientes(texto: string) {
    const q = new URLSearchParams({ porPagina: '8' });
    if (texto.trim()) q.set('busqueda', texto.trim());
    const r = await llamarApi<{ elementos: ClienteResumen[] }>('GET', `/clientes?${q}`);
    setEncontrados(r.ok ? r.datos.elementos : []);
  }

  /** Al escribir el responsable se llena su número (si el contacto está vacío o lo llenamos antes). */
  function cambiarResponsable(valor: string) {
    setResponsable(valor);
    const clave = valor.trim().toLowerCase();
    const c = contactosResponsables.find((x) => x.responsable.toLowerCase() === clave);
    const sugerido: { canal: Canal; valor: string } | null =
      clave === 'cliente'
        ? { canal: 'whatsapp', valor: WHATSAPP_VENTA_DIRECTA }
        : c?.whatsapp
          ? { canal: 'whatsapp', valor: c.whatsapp }
          : c?.telegram
            ? { canal: 'telegram', valor: c.telegram }
            : null;
    const libre = !contacto.trim() || contacto === contactoAuto;
    if (!libre) return;
    if (sugerido) {
      setCanal(sugerido.canal);
      setContacto(sugerido.valor);
      setContactoAuto(sugerido.valor);
    } else if (contactoAuto) {
      setContacto('');
      setContactoAuto(null);
    }
  }

  function contactoNuevo() {
    const escritos = [{ canal, valor: contacto.trim() }, ...extras].filter((x) => x.valor);
    // Responsable «Cliente» sin número ni Telegram: el WhatsApp de venta directa.
    const todos =
      responsable.trim().toLowerCase() === 'cliente' &&
      !escritos.some((x) => x.canal === 'whatsapp' || x.canal === 'telegram')
        ? [...escritos, { canal: 'whatsapp' as Canal, valor: WHATSAPP_VENTA_DIRECTA }]
        : escritos;
    const de = (k: Canal) => todos.find((x) => x.canal === k)?.valor;
    const whatsapp = de('whatsapp');
    const telegram = de('telegram');
    const correo = de('correo');
    return {
      ...(whatsapp ? { whatsapp, aceptaWhatsapp } : {}),
      ...(telegram ? { telegram } : {}),
      ...(correo ? { correo } : {}),
    };
  }

  async function guardar() {
    setCargando(true);
    setError(null);
    let destino = lugar;
    // «Correo del cliente»: se crea una cuenta individual con el correo del propio cliente.
    if (modo === 'correo_cliente') {
      const rc = await llamarApi<CuentaServicioDetalle>('POST', '/cuentas', {
        servicioId: servicio.id,
        usuario: correoCliente.trim(),
        clave: claveCliente || generarClave(16),
        modo: 'completa',
        perfiles: 1,
        proveedor: 'Correo del cliente',
        notas: 'Activación en el correo del cliente (no se le paga a un proveedor).',
      });
      if (!rc.ok) {
        setCargando(false);
        setError(rc.error);
        setPaso(0);
        return;
      }
      destino = { cuentaId: rc.datos.id, perfilId: rc.datos.listaPerfiles[0]!.id };
      setLugar(destino);
    }
    if (!destino) {
      setCargando(false);
      setPaso(0);
      return;
    }
    const r = await llamarApi<ResultadoAltaPerfil>(
      'POST',
      `/cuentas/${destino.cuentaId}/perfiles/${destino.perfilId}/alta`,
      {
        ...(existente
          ? { clienteId: existente.id }
          : {
              clienteNuevo: {
                nombre: nombre.trim(),
                ...(responsable.trim() ? { responsable: responsable.trim() } : {}),
                ...contactoNuevo(),
              },
            }),
        planId,
        ...(plazo === 'fecha' ? { vence: fecha } : { meses: plazo }),
        precio: plazo === 'fecha' ? (Number(precio || 0) || 0).toFixed(2) : precio || '0',
        moneda,
        ...(metodoId ? { metodoCobroId: metodoId } : {}),
        ...(modo === 'plan' ? { usuarioMiembro: usuarioMiembro.trim(), claveMiembro } : {}),
      },
    );
    setCargando(false);
    if (!r.ok) {
      setError(r.error);
      const c = Object.keys(r.error.campos ?? {});
      if (c.some((k) => k.startsWith('clienteNuevo') || k === 'clienteId')) setPaso(1);
      else if (c.some((k) => k.includes('Miembro'))) setPaso(0);
      return;
    }
    setContrato(vistaContrato);
    setPaso(3);
    router.refresh();
  }

  function agregarOtro() {
    setPaso(0);
    setLugar(null);
    setExistente(null);
    setNombre('');
    setContacto('');
    setExtras([]);
    setUsuarioMiembro('');
    setClaveMiembro('');
    setCorreoCliente('');
    setClaveCliente('');
    setMetodoId('');
    setContrato('');
    setEditandoTexto(false);
    setError(null);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(contrato);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  const whatsappDestino = existente
    ? null
    : [{ canal, valor: contacto }, ...extras].find((x) => x.canal === 'whatsapp' && x.valor.trim())
        ?.valor;
  const enlaceWhatsapp = `https://wa.me/${(whatsappDestino ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(contrato)}`;

  const tituloLugar =
    modo === 'correo_cliente'
      ? `${servicio.nombre} · Correo del cliente`
      : cuentaElegida && perfilElegido
        ? `${servicio.nombre} · ${textos.lugar} ${perfilElegido.numero} de ${cuentaElegida.listaPerfiles.length}${cuentaElegida.plan ? ` · ${cuentaElegida.plan}` : ''}`
        : servicio.nombre;

  const metodosMoneda = metodos.filter((m) => m.moneda === moneda);
  const monedas = plan ? MONEDAS.filter((m) => plan.precios[m] || m === 'USD') : ['USD' as Moneda];
  const precioSiempre = plan ? precioMes(plan, moneda) : '';
  const cuentaAntes = Boolean(
    modo !== 'correo_cliente' &&
    cuentaElegida?.facturaEn &&
    vence &&
    cuentaElegida.facturaEn < vence,
  );

  return (
    <Dialogo
      titulo={`Agregar cliente — ${servicio.nombre}`}
      icono={<UserPlus className="size-5 text-marca" aria-hidden="true" />}
      onCerrar={onCerrar}
      bloquear={cargando}
      ancho="max-w-5xl"
    >
      <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Pasos">
        {PASOS.map((t, i) => (
          <li key={t} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-borde" aria-hidden />}
            <span
              aria-current={i === paso ? 'step' : undefined}
              className={clsx(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1',
                i === paso ? 'border-marca bg-marca/10 font-semibold' : 'border-transparent',
                i > paso && 'text-tinta-tenue',
              )}
            >
              <span
                className={clsx(
                  'grid size-5 place-items-center rounded-full text-xs',
                  i < paso || paso === 3 ? 'bg-marca text-white' : 'border border-current',
                )}
                aria-hidden
              >
                {i < paso || paso === 3 ? <Check className="size-3" /> : i + 1}
              </span>
              {t}
            </span>
          </li>
        ))}
      </ol>

      {paso === 3 ? (
        <div className="grid gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full border-2 border-exito text-exito">
              <Check className="size-6" aria-hidden />
            </span>
            <div>
              <p className="text-lg font-semibold">Cliente agregado</p>
              <p className="text-sm text-tinta-suave">
                {nombreCliente} · {tituloLugar}
              </p>
            </div>
          </div>
          <div className="grid gap-2 rounded-2xl border border-borde">
            <div className="flex items-center justify-between border-b border-borde px-4 py-2 text-sm">
              <span className="font-semibold">Contrato</span>
              <button
                type="button"
                onClick={() => setEditandoTexto((v) => !v)}
                className="inline-flex items-center gap-1 text-marca hover:underline"
              >
                <Pencil className="size-3.5" aria-hidden />
                {editandoTexto ? 'Listo' : 'Editar texto'}
              </button>
            </div>
            <textarea
              aria-label="Contrato"
              value={contrato}
              readOnly={!editandoTexto}
              onChange={(e) => setContrato(e.currentTarget.value)}
              rows={14}
              className="w-full resize-y bg-transparent px-4 pb-3 font-mono text-sm outline-none"
            />
          </div>
          {!permisos.revelar && (
            <Alerta tono="aviso">
              Tu rol no puede ver las claves: completa la contraseña y el PIN en el texto antes de
              enviarlo.
            </Alerta>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Boton variante="secundario" icono={<X className="size-4" />} onClick={onCerrar}>
                Cerrar
              </Boton>
              <Boton
                variante="secundario"
                icono={<Plus className="size-4" />}
                onClick={agregarOtro}
              >
                Agregar otro
              </Boton>
            </div>
            <div className="flex gap-2">
              <Boton
                variante="secundario"
                icono={copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
                onClick={() => void copiar()}
              >
                {copiado ? 'Copiado' : 'Copiar'}
              </Boton>
              {whatsappDestino && (
                <a
                  href={enlaceWhatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-[0.875rem] bg-[#1fa855] px-5 text-sm font-semibold text-white hover:brightness-110"
                >
                  <MessageCircle className="size-4" aria-hidden /> Enviar por WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid content-start gap-4">
            {paso === 0 && (
              <>
                <div>
                  <h3 className="text-lg font-semibold">¿Dónde va el cliente?</h3>
                  <p className="text-sm text-tinta-suave">
                    {datos.tipo === 'perfiles'
                      ? 'Elige un perfil libre o una cuenta individual.'
                      : datos.tipo === 'familiar'
                        ? 'Alquila la cuenta, únelo a un plan con su propio correo o actívalo en su correo.'
                        : 'Usa una cuenta de alquiler o actívalo en el correo del cliente.'}
                  </p>
                </div>
                <div
                  role="radiogroup"
                  aria-label="Tipo de lugar"
                  className="grid gap-1 rounded-2xl border border-borde bg-hundida p-1"
                  style={{ gridTemplateColumns: `repeat(${modos.length}, minmax(0, 1fr))` }}
                >
                  {modos.map((m) => {
                    const n =
                      m.modo === 'correo_cliente' ? null : libresDe(datos, m.modo, hoy).length;
                    return (
                      <button
                        key={m.modo}
                        type="button"
                        role="radio"
                        aria-checked={modo === m.modo}
                        onClick={() => cambiarModo(m.modo)}
                        className={clsx(
                          'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm',
                          modo === m.modo
                            ? 'border border-marca bg-elevada font-semibold'
                            : 'text-tinta-suave hover:text-tinta',
                        )}
                      >
                        {m.modo === 'perfil' ? (
                          <Monitor className="size-4" aria-hidden />
                        ) : m.modo === 'correo_cliente' ? (
                          <User className="size-4" aria-hidden />
                        ) : m.modo === 'individual' ? (
                          <User className="size-4" aria-hidden />
                        ) : (
                          <Layers className="size-4" aria-hidden />
                        )}
                        {m.nombre}
                        {n !== null && (
                          <span className="rounded-full bg-white/10 px-1.5 text-xs tabular-nums">
                            {n}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {modo === 'correo_cliente' ? (
                  <div className="grid gap-3">
                    <label className="grid gap-1 text-sm">
                      Correo del cliente
                      <input
                        value={correoCliente}
                        onChange={(e) => setCorreoCliente(e.currentTarget.value)}
                        placeholder="correo.del.cliente@gmail.com"
                        autoComplete="off"
                        spellCheck={false}
                        className="h-11 rounded-xl border border-borde bg-hundida px-3 text-center"
                      />
                    </label>
                    {datos.tipo === 'familiar' && (
                      <label className="grid gap-1 text-sm">
                        Contraseña del cliente (opcional)
                        <input
                          value={claveCliente}
                          onChange={(e) => setClaveCliente(e.currentTarget.value)}
                          autoComplete="off"
                          className="h-11 rounded-xl border border-borde bg-hundida px-3"
                        />
                      </label>
                    )}
                    <p className="text-xs text-tinta-tenue">
                      La activación se hace en el correo del propio cliente: no ocupa un{' '}
                      {textos.lugar.toLowerCase()} de tus cuentas. Se crea una cuenta individual a
                      su nombre, sin fecha de pago al proveedor.
                    </p>
                    {(campos.usuario || campos.clave) && (
                      <p className="text-xs text-peligro">{campos.usuario ?? campos.clave}</p>
                    )}
                  </div>
                ) : libres.length === 0 ? (
                  <p className="rounded-xl border border-borde px-4 py-6 text-center text-sm text-tinta-suave">
                    No hay lugares libres para esta opción. Agrega una cuenta o elige otra opción.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-tinta-suave">
                      {new Set(libres.map((l) => l.cuentaId)).size} cuentas con{' '}
                      {textos.lugares.toLowerCase()} libres
                    </p>
                    {recomendado && (
                      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-aviso/50 bg-aviso/10 p-3">
                        <span className="grid size-10 place-items-center rounded-xl bg-aviso/20 text-aviso">
                          <Star className="size-5" aria-hidden />
                        </span>
                        <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
                          <span className="text-xs font-bold tracking-wide text-aviso uppercase">
                            Recomendado · vence más tarde
                          </span>
                          <span className="truncate font-semibold">
                            {textos.lugar} {recomendado.lugar.perfil.numero} ·{' '}
                            <span className="font-mono">
                              {correoCuenta(recomendado.lugar.cuenta)}
                            </span>
                          </span>
                          <span className="text-xs text-aviso">
                            {recomendado.lugar.facturaEn
                              ? `Vence ${diaMes(recomendado.lugar.facturaEn)}`
                              : 'Sin fecha de pago'}
                            {recomendado.cubre
                              ? ' · cubre todo el plazo del cliente'
                              : recomendado.lugar.facturaEn
                                ? ` · ${diasEntre(recomendado.lugar.facturaEn, sumarMeses(hoy, 1))} días antes que el cliente. Ninguna cuenta cubre todo el plazo`
                                : ''}
                          </span>
                        </div>
                        <Boton tamano="sm" onClick={() => elegirLugar(recomendado.lugar)}>
                          Usar recomendado
                        </Boton>
                      </div>
                    )}
                    <ul className="grid gap-2">
                      {[...new Set(libres.map((l) => l.cuentaId))].map((id) => {
                        const c = datos.cuentas.find((x) => x.id === id)!;
                        const nLibres = libres.filter((l) => l.cuentaId === id).length;
                        const abierta = abiertas.has(id);
                        return (
                          <li
                            key={id}
                            className={clsx(
                              'rounded-2xl border',
                              recomendado?.lugar.cuentaId === id
                                ? 'border-marca/60'
                                : 'border-borde',
                            )}
                          >
                            <button
                              type="button"
                              aria-expanded={abierta}
                              onClick={() =>
                                setAbiertas((s) => {
                                  const n = new Set(s);
                                  if (n.has(id)) n.delete(id);
                                  else n.add(id);
                                  return n;
                                })
                              }
                              className="flex w-full items-center gap-3 p-3 text-left"
                            >
                              <span className="grid size-9 place-items-center rounded-xl bg-hundida">
                                <Monitor className="size-4" aria-hidden />
                              </span>
                              <span className="grid min-w-0 flex-1">
                                <span className="truncate font-mono text-sm font-semibold">
                                  {correoCuenta(c)}
                                  {recomendado?.lugar.cuentaId === id && (
                                    <span className="ml-2 rounded-full bg-marca/15 px-2 py-0.5 font-sans text-xs text-marca">
                                      ★ Recomendado
                                    </span>
                                  )}
                                </span>
                                <span className="text-xs text-tinta-suave">
                                  {c.plan ? `${c.plan} · ` : ''}
                                  {c.facturaEn
                                    ? `vence ${diaMes(c.facturaEn)}`
                                    : 'sin fecha'} · {c.listaPerfiles.length}{' '}
                                  {textos.lugares.toLowerCase()}
                                </span>
                              </span>
                              <span className="rounded-full bg-exito/15 px-2 py-0.5 text-xs font-semibold text-exito">
                                {nLibres} {nLibres === 1 ? 'libre' : 'libres'}
                              </span>
                              <ChevronDown
                                className={clsx(
                                  'size-4 transition-transform',
                                  abierta && 'rotate-180',
                                )}
                                aria-hidden
                              />
                            </button>
                            {abierta && (
                              <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3">
                                {c.listaPerfiles.map((p) => {
                                  const libre = libres.find((l) => l.perfilId === p.id);
                                  const elegido = lugar?.perfilId === p.id;
                                  const partes = (p.asignacion?.cliente.nombre ?? '').split(/\s+/);
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      disabled={!libre}
                                      aria-pressed={elegido}
                                      aria-label={
                                        libre
                                          ? `${textos.lugar} ${p.numero} libre de ${correoCuenta(c)}`
                                          : undefined
                                      }
                                      onClick={() => libre && elegirLugar(libre)}
                                      className={clsx(
                                        'flex items-center gap-3 rounded-xl border px-3 py-2 text-left',
                                        elegido
                                          ? 'border-marca bg-marca/10'
                                          : libre
                                            ? 'border-borde-fuerte bg-elevada hover:border-cian'
                                            : 'border-dashed border-borde opacity-60',
                                      )}
                                    >
                                      <span
                                        className={clsx(
                                          'grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold',
                                          libre ? 'bg-exito/20 text-exito' : 'bg-hundida',
                                        )}
                                      >
                                        {p.numero}
                                      </span>
                                      <span className="grid min-w-0 text-sm">
                                        {libre ? (
                                          <>
                                            <span className="font-semibold">Libre</span>
                                            <span className="text-xs text-tinta-tenue">
                                              {esTitular(datos.tipo, p.numero)
                                                ? 'Titular'
                                                : p.tienePin
                                                  ? 'Con PIN'
                                                  : textos.usaPin
                                                    ? 'Sin PIN'
                                                    : textos.lugar}
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            <span className="truncate font-medium">
                                              {p.asignacion
                                                ? partes[0]
                                                : p.estado === 'respaldo'
                                                  ? 'Respaldo'
                                                  : 'Bloqueado'}
                                            </span>
                                            <span className="truncate text-xs text-tinta-tenue">
                                              {partes.slice(1).join(' ')}
                                            </span>
                                          </>
                                        )}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {modo === 'plan' && lugar && (
                      <div className="grid gap-2 rounded-2xl border border-borde p-3">
                        <p className="text-xs font-bold tracking-wide text-marca uppercase">
                          Cuenta {servicio.nombre}: {textos.lugar} {perfilElegido?.numero}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="grid gap-1 text-sm">
                            <span>
                              Correo del miembro{' '}
                              <span className="text-xs text-peligro">*obligatorio</span>
                            </span>
                            <input
                              value={usuarioMiembro}
                              onChange={(e) => setUsuarioMiembro(e.currentTarget.value)}
                              placeholder="correo.del.miembro@gmail.com"
                              autoComplete="off"
                              spellCheck={false}
                              className="h-11 rounded-xl border border-borde bg-hundida px-3"
                            />
                          </label>
                          <label className="grid gap-1 text-sm">
                            <span>
                              Contraseña del miembro{' '}
                              <span className="text-xs text-peligro">*obligatorio</span>
                            </span>
                            <input
                              value={claveMiembro}
                              onChange={(e) => setClaveMiembro(e.currentTarget.value)}
                              placeholder="Contraseña propia del miembro"
                              autoComplete="off"
                              className="h-11 rounded-xl border border-borde bg-hundida px-3"
                            />
                          </label>
                        </div>
                        <p className="rounded-lg border-l-2 border-marca bg-marca/5 px-3 py-2 text-xs text-tinta-suave">
                          Cada miembro tiene su propio correo y contraseña de {servicio.nombre}: son
                          diferentes al correo de la cuenta.
                        </p>
                        {(campos.usuarioMiembro || campos.claveMiembro) && (
                          <p className="text-xs text-peligro">
                            {campos.usuarioMiembro ?? campos.claveMiembro}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {paso === 1 && (
              <>
                <div>
                  <h3 className="text-lg font-semibold">Datos del cliente</h3>
                  <p className="text-sm text-tinta-suave">Nombre y cómo contactarlo.</p>
                </div>
                <div className="grid gap-3 rounded-2xl border border-marca/40 bg-marca/5 p-3">
                  <div className="flex items-center gap-3">
                    <div className="grid min-w-0 flex-1">
                      <span className="text-xs text-tinta-suave">{tituloLugar}</span>
                      <span className="truncate font-mono font-semibold">
                        {modo === 'correo_cliente'
                          ? correoCliente
                          : cuentaElegida
                            ? correoCuenta(cuentaElegida)
                            : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPaso(0)}
                      className="inline-flex items-center gap-1 text-sm text-marca hover:underline"
                    >
                      <Pencil className="size-3.5" aria-hidden /> Cambiar
                    </button>
                  </div>
                  {modo !== 'correo_cliente' && perfilElegido && (
                    <dl className="grid grid-cols-[5rem_1fr_6rem] gap-2 text-sm">
                      <Dato etiqueta={textos.lugar} valor={String(perfilElegido.numero)} />
                      <Dato
                        etiqueta="Contraseña"
                        valor={
                          modo === 'plan'
                            ? claveMiembro
                            : (cred?.clave ?? (permisos.revelar ? 'Cargando…' : 'Auto'))
                        }
                        mono
                      />
                      <Dato
                        etiqueta="PIN"
                        valor={textos.usaPin ? (credPerfil?.pin ?? '—') : 'No aplica'}
                        mono
                      />
                    </dl>
                  )}
                </div>

                {existente ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-cian/50 bg-cian/5 px-3 py-2 text-sm">
                    <span>
                      <span className="font-semibold">{existente.nombre}</span>
                      <span className="text-tinta-suave"> · ya es cliente</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setExistente(null)}
                      className="text-marca hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <>
                    <label className="grid gap-1 text-sm">
                      Nombre del cliente
                      <input
                        value={nombre}
                        onChange={(e) => setNombre(e.currentTarget.value)}
                        placeholder="Juan Pérez"
                        maxLength={120}
                        autoFocus
                        className="h-12 rounded-xl border border-borde bg-hundida px-3 text-base"
                      />
                    </label>
                    {campos['clienteNuevo.nombre'] && (
                      <p className="text-xs text-peligro">{campos['clienteNuevo.nombre']}</p>
                    )}
                    <label className="grid gap-1 text-sm">
                      Responsable
                      <input
                        value={responsable}
                        onChange={(e) => cambiarResponsable(e.currentTarget.value)}
                        placeholder="Revendedor o «Cliente» si es venta directa"
                        list="nv-responsables"
                        maxLength={60}
                        className="h-11 rounded-xl border border-borde bg-hundida px-3"
                      />
                      <datalist id="nv-responsables">
                        {responsables.map((r) => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                    </label>
                    <fieldset className="grid gap-2">
                      <legend className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium">
                        <Send className="size-4 text-marca" aria-hidden /> Contacto
                      </legend>
                      <SelectorCanal canal={canal} onCanal={setCanal} />
                      <label className="grid gap-1 text-sm">
                        {etiquetaCanal(canal)}
                        <input
                          value={contacto}
                          onChange={(e) => {
                            setContacto(e.currentTarget.value);
                            setContactoAuto(null);
                          }}
                          placeholder={ejemploCanal(canal)}
                          inputMode={
                            canal === 'whatsapp' ? 'tel' : canal === 'correo' ? 'email' : 'text'
                          }
                          className="h-11 rounded-xl border border-borde bg-hundida px-3"
                        />
                        {contactoAuto && contacto === contactoAuto && (
                          <span className="text-xs text-tinta-tenue">
                            Se llenó con el contacto de {responsable.trim()}. Puedes cambiarlo.
                          </span>
                        )}
                      </label>
                      {extras.map((x, i) => (
                        <div key={i} className="grid gap-2 rounded-xl border border-borde p-2">
                          <div className="flex items-center gap-2">
                            <SelectorCanal
                              canal={x.canal}
                              onCanal={(k) =>
                                setExtras((l) =>
                                  l.map((y, j) => (j === i ? { ...y, canal: k } : y)),
                                )
                              }
                            />
                            <button
                              type="button"
                              onClick={() => setExtras((l) => l.filter((_, j) => j !== i))}
                              aria-label="Quitar este contacto"
                              className="rounded-lg p-2 text-tinta-tenue hover:text-peligro"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                          <input
                            aria-label={etiquetaCanal(x.canal)}
                            value={x.valor}
                            onChange={(e) => {
                              const v = e.currentTarget.value;
                              setExtras((l) => l.map((y, j) => (j === i ? { ...y, valor: v } : y)));
                            }}
                            placeholder={ejemploCanal(x.canal)}
                            className="h-10 rounded-xl border border-borde bg-hundida px-3 text-sm"
                          />
                        </div>
                      ))}
                      {extras.length < 2 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExtras((l) => [
                              ...l,
                              {
                                canal: (['telegram', 'correo', 'whatsapp'] as Canal[]).find(
                                  (k) => k !== canal && !l.some((y) => y.canal === k),
                                )!,
                                valor: '',
                              },
                            ])
                          }
                          className="rounded-xl border border-dashed border-borde py-2 text-sm text-marca hover:border-marca"
                        >
                          <Plus className="mr-1 inline size-4" aria-hidden /> Agregar otro contacto
                        </button>
                      )}
                      {[canal, ...extras.map((x) => x.canal)].includes('whatsapp') && (
                        <label className="flex items-center gap-2 text-xs text-tinta-suave">
                          <input
                            type="checkbox"
                            checked={aceptaWhatsapp}
                            onChange={(e) => setAceptaWhatsapp(e.currentTarget.checked)}
                          />
                          Acepta recibir avisos por WhatsApp
                        </label>
                      )}
                      {(campos['clienteNuevo.whatsapp'] ||
                        campos['clienteNuevo.telegram'] ||
                        campos['clienteNuevo.correo']) && (
                        <p className="text-xs text-peligro">
                          {campos['clienteNuevo.whatsapp'] ??
                            campos['clienteNuevo.telegram'] ??
                            campos['clienteNuevo.correo']}
                        </p>
                      )}
                    </fieldset>
                  </>
                )}

                <details
                  open={buscando}
                  onToggle={(e) => {
                    const abierto = (e.currentTarget as HTMLDetailsElement).open;
                    setBuscando(abierto);
                    if (abierto && encontrados === null) void buscarClientes('');
                  }}
                  className="text-sm"
                >
                  <summary className="cursor-pointer text-tinta-suave hover:text-tinta">
                    ¿Ya es cliente? Búscalo
                  </summary>
                  <div className="mt-2 grid gap-2">
                    <form
                      role="search"
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void buscarClientes(busqueda);
                      }}
                    >
                      <input
                        aria-label="Buscar cliente"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.currentTarget.value)}
                        placeholder="Nombre, correo, teléfono o responsable"
                        className="h-10 min-w-0 flex-1 rounded-xl border border-borde bg-hundida px-3"
                      />
                      <Boton tamano="sm" variante="secundario" type="submit">
                        Buscar
                      </Boton>
                    </form>
                    {encontrados && encontrados.length === 0 && (
                      <p className="text-xs text-tinta-tenue">No hay clientes con ese nombre.</p>
                    )}
                    <ul className="grid max-h-48 gap-1 overflow-y-auto">
                      {(encontrados ?? []).map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setExistente(c);
                              setBuscando(false);
                            }}
                            className="w-full rounded-lg border border-borde px-3 py-2 text-left hover:border-cian"
                          >
                            <span className="block font-medium">{c.nombre}</span>
                            <span className="block text-xs text-tinta-tenue">
                              {c.responsable ? `${c.responsable} · ` : ''}
                              {c.suscripcionesActivas} activas
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              </>
            )}

            {paso === 2 && (
              <>
                <div>
                  <h3 className="text-lg font-semibold">Plazo y precio</h3>
                  <p className="text-sm text-tinta-suave">Cuánto paga por mes y hasta cuándo.</p>
                </div>
                {planes && planes.length === 0 && (
                  <Alerta tono="aviso">
                    Este servicio no tiene planes de suscripción activos: crea uno en el catálogo.
                  </Alerta>
                )}
                {planes && planes.length > 1 && (
                  <label className="grid gap-1 text-sm">
                    Plan
                    <select
                      value={planId}
                      onChange={(e) => {
                        const p = planes.find((x) => x.id === e.currentTarget.value);
                        setPlanId(p?.id ?? '');
                        if (p) setPrecio(precioMes(p, moneda));
                      }}
                      className="h-10 rounded-xl border border-borde bg-hundida px-3"
                    >
                      {planes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="grid gap-2 rounded-2xl border border-borde p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">
                      {modo === 'perfil'
                        ? `Precio del ${textos.lugar.toLowerCase()}`
                        : 'Precio del servicio'}
                    </span>
                    <span className="flex items-center gap-2 text-tinta-tenue">
                      {monedas.length > 1 && (
                        <select
                          aria-label="Moneda"
                          value={moneda}
                          onChange={(e) => {
                            const m = e.currentTarget.value as Moneda;
                            setMoneda(m);
                            setMetodoId('');
                            if (plan) setPrecio(precioMes(plan, m));
                          }}
                          className="h-8 rounded-lg border border-borde bg-hundida px-2 text-xs"
                        >
                          {monedas.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      )}
                      {plazo === 'fecha' ? 'total' : 'por mes'}
                    </span>
                  </div>
                  <label className="flex items-baseline gap-2 border-b-2 border-marca pb-1">
                    <span className="text-2xl text-tinta-tenue">
                      {moneda === 'USD' ? '$' : moneda}
                    </span>
                    <input
                      aria-label="Precio"
                      value={precio}
                      inputMode="decimal"
                      onChange={(e) => setPrecio(e.currentTarget.value)}
                      placeholder="0.00"
                      className="w-full bg-transparent text-3xl font-bold outline-none"
                    />
                  </label>
                  {precioSiempre && (
                    <button
                      type="button"
                      onClick={() => setPrecio(precioSiempre)}
                      className="justify-self-start rounded-full border border-borde px-3 py-1 text-sm hover:border-cian"
                    >
                      Precio de siempre <strong>{formatearMonto(precioSiempre, moneda)}</strong>
                    </button>
                  )}
                  {campos.precio && <p className="text-xs text-peligro">{campos.precio}</p>}
                </div>
                <fieldset className="grid gap-2">
                  <legend className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium">
                    <CalendarDays className="size-4 text-marca" aria-hidden /> Plazo
                  </legend>
                  <div className="grid grid-cols-5 gap-2">
                    {MESES_ALTA.map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={plazo === m}
                        onClick={() => setPlazo(m)}
                        className={clsx(
                          'rounded-xl border py-2.5 text-sm font-semibold',
                          plazo === m ? 'border-marca bg-marca text-white' : 'border-borde',
                        )}
                      >
                        {m} {m === 1 ? 'mes' : 'meses'}
                      </button>
                    ))}
                  </div>
                  <label className="grid gap-1 text-sm">
                    <span className="text-tinta-suave">O elige la fecha de vencimiento</span>
                    <input
                      type="date"
                      value={plazo === 'fecha' ? fecha : vence}
                      min={hoy}
                      onChange={(e) => {
                        setPlazo('fecha');
                        setFecha(e.currentTarget.value);
                      }}
                      className="h-11 w-56 rounded-xl border border-borde bg-hundida px-3"
                    />
                  </label>
                  {vence && vence > hoy && (
                    <p className="inline-flex items-center gap-1.5 text-sm text-tinta-suave">
                      <Clock className="size-4" aria-hidden /> Vence el{' '}
                      <strong className="text-tinta">{fechaLarga(vence)}</strong> · en{' '}
                      {diasEntre(hoy, vence)} días
                    </p>
                  )}
                  {(campos.vence || campos.meses) && (
                    <p className="text-xs text-peligro">{campos.vence ?? campos.meses}</p>
                  )}
                </fieldset>
                {cuentaAntes && cuentaElegida?.facturaEn && (
                  <p className="flex gap-2 rounded-xl border border-aviso/50 bg-aviso/10 px-3 py-2 text-sm text-aviso">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    La cuenta {correoCuenta(cuentaElegida)} vence el{' '}
                    {fechaContrato(cuentaElegida.facturaEn)},{' '}
                    {diasEntre(cuentaElegida.facturaEn, vence)} días antes que el cliente (
                    {fechaContrato(vence)}). Tendrás que renovarla o moverlo antes.
                  </p>
                )}
                <div className="flex items-center justify-between rounded-2xl border border-marca/40 bg-marca/5 px-4 py-3">
                  <span className="text-xs font-bold tracking-wide uppercase">Total a cobrar</span>
                  <span className="text-2xl font-bold tabular-nums">
                    {Number.isFinite(total)
                      ? formatearMonto(
                          (plazo === 'fecha' ? Number(precio || 0) : total).toFixed(2),
                          moneda,
                        )
                      : '—'}
                  </span>
                </div>
                {permisos.cobrar && (
                  <fieldset className="grid gap-2">
                    <legend className="mb-1 text-sm font-medium">Pagó con (opcional)</legend>
                    <div className="flex flex-wrap gap-2">
                      {metodosMoneda.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={metodoId === m.id}
                          onClick={() => setMetodoId(metodoId === m.id ? '' : m.id)}
                          className={clsx(
                            'rounded-xl border px-3 py-1.5 text-sm',
                            metodoId === m.id
                              ? 'border-marca bg-marca/15 font-semibold'
                              : 'border-borde',
                          )}
                        >
                          {m.nombre}
                        </button>
                      ))}
                      {metodosMoneda.length === 0 && (
                        <span className="text-xs text-tinta-tenue">
                          No hay métodos de cobro en {moneda}.
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-tinta-tenue">
                      {metodoId
                        ? 'Queda anotado en la Caja del día y en el Balance.'
                        : 'Sin marcar, la venta no entra en Caja.'}
                    </p>
                  </fieldset>
                )}
              </>
            )}

            {error && Object.keys(campos).length === 0 && (
              <Alerta tono="peligro">{error.mensaje}</Alerta>
            )}
          </div>

          <aside className="grid content-start gap-2" aria-label="Así queda el contrato">
            <p className="text-xs font-bold tracking-widest text-tinta-suave uppercase">
              Así queda el contrato
            </p>
            <pre className="max-h-[26rem] overflow-y-auto rounded-2xl border border-borde bg-hundida p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {vistaContrato}
            </pre>
          </aside>
        </div>
      )}

      {paso < 3 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-4">
          <div className="flex items-center gap-3">
            {paso === 0 ? (
              <Boton variante="secundario" icono={<X className="size-4" />} onClick={onCerrar}>
                Cancelar
              </Boton>
            ) : (
              <Boton
                variante="secundario"
                icono={<ChevronLeft className="size-4" />}
                onClick={() => setPaso(paso - 1)}
                disabled={cargando}
              >
                Atrás
              </Boton>
            )}
            <span className="text-sm text-tinta-tenue">Paso {paso + 1} de 3</span>
          </div>
          <div className="grid justify-items-end gap-1">
            {paso < 2 ? (
              <Boton
                onClick={() => {
                  if (!falta) setPaso(paso + 1);
                }}
                disabled={Boolean(falta)}
              >
                Siguiente <ChevronRight className="size-4" aria-hidden />
              </Boton>
            ) : (
              <Boton
                cargando={cargando}
                disabled={Boolean(falta)}
                icono={<Save className="size-4" />}
                onClick={() => void guardar()}
              >
                Guardar
              </Boton>
            )}
            {falta && <p className="text-xs text-tinta-tenue">{falta}</p>}
          </div>
        </div>
      )}
    </Dialogo>
  );
}

function Dato({
  etiqueta,
  valor,
  mono = false,
}: {
  etiqueta: string;
  valor: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
      <dd
        className={clsx(
          'truncate rounded-xl border border-borde bg-hundida px-3 py-2',
          mono && 'font-mono',
        )}
      >
        {valor || '—'}
      </dd>
    </div>
  );
}

const etiquetaCanal = (c: Canal) =>
  c === 'whatsapp' ? 'Número WhatsApp' : c === 'telegram' ? 'Usuario de Telegram' : 'Correo';

const ejemploCanal = (c: Canal) =>
  c === 'whatsapp'
    ? 'Ej: 584121234567 (con código de país, sin +)'
    : c === 'telegram'
      ? '@usuario'
      : 'cliente@gmail.com';

function SelectorCanal({ canal, onCanal }: { canal: Canal; onCanal: (c: Canal) => void }) {
  const opciones: { k: Canal; nombre: string; icono: typeof Mail }[] = [
    { k: 'whatsapp', nombre: 'WhatsApp', icono: MessageCircle },
    { k: 'telegram', nombre: 'Telegram', icono: Send },
    { k: 'correo', nombre: 'Correo', icono: Mail },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Canal"
      className="grid flex-1 grid-cols-3 gap-1 rounded-xl border border-borde bg-hundida p-1"
    >
      {opciones.map(({ k, nombre, icono: Icono }) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={canal === k}
          onClick={() => onCanal(k)}
          className={clsx(
            'inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm',
            canal === k ? 'border border-marca bg-elevada font-semibold' : 'text-tinta-suave',
          )}
        >
          <Icono className="size-4" aria-hidden /> {nombre}
        </button>
      ))}
    </div>
  );
}
