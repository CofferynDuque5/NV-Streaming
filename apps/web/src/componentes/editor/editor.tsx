'use client';

import {
  type BloqueSitio,
  type CatalogoPublico,
  type ContactoSitio,
  guardarBorradorSchema,
  MAX_BLOQUES,
  type MedioSitio,
  type MetodoPagoSitio,
  type PaginaSitioDetalle,
  type PaletaSitio,
  type TipoBloque,
} from '@nv/shared';
import clsx from 'clsx';
import {
  Check,
  ChevronLeft,
  Eye,
  History,
  Layers,
  PencilLine,
  ShieldCheck,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { refrescarSitio } from '@/app/(paneles)/admin/sitio/acciones';
import { monedaValida } from '@/componentes/planes';
import { Aviso, claseEnlace } from '@/componentes/cliente/piezas-cuenta';
import { Lateral } from '@/componentes/revendedor/lateral';
import { Boton, clasesBoton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import {
  DatosPagina,
  GaleriaBloques,
  HistorialVersiones,
  hayQuePublicar,
  ResumenPublicar,
} from './cajones';
import type { OpcionesCambio, PropsFormulario } from './formularios';
import { Inspector } from './inspector';
import { ListaBloques } from './lista';
import { BibliotecaMedios, subtituloMedios } from './medios';
import { bloqueNuevo, duplicarBloque, erroresDe, INFO_BLOQUES } from './modelo';
import { EstadoPagina, estadoPagina, Hace } from './piezas';
import { type Dispositivo, VistaPrevia } from './vista-previa';

interface Borrador {
  titulo: string;
  descripcion: string;
  bloques: BloqueSitio[];
}
type Cajon = 'galeria' | 'medios' | 'historial' | 'publicar' | 'datos';
type Panel = 'bloques' | 'vista' | 'editar';
type Ocupado = 'guardar' | 'publicar' | 'recargar' | null;

/** Desde este ancho, el editor tiene sus tres columnas. */
const ANCHO_COLUMNAS = '(min-width: 1100px)';
/** Cambios seguidos en un mismo campo se deshacen juntos si llegan en menos de esto. */
const AGRUPAR_MS = 1500;
const MAX_DESHACER = 40;
/** Por debajo de las tres columnas, la barra superior deja solo iconos. */
const ACC_ICONO = 'max-[68.75rem]:size-10.5 max-[68.75rem]:px-0';
const SOLO_ANCHO = 'max-[68.75rem]:hidden';

const instantanea = (b: Borrador) =>
  JSON.stringify([b.titulo.trim(), b.descripcion.trim(), b.bloques]);
const deDetalle = (p: PaginaSitioDetalle): Borrador => ({
  titulo: p.titulo,
  descripcion: p.descripcion ?? '',
  bloques: p.bloques,
});
const enColumnas = () => typeof window !== 'undefined' && window.matchMedia(ANCHO_COLUMNAS).matches;
const primeroDe = (bloques: BloqueSitio[]) =>
  (bloques.find((b) => b.tipo === 'portada') ?? bloques[0])?.id ?? null;

/**
 * Editor visual de una página: lista de bloques, vista previa (un clic elige el
 * bloque) y el formulario del bloque elegido; en el teléfono, una parte a la
 * vez. Guarda borradores (todo el equipo con el editor), publica con nota
 * (solo administración), deshace los últimos cambios y avisa de conflictos.
 */
export function EditorPagina({
  inicial,
  mediosIniciales,
  catalogo,
  metodosPago,
  contacto,
  paleta,
  puedePublicar,
}: {
  inicial: PaginaSitioDetalle;
  mediosIniciales: MedioSitio[];
  catalogo: CatalogoPublico | null;
  metodosPago: MetodoPagoSitio[];
  contacto: ContactoSitio | null;
  paleta: PaletaSitio;
  puedePublicar: boolean;
}) {
  const router = useRouter();
  const notificar = useNotificar();
  const [pagina, setPagina] = useState(inicial);
  const [borrador, setBorrador] = useState<Borrador>(() => deDetalle(inicial));
  const actual = useRef(borrador);
  const [guardadoComo, setGuardadoComo] = useState(() => instantanea(deDetalle(inicial)));
  const [sel, setSel] = useState<string | null>(() => primeroDe(inicial.bloques));
  const selRef = useRef(sel);
  useEffect(() => {
    selRef.current = sel;
  }, [sel]);
  const [panel, setPanel] = useState<Panel>('bloques');
  const [dispositivo, setDispositivo] = useState<Dispositivo>('escritorio');
  const [cajon, setCajon] = useState<Cajon | null>(null);
  const [medioPara, setMedioPara] = useState<{
    actual: string | null;
    alElegir: (m: MedioSitio) => void;
  } | null>(null);
  const [medios, setMedios] = useState(mediosIniciales);
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [copiando, setCopiando] = useState<number | null>(null);
  const [conflicto, setConflicto] = useState<{
    quien: string;
    reciente: PaginaSitioDetalle | null;
  } | null>(null);
  const [nota, setNota] = useState('');
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [salida, setSalida] = useState<string | null>(null);
  const [tocados, setTocados] = useState<ReadonlySet<string>>(new Set());
  const [abiertos, setAbiertos] = useState<Record<string, number | null>>({});
  const [masOpciones, setMasOpciones] = useState(false);
  const [deApi, setDeApi] = useState<Record<string, string>>({});
  const pila = useRef<{ estado: Borrador; sel: string | null }[]>([]);
  const [hayDeshacer, setHayDeshacer] = useState(false);
  const ultimo = useRef({ clave: '', t: 0 });
  const colVista = useRef<HTMLElement>(null);
  const colBloques = useRef<HTMLElement>(null);
  const [, setTic] = useState(0);

  const { titulo, descripcion, bloques } = borrador;
  const sucio = instantanea(borrador) !== guardadoComo;

  // «hace X» se actualiza solo; en el teléfono, la vista previa empieza en Móvil.
  useEffect(() => {
    const r = window.requestAnimationFrame(() => {
      if (!enColumnas()) setDispositivo('movil');
    });
    const t = window.setInterval(() => setTic((n) => n + 1), 30_000);
    return () => {
      window.cancelAnimationFrame(r);
      window.clearInterval(t);
    };
  }, []);

  /* ───────────── validación en vivo ───────────── */

  const validacion = useMemo(
    () => guardarBorradorSchema.safeParse({ ...borrador, borradorActualizadoEn: null }),
    [borrador],
  );
  const errores = useMemo(
    () => ({ ...deApi, ...(validacion.success ? {} : erroresDe(validacion.error.issues)) }),
    [deApi, validacion],
  );
  /** Errores por bloque (id → cuántos). */
  const erroresPorBloque = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of Object.keys(errores)) {
      const [raiz, i] = k.split('.');
      const b = raiz === 'bloques' && i !== undefined ? bloques[Number(i)] : undefined;
      if (b) m.set(b.id, (m.get(b.id) ?? 0) + 1);
    }
    return m;
  }, [errores, bloques]);
  const conError = useMemo(() => new Set(erroresPorBloque.keys()), [erroresPorBloque]);
  /** Lo que se compara con lo publicado: el borrador ya normalizado por el esquema. */
  const normalizado = validacion.success
    ? {
        titulo: validacion.data.titulo,
        descripcion: validacion.data.descripcion ?? '',
        bloques: validacion.data.bloques,
      }
    : borrador;

  /* ───────────── deshacer ───────────── */

  /** Aplica un cambio al borrador y guarda el estado anterior para «Deshacer». */
  const editar = useCallback((cambio: (b: Borrador) => Borrador, clave?: string) => {
    const ahora = Date.now();
    const seguido =
      !!clave && clave === ultimo.current.clave && ahora - ultimo.current.t < AGRUPAR_MS;
    ultimo.current = { clave: clave ?? '', t: ahora };
    if (!seguido) {
      pila.current.push({ estado: actual.current, sel: selRef.current });
      if (pila.current.length > MAX_DESHACER) pila.current.shift();
      setHayDeshacer(true);
    }
    const siguiente = cambio(actual.current);
    actual.current = siguiente;
    setBorrador(siguiente);
    setDeApi({});
  }, []);

  const deshacer = useCallback(() => {
    const previo = pila.current.pop();
    if (!previo) return;
    actual.current = previo.estado;
    setBorrador(previo.estado);
    const existe = (id: string | null) => !!id && previo.estado.bloques.some((b) => b.id === id);
    setSel(existe(previo.sel) ? previo.sel : (previo.estado.bloques[0]?.id ?? null));
    setHayDeshacer(pila.current.length > 0);
    setConfirmarEliminar(false);
    ultimo.current = { clave: '', t: 0 };
    notificar('Se deshizo el último cambio', 'info');
  }, [notificar]);

  const conDeshacer = useCallback(
    (texto: string) => notificar(texto, 'exito', { texto: 'Deshacer', alPulsar: deshacer }),
    [notificar, deshacer],
  );

  /** Reemplaza el borrador por el del servidor (al copiar una versión o recargar). */
  function aplicar(p: PaginaSitioDetalle) {
    setPagina(p);
    const b = deDetalle(p);
    actual.current = b;
    setBorrador(b);
    setGuardadoComo(instantanea(b));
    setDeApi({});
    if (!p.bloques.some((x) => x.id === selRef.current)) setSel(primeroDe(p.bloques));
  }

  /* ───────────── elegir y desplazar ───────────── */

  function irAVista(id: string) {
    const col = colVista.current;
    const el = col?.querySelector<HTMLElement>(`[data-bq="${id}"]`);
    if (!col || !el) return;
    const y = col.scrollTop + el.getBoundingClientRect().top - col.getBoundingClientRect().top;
    col.scrollTo({ top: Math.max(0, y - 70), behavior: 'smooth' });
  }

  function irAPanel(p: Panel) {
    setPanel(p);
    const ed = document.getElementById('ed');
    if (ed && !enColumnas()) {
      const y = ed.getBoundingClientRect().top + window.scrollY - 140;
      if (window.scrollY > y) window.scrollTo({ top: y });
    }
  }

  function elegir(id: string, desde: 'lista' | 'vista') {
    if (id !== sel) setConfirmarEliminar(false);
    setSel(id);
    if (!enColumnas()) {
      irAPanel('editar');
      return;
    }
    if (desde === 'lista') irAVista(id);
    else
      colBloques.current
        ?.querySelector(`[data-edsel="${id}"]`)
        ?.scrollIntoView({ block: 'nearest' });
  }

  /** Lleva al primer campo con error del bloque `i`. */
  function enfocarError(i: number) {
    const b = bloques[i];
    if (!b) return;
    const prefijo = `bloques.${i}.`;
    const clave = Object.keys(errores).find((k) => k.startsWith(prefijo));
    if (!clave) return;
    const ruta = clave.slice(prefijo.length);
    const lista = /^(\w+)\.(\d+)/.exec(ruta);
    if (lista?.[1] && lista[2]) {
      setAbiertos((a) => ({ ...a, [`${b.id}:${lista[1]}`]: Number(lista[2]) }));
    }
    if (ruta === 'ancla') setMasOpciones(true);
    window.setTimeout(() => {
      const ins = document.getElementById('ed-ins');
      const campo =
        ins?.querySelector<HTMLElement>(`[data-campo="${CSS.escape(ruta)}"]`) ??
        ins?.querySelector<HTMLElement>('[aria-invalid="true"]');
      campo?.scrollIntoView({ block: 'center' });
      campo?.focus({ preventScroll: true });
    }, 80);
  }

  function irAlPrimerError(): boolean {
    const i = bloques.findIndex((b) => conError.has(b.id));
    if (i < 0) return false;
    elegir(bloques[i]!.id, 'lista');
    enfocarError(i);
    return true;
  }

  /* ───────────── bloques ───────────── */

  function cambiarBloque(id: string, parche: Partial<BloqueSitio>, o: OpcionesCambio = {}) {
    editar(
      (e) => ({
        ...e,
        bloques: e.bloques.map((b) => (b.id === id ? ({ ...b, ...parche } as BloqueSitio) : b)),
      }),
      o.escribiendo && o.ruta ? `c:${id}:${o.ruta}` : undefined,
    );
    if (o.ruta) setTocados((t) => new Set(t).add(`${id}:${o.ruta}`));
    if (o.aviso) conDeshacer(o.aviso);
  }

  function mover(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= bloques.length) return;
    editar((e) => {
      const l = [...e.bloques];
      [l[i], l[j]] = [l[j]!, l[i]!];
      return { ...e, bloques: l };
    });
  }

  function moverA(id: string, a: number) {
    const i = bloques.findIndex((b) => b.id === id);
    if (i < 0) return;
    const destino = a > i ? a - 1 : a;
    if (destino === i) return;
    editar((e) => {
      const l = [...e.bloques];
      const [b] = l.splice(i, 1);
      l.splice(destino, 0, b!);
      return { ...e, bloques: l };
    });
    setSel(id);
    notificar(`${INFO_BLOQUES[bloques[i]!.tipo].nombre} ahora es el bloque ${destino + 1}`, 'info');
  }

  function anadir(tipo: TipoBloque) {
    if (bloques.length >= MAX_BLOQUES) return;
    const nuevo = bloqueNuevo(tipo);
    const i = bloques.findIndex((b) => b.id === sel);
    editar((e) => {
      const l = [...e.bloques];
      l.splice(i < 0 ? l.length : i + 1, 0, nuevo);
      return { ...e, bloques: l };
    });
    setSel(nuevo.id);
    setConfirmarEliminar(false);
    setCajon(null);
    notificar(`Bloque ${INFO_BLOQUES[tipo].nombre} añadido`);
    if (enColumnas()) {
      window.setTimeout(() => {
        colBloques.current
          ?.querySelector(`[data-edsel="${nuevo.id}"]`)
          ?.scrollIntoView({ block: 'nearest' });
        irAVista(nuevo.id);
      }, 120);
    } else irAPanel('editar');
  }

  function duplicar() {
    const i = bloques.findIndex((b) => b.id === sel);
    const b = bloques[i];
    if (!b || bloques.length >= MAX_BLOQUES) return;
    const copia = duplicarBloque(b);
    editar((e) => ({
      ...e,
      bloques: [...e.bloques.slice(0, i + 1), copia, ...e.bloques.slice(i + 1)],
    }));
    setSel(copia.id);
    notificar(`Bloque duplicado. Es el bloque ${i + 2}.`);
    if (enColumnas()) window.setTimeout(() => irAVista(copia.id), 120);
  }

  function eliminar() {
    const i = bloques.findIndex((b) => b.id === sel);
    const b = bloques[i];
    if (!b) return;
    editar((e) => ({ ...e, bloques: e.bloques.filter((x) => x.id !== b.id) }));
    setConfirmarEliminar(false);
    setSel((bloques[i + 1] ?? bloques[i - 1])?.id ?? null);
    conDeshacer(`Bloque ${INFO_BLOQUES[b.tipo].nombre} eliminado`);
  }

  /* ───────────── guardar, publicar, versiones ───────────── */

  async function enConflicto() {
    setConflicto({ quien: 'Otra persona', reciente: null });
    const r = await llamarApi<PaginaSitioDetalle>('GET', `/sitio/paginas/${pagina.id}`);
    if (r.ok)
      setConflicto({ quien: r.datos.borradorPor?.nombre ?? 'Otra persona', reciente: r.datos });
  }

  function fallo(error: ErrorLlamada) {
    if (error.codigo === 'BORRADOR_DESACTUALIZADO') {
      void enConflicto();
      notificar('No se guardó: hay una versión más reciente de esta página.', 'error');
      return;
    }
    setDeApi(erroresPorCampo(error));
    notificar(error.mensaje, 'error');
  }

  async function guardar(): Promise<PaginaSitioDetalle | null> {
    if (ocupado) return null;
    if (conflicto) {
      notificar('No se guardó: hay una versión más reciente de esta página.', 'error');
      document
        .getElementById('ed-conflicto')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return null;
    }
    if (!sucio) {
      notificar('Todo está guardado', 'info');
      return pagina;
    }
    if (!validacion.success) {
      const n = conError.size;
      notificar(
        n > 0
          ? `No se guardó: ${n === 1 ? 'hay 1 bloque' : `hay ${n} bloques`} por revisar. Te llevamos al primero.`
          : 'No se guardó: revisa el título y la descripción de la página.',
        'error',
      );
      if (!irAlPrimerError()) setCajon('datos');
      return null;
    }
    const enviado = actual.current;
    setOcupado('guardar');
    const r = await llamarApi<PaginaSitioDetalle>('PUT', `/sitio/paginas/${pagina.id}/borrador`, {
      ...enviado,
      borradorActualizadoEn: pagina.borradorActualizadoEn,
    });
    setOcupado(null);
    if (!r.ok) {
      fallo(r.error);
      return null;
    }
    setPagina(r.datos);
    setGuardadoComo(instantanea(enviado));
    notificar('Borrador guardado');
    return r.datos;
  }

  function abrirPublicar() {
    if (!puedePublicar) return;
    if (conflicto) {
      notificar('Primero carga la versión más reciente: hay un conflicto.', 'error');
      return;
    }
    const malos = bloques.filter((b) => conError.has(b.id));
    if (malos.length) {
      const b = malos[0]!;
      notificar(
        malos.length === 1
          ? `No se puede publicar: revisa el bloque ${bloques.indexOf(b) + 1} · ${INFO_BLOQUES[b.tipo].nombre}.`
          : `No se puede publicar: hay ${malos.length} bloques por revisar. Te llevamos al primero.`,
        'error',
      );
      irAlPrimerError();
      return;
    }
    if (!validacion.success) {
      notificar('No se puede publicar: revisa el título y la descripción de la página.', 'error');
      setCajon('datos');
      return;
    }
    setNota('');
    setCajon('publicar');
  }

  async function publicar() {
    let base = pagina;
    setOcupado('publicar');
    if (sucio) {
      setOcupado(null);
      const g = await guardar();
      if (!g) return;
      base = g;
      setOcupado('publicar');
    }
    const r = await llamarApi<PaginaSitioDetalle>('POST', `/sitio/paginas/${pagina.id}/publicar`, {
      nota: nota.trim() || null,
      borradorActualizadoEn: base.borradorActualizadoEn,
    });
    if (!r.ok) {
      setOcupado(null);
      fallo(r.error);
      return;
    }
    setPagina(r.datos);
    await refrescarSitio();
    setOcupado(null);
    setCajon(null);
    notificar(
      r.datos.archivada
        ? `Versión ${r.datos.versionPublicada?.numero} publicada. La página está archivada: desarchívala para que se vea.`
        : `${r.datos.titulo} publicada como versión ${r.datos.versionPublicada?.numero}. Ya se ve en la tienda.`,
    );
  }

  async function copiarVersion(numero: number) {
    setCopiando(numero);
    const r = await llamarApi<PaginaSitioDetalle>('POST', `/sitio/paginas/${pagina.id}/restaurar`, {
      numero,
    });
    setCopiando(null);
    if (!r.ok) {
      fallo(r.error);
      return;
    }
    pila.current.push({ estado: actual.current, sel: selRef.current });
    setHayDeshacer(true);
    aplicar(r.datos);
    setCajon(null);
    setConfirmarEliminar(false);
    notificar(`Versión ${numero} copiada al borrador. Publica para verla en la tienda.`);
  }

  async function recargar() {
    setOcupado('recargar');
    let reciente = conflicto?.reciente ?? null;
    if (!reciente) {
      const r = await llamarApi<PaginaSitioDetalle>('GET', `/sitio/paginas/${pagina.id}`);
      if (!r.ok) {
        setOcupado(null);
        notificar(r.error.mensaje, 'error');
        return;
      }
      reciente = r.datos;
    }
    setOcupado(null);
    aplicar(reciente);
    pila.current = [];
    setHayDeshacer(false);
    setConflicto(null);
    notificar(
      `Cargaste la versión más reciente${reciente.borradorPor ? ` de ${reciente.borradorPor.nombre}` : ''}`,
    );
  }

  /* ───────────── salir con cambios sin guardar ───────────── */

  const sucioRef = useRef(sucio);
  useEffect(() => {
    sucioRef.current = sucio;
    if (!sucio) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sucio]);
  useEffect(() => {
    // Los enlaces internos (volver, el logo, el menú) preguntan antes de salir.
    const clic = (e: MouseEvent) => {
      if (!sucioRef.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.('a[href]');
      if (
        !(a instanceof HTMLAnchorElement) ||
        a.target === '_blank' ||
        a.hasAttribute('download')
      ) {
        return;
      }
      if (a.closest('[data-vista-sitio]')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname)
        return;
      e.preventDefault();
      e.stopPropagation();
      setSalida(url.pathname + url.search + url.hash);
    };
    document.addEventListener('click', clic, true);
    return () => document.removeEventListener('click', clic, true);
  }, []);
  // Ctrl+S / Cmd+S guarda el borrador.
  const guardarRef = useRef(guardar);
  useEffect(() => {
    guardarRef.current = guardar;
  });
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void guardarRef.current();
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  async function guardarYSalir() {
    const destino = salida;
    setSalida(null);
    const g = await guardar();
    if (g && destino) router.push(destino);
  }

  /* ───────────── datos para la vista previa y los formularios ───────────── */

  const contexto = useMemo(
    () => ({
      ruta: pagina.ruta,
      catalogo,
      moneda: monedaValida(catalogo?.monedas ?? ['USD'], 'USD'),
      metodosPago,
      contacto,
    }),
    [pagina.ruta, catalogo, metodosPago, contacto],
  );
  const servicios = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const p of catalogo?.planes ?? []) vistos.set(p.servicio.slug, p.servicio.nombre);
    return [...vistos].map(([slug, nombre]) => ({ slug, nombre }));
  }, [catalogo]);

  const indice = bloques.findIndex((b) => b.id === sel);
  const elegido = indice >= 0 ? bloques[indice]! : null;
  const formulario: PropsFormulario | null = elegido
    ? {
        b: elegido,
        cambiar: (parche, o) => cambiarBloque(elegido.id, parche, o),
        err: (ruta) => errores[`bloques.${indice}.${ruta}`],
        hayError: (prefijo) => {
          const k = `bloques.${indice}.${prefijo}`;
          return Object.keys(errores).some((x) => x === k || x.startsWith(`${k}.`));
        },
        ok: (ruta, valor) =>
          tocados.has(`${elegido.id}:${ruta}`) &&
          !errores[`bloques.${indice}.${ruta}`] &&
          typeof valor === 'string' &&
          valor.trim() !== '',
        medios,
        elegirMedio: (actualId, alElegir) => {
          setMedioPara({ actual: actualId, alElegir });
          setCajon('medios');
        },
        servicios,
        abierto: (lista) => abiertos[`${elegido.id}:${lista}`] ?? null,
        abrir: (lista, i) => setAbiertos((a) => ({ ...a, [`${elegido.id}:${lista}`]: i })),
        rutaPagina: pagina.ruta,
      }
    : null;

  const estado = estadoPagina(pagina);
  const guardado = pagina.borradorActualizadoEn ? (
    <>
      <Hace iso={pagina.borradorActualizadoEn} />
      {pagina.borradorPor ? ` por ${pagina.borradorPor.nombre}` : ''}
    </>
  ) : null;
  const nMal = conError.size;
  const hayCambiosPublicar = hayQuePublicar(pagina, normalizado);

  const cajones: Record<Cajon, { titulo: string; subtitulo: string }> = {
    galeria: { titulo: 'Añadir bloque', subtitulo: `${bloques.length} de ${MAX_BLOQUES} bloques` },
    medios: { titulo: 'Biblioteca de imágenes', subtitulo: subtituloMedios(medios.length) },
    historial: {
      titulo: 'Historial de versiones',
      subtitulo: `${pagina.titulo} · ${pagina.versiones.length} ${pagina.versiones.length === 1 ? 'versión' : 'versiones'}`,
    },
    publicar: { titulo: 'Publicar página', subtitulo: `${pagina.titulo} · ${pagina.ruta}` },
    datos: { titulo: 'Título y descripción', subtitulo: pagina.ruta },
  };

  return (
    <>
      <div className="ed-top">
        <Link href="/admin/sitio" className="ed-volver">
          <ChevronLeft className="size-4" aria-hidden="true" />
          Sitio y páginas
        </Link>
        <div className="ed-top-t">
          <div className="fila">
            <h1>{pagina.titulo}</h1>
            <span className="ed-ruta">{pagina.ruta}</span>
            <EstadoPagina p={pagina} />
          </div>
          <p className="ed-meta" aria-live="polite">
            {sucio ? (
              <>
                <i className="ed-punto" aria-hidden="true" />
                <b>Cambios sin guardar</b>
                {guardado && <span>· Último guardado {guardado}</span>}
              </>
            ) : (
              <>
                <Check className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{guardado ? <>Guardado {guardado}</> : 'Sin guardar todavía'}</span>
              </>
            )}
          </p>
        </div>
        <div className="ed-top-acc">
          <button
            type="button"
            className={clasesBoton('secundario', 'sm', ACC_ICONO)}
            disabled={!hayDeshacer}
            onClick={deshacer}
            aria-label="Deshacer el último cambio"
            title="Deshacer el último cambio"
          >
            <Undo2 className="size-4" aria-hidden="true" />
            <span className="max-[68.75rem]:sr-only">Deshacer</span>
          </button>
          <button
            type="button"
            className={clasesBoton('secundario', 'sm', ACC_ICONO)}
            onClick={() => setCajon('historial')}
            aria-label="Historial de versiones"
          >
            <History className="size-4" aria-hidden="true" />
            <span className="max-[68.75rem]:sr-only">Historial</span>
          </button>
          <Boton
            variante={puedePublicar ? 'secundario' : 'primario'}
            tamano="sm"
            className={SOLO_ANCHO}
            cargando={ocupado === 'guardar'}
            onClick={() => void guardar()}
          >
            {ocupado !== 'guardar' && sucio && <i className="ed-punto" aria-hidden="true" />}
            {ocupado === 'guardar' ? 'Guardando…' : 'Guardar borrador'}
          </Boton>
          {puedePublicar ? (
            <Boton
              tamano="sm"
              className={SOLO_ANCHO}
              disabled={ocupado !== null}
              onClick={abrirPublicar}
            >
              Publicar
            </Boton>
          ) : (
            <span className={clsx('ed-nota-op', SOLO_ANCHO)}>
              <ShieldCheck className="size-4 text-cian" aria-hidden="true" />
              Administración revisa y publica
            </span>
          )}
        </div>
      </div>

      {conflicto && (
        <div id="ed-conflicto" role="alert">
          <Aviso
            tono="peligro"
            icono={<TriangleAlert className="size-4" aria-hidden="true" />}
            titulo={`${conflicto.quien} guardó esta página mientras editabas`}
            accion={
              <Boton
                variante="secundario"
                tamano="sm"
                cargando={ocupado === 'recargar'}
                onClick={() => void recargar()}
              >
                <span className="max-[43.75rem]:hidden">
                  Descartar mis cambios y cargar la versión más reciente
                </span>
                <span className="min-[43.75rem]:hidden">Descartar y cargar la más reciente</span>
              </Boton>
            }
          >
            Tus cambios no se pueden guardar sobre una versión más reciente. Copia lo que necesites
            antes de cargarla.
          </Aviso>
        </div>
      )}

      <div className="ed-seg" role="tablist" aria-label="Partes del editor">
        {(
          [
            ['bloques', 'Bloques', Layers],
            ['vista', 'Vista previa', Eye],
            ['editar', 'Editar', PencilLine],
          ] as const
        ).map(([k, n, Icono]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={panel === k}
            aria-controls={`ed-${k}`}
            onClick={() => irAPanel(k)}
          >
            <Icono aria-hidden="true" />
            {n}
            {k === 'bloques' && nMal > 0 && (
              <span className="ed-rev">
                {nMal}
                <span className="sr-only"> por revisar</span>
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="ed" id="ed" data-panel={panel}>
        <aside
          className="ed-col ed-c-bloques"
          id="ed-bloques"
          aria-label="Bloques de la página"
          ref={colBloques}
        >
          <ListaBloques
            bloques={bloques}
            seleccionado={sel}
            errores={erroresPorBloque}
            onElegir={(id) => elegir(id, 'lista')}
            onMover={mover}
            onMoverA={moverA}
            onAnadir={() => setCajon('galeria')}
            onDatos={() => setCajon('datos')}
          />
        </aside>
        <section
          className="ed-col ed-c-vista"
          id="ed-vista"
          aria-label="Vista previa"
          ref={colVista}
        >
          <VistaPrevia
            bloques={bloques}
            titulo={titulo}
            contexto={contexto}
            paleta={paleta}
            dispositivo={dispositivo}
            onDispositivo={setDispositivo}
            seleccionado={sel}
            conError={conError}
            onElegir={(id) => elegir(id, 'vista')}
          />
        </section>
        <aside className="ed-col ed-c-ins" id="ed-editar" aria-label="Editar el bloque">
          <div id="ed-ins" className="contents">
            <Inspector
              formulario={formulario}
              indice={indice}
              total={bloques.length}
              errores={elegido ? (erroresPorBloque.get(elegido.id) ?? 0) : 0}
              masOpciones={masOpciones}
              onMasOpciones={setMasOpciones}
              confirmarEliminar={confirmarEliminar}
              onPedirEliminar={() => setConfirmarEliminar(true)}
              onCancelarEliminar={() => setConfirmarEliminar(false)}
              onEliminar={eliminar}
              onDuplicar={duplicar}
              onVolver={() => irAPanel('bloques')}
            />
          </div>
        </aside>
      </div>

      <div className="ed-movbar" role="region" aria-label="Guardar y publicar">
        <div className="ed-mb-t">
          <b>
            {sucio ? (
              <>
                <i className="ed-punto" aria-hidden="true" />
                Sin guardar
              </>
            ) : (
              estado.texto
            )}
          </b>
          {!(sucio && puedePublicar) && (
            <span>
              {puedePublicar
                ? pagina.borradorActualizadoEn && <Hace iso={pagina.borradorActualizadoEn} />
                : 'Administración publica'}
            </span>
          )}
        </div>
        <Boton
          variante={puedePublicar ? 'secundario' : 'primario'}
          cargando={ocupado === 'guardar'}
          onClick={() => void guardar()}
        >
          {ocupado === 'guardar' ? 'Guardando…' : puedePublicar ? 'Guardar' : 'Guardar borrador'}
        </Boton>
        {puedePublicar && (
          <Boton disabled={ocupado !== null} onClick={abrirPublicar}>
            Publicar
          </Boton>
        )}
      </div>

      <Lateral
        abierto={cajon !== null}
        titulo={cajon ? cajones[cajon].titulo : ''}
        subtitulo={cajon ? cajones[cajon].subtitulo : undefined}
        onCerrar={() => setCajon(null)}
        pie={
          cajon === 'publicar' ? (
            <div className="grid gap-2.5">
              <Boton
                className="w-full"
                disabled={!hayCambiosPublicar}
                cargando={ocupado !== null}
                onClick={() => void publicar()}
              >
                {ocupado === 'guardar'
                  ? 'Guardando borrador…'
                  : ocupado === 'publicar'
                    ? 'Publicando…'
                    : 'Publicar ahora'}
              </Boton>
              <button
                type="button"
                className={clsx(claseEnlace, 'justify-self-center')}
                onClick={() => setCajon(null)}
              >
                Cancelar
              </button>
            </div>
          ) : undefined
        }
      >
        {cajon === 'galeria' && (
          <GaleriaBloques
            n={bloques.length}
            despuesDe={elegido ? { i: indice, tipo: elegido.tipo } : null}
            onAnadir={anadir}
          />
        )}
        {cajon === 'medios' && medioPara && (
          <BibliotecaMedios
            medios={medios}
            actual={medioPara.actual}
            onSubido={(m) => setMedios((l) => [m, ...l])}
            onElegir={(m) => {
              medioPara.alElegir(m);
              setCajon(null);
              notificar(`Imagen elegida: ${m.nombre}`);
            }}
          />
        )}
        {cajon === 'historial' && (
          <HistorialVersiones
            pagina={pagina}
            puedeCopiar={puedePublicar}
            sucio={sucio}
            copiando={copiando}
            onCopiar={(n) => void copiarVersion(n)}
          />
        )}
        {cajon === 'publicar' && (
          <ResumenPublicar
            pagina={pagina}
            actual={normalizado}
            sucio={sucio}
            nota={nota}
            onNota={setNota}
          />
        )}
        {cajon === 'datos' && (
          <DatosPagina
            ruta={pagina.ruta}
            titulo={titulo}
            descripcion={descripcion}
            errores={errores}
            onTitulo={(v) => editar((e) => ({ ...e, titulo: v }), 'datos:titulo')}
            onDescripcion={(v) => editar((e) => ({ ...e, descripcion: v }), 'datos:descripcion')}
          />
        )}
      </Lateral>

      <DialogoSalida
        abierto={salida !== null}
        titulo={pagina.titulo}
        onGuardar={() => void guardarYSalir()}
        onSalir={() => {
          const destino = salida;
          setSalida(null);
          sucioRef.current = false;
          if (destino) router.push(destino);
        }}
        onSeguir={() => setSalida(null)}
      />
    </>
  );
}

/** «Tienes cambios sin guardar» al salir del editor por un enlace. */
function DialogoSalida({
  abierto,
  titulo,
  onGuardar,
  onSalir,
  onSeguir,
}: {
  abierto: boolean;
  titulo: string;
  onGuardar: () => void;
  onSalir: () => void;
  onSeguir: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="salir-t"
      onClose={onSeguir}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="ed-dlg"
    >
      {abierto && (
        <div className="grid gap-3 p-5.5">
          <h2 id="salir-t" className="font-titulo text-xl font-bold">
            Tienes cambios sin guardar
          </h2>
          <p className="text-sm text-tinta-suave">
            Si sales ahora se pierden los cambios de {titulo} que no guardaste.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4.5 gap-y-2.5">
            <Boton onClick={onGuardar}>Guardar y salir</Boton>
            <button
              type="button"
              className="text-sm font-semibold whitespace-nowrap text-peligro hover:underline"
              onClick={onSalir}
            >
              Salir sin guardar
            </button>
            <button type="button" className={claseEnlace} onClick={onSeguir}>
              Seguir editando
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
