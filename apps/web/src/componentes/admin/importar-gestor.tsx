'use client';

import {
  type ArchivoMigracionGestor,
  type CambioPlataformaLote,
  type ComparacionMigracion,
  compararMigracion,
  type CuadreGestor,
  esMigracionGestor,
  type ImportarGestorEntrada,
  leerRespaldoGestor,
  type LoteGestorPublico,
  MAX_BYTES_RESPALDO_GESTOR,
  MAX_CUENTAS_LOTE_GESTOR,
  type Moneda,
  MONEDAS,
  type PlanPublico,
  type PlataformaGestor,
  reconstruirMigracionGestor,
  type RespaldoGestor,
  resumenPlataforma,
} from '@nv/shared';
import { ArrowRightLeft, FileUp, ShieldCheck, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Insignia } from '@/componentes/ui/insignia';
import { Selector } from '@/componentes/ui/selector';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { formatearFechaHora, formatearMonto } from '@/lib/formato';
import { llamarApi } from '@/lib/api-cliente';
import {
  descifrarMigracion,
  type IconoMigracion,
  iconoComoPng,
  verificarMigracion,
} from '@/lib/migracion-gestor';
import { Dialogo } from './cuentas-gestor';
import { ErrorGeneral, useAccion } from './piezas';

const plural = (n: number, uno: string, varios: string) =>
  n === 1 ? `1 ${uno}` : `${n} ${varios}`;

function Cuadre({ c }: { c: CuadreGestor }) {
  return (
    <div className="grid gap-3 text-sm">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
        {[
          ['Cuentas nuevas', c.cuentas.nuevas],
          ['Ya estaban', c.cuentas.yaEstaban + c.cuentas.yaImportadas],
          ['Perfiles', c.perfiles.nuevos],
          ['Perfiles libres', c.perfiles.libres],
          ['Clientes nuevos', c.clientes.nuevos],
          ['Clientes que ya existían', c.clientes.existentes],
          ['Suscripciones activas', c.suscripciones.activas],
          ['Suscripciones vencidas', c.suscripciones.vencidas],
          ['Clientes sin contacto', c.clientes.sinContacto],
          ['Clientes sin perfil', c.clientes.sinPerfil ?? 0],
          ...(c.perfiles.miembrosRecuperados
            ? [['Miembros recuperados', c.perfiles.miembrosRecuperados] as const]
            : []),
          ...(c.perfiles.clientesCorregidos
            ? [['Cupos que pasan a su cliente', c.perfiles.clientesCorregidos] as const]
            : []),
          ...(c.perfiles.preciosRecuperados
            ? [['Precios del Gestor que se guardan', c.perfiles.preciosRecuperados] as const]
            : []),
          ...(c.cuentas.rellenadas
            ? [
                ['Cuentas que se vuelven a llenar', c.cuentas.rellenadas] as const,
                ['Cupos como en el Gestor', c.perfiles.cuposRellenados ?? 0] as const,
              ]
            : []),
        ].map(([t, v]) => (
          <div key={t} className="flex justify-between gap-2 border-b border-borde/60 py-1">
            <dt className="text-tinta-suave">{t}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-tinta-suave">
        Costo al proveedor: <b>{formatearMonto(c.costoUsd, 'USD')}</b> · Lo que pagan los clientes:{' '}
        <b>{formatearMonto(c.ventaUsd, 'USD')}</b>
      </p>
      {c.avisos.length > 0 && (
        <ul className="list-disc pl-5 text-aviso">
          {c.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ServicioImportar {
  id: string;
  nombre: string;
  conLogo: boolean;
}

/** Sube el icono del Gestor a la biblioteca y lo pone como logo del servicio. */
async function ponerIcono(icono: IconoMigracion, servicio: ServicioImportar): Promise<string> {
  try {
    const datos = new FormData();
    datos.append('archivo', await iconoComoPng(icono), 'icono-gestor.png');
    datos.append('textoAlternativo', `Logo de ${servicio.nombre}`);
    const medio = await llamarApi<{ id: string }>('POST', '/sitio/medios', datos);
    if (!medio.ok) return `El icono del Gestor no se pudo subir: ${medio.error.mensaje}`;
    const r = await llamarApi('PATCH', `/catalogo/servicios/${servicio.id}`, {
      imagenId: medio.datos.id,
    });
    if (!r.ok) return `El icono del Gestor no se pudo poner: ${r.error.mensaje}`;
    servicio.conLogo = true;
    return `${servicio.nombre} ahora usa el icono que tenía en el Gestor.`;
  } catch (e) {
    return `El icono del Gestor no se pudo poner: ${(e as Error).message}`;
  }
}

/** Cuadre origen contra destino de la «Migración a NV Streaming». */
function Comparacion({ filas }: { filas: ComparacionMigracion[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-tinta-suave">
            <th className="py-1 pr-4 font-medium">Dato</th>
            <th className="py-1 pr-4 font-medium">En el Gestor</th>
            <th className="py-1 pr-4 font-medium">En el archivo</th>
            <th className="py-1 font-medium">Se importa</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const cuadra = f.enArchivo === f.enGestor && f.seImporta === f.enGestor;
            return (
              <tr key={f.concepto} className="border-t border-borde/60">
                <td className="py-1.5 pr-4">{f.concepto}</td>
                <td className="py-1.5 pr-4 tabular-nums">{f.enGestor}</td>
                <td className="py-1.5 pr-4 tabular-nums">{f.enArchivo}</td>
                <td className="py-1.5 tabular-nums">
                  <span className={cuadra ? 'text-exito' : 'font-semibold text-aviso'}>
                    {f.seImporta} {cuadra ? '✓' : '≠'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Plataforma({
  p,
  servicios,
  planes,
  moneda,
  icono,
}: {
  p: PlataformaGestor;
  servicios: ServicioImportar[];
  planes: PlanPublico[];
  moneda: Moneda;
  icono?: IconoMigracion;
}) {
  const r = resumenPlataforma(p);
  const parecido = servicios.find((s) =>
    s.nombre.toLowerCase().includes(p.nombre.toLowerCase().split(' ')[0] ?? ''),
  );
  const [servicioId, setServicioId] = useState(parecido?.id ?? '');
  const delServicio = planes.filter((x) => x.servicio.id === servicioId);
  const [planId, setPlanId] = useState(delServicio[0]?.id ?? '');
  const [simulado, setSimulado] = useState<{ clave: string; cuadre: CuadreGestor } | null>(null);
  const [hecho, setHecho] = useState<CuadreGestor | null>(null);
  const [avisoIcono, setAvisoIcono] = useState('');
  const simular = useAccion();
  const importar = useAccion();
  const clave = `${servicioId}|${planId}|${moneda}`;
  const cuerpo = (): ImportarGestorEntrada => ({
    plataforma: { origenId: p.origenId, nombre: p.nombre },
    servicioId,
    planId,
    moneda,
    cuentas: p.cuentas,
    clientesSueltos: p.clientesSueltos ?? [],
  });
  const hayAlgo = (c: CuadreGestor) =>
    c.cuentas.nuevas +
      (c.clientes.sinPerfil ?? 0) +
      (c.perfiles.miembrosRecuperados ?? 0) +
      (c.perfiles.clientesCorregidos ?? 0) +
      (c.perfiles.preciosRecuperados ?? 0) +
      (c.cuentas.rellenadas ?? 0) >
    0;

  if (!p.cuentas.length && !r.sinPerfil) {
    return (
      <li className="rounded-xl border border-borde p-4 text-sm text-tinta-suave">
        <b className="text-tinta">{p.nombre}</b>: no tiene cuentas ni clientes para importar.
      </li>
    );
  }
  return (
    <li className="grid gap-4 rounded-xl border border-borde p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid">
          <b>{p.nombre}</b>
          <span className="text-sm text-tinta-suave">
            {plural(r.cuentas, 'cuenta', 'cuentas')} · {plural(r.perfiles, 'perfil', 'perfiles')} ·{' '}
            {plural(r.asignados, 'cliente', 'clientes')}
            {r.sinPerfil > 0 && <> · {plural(r.sinPerfil, 'cliente', 'clientes')} sin perfil</>}
          </span>
        </div>
        {hecho && <Insignia tono="exito">Importada</Insignia>}
      </div>
      {r.cuentas > MAX_CUENTAS_LOTE_GESTOR ? (
        <Alerta tono="aviso">
          Tiene más de {MAX_CUENTAS_LOTE_GESTOR} cuentas. Divídela en el Gestor o pídenos subir el
          límite.
        </Alerta>
      ) : hecho ? (
        <>
          <Cuadre c={hecho} />
          {avisoIcono && <p className="text-sm text-tinta-suave">{avisoIcono}</p>}
        </>
      ) : (
        <>
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <Selector
              etiqueta="Pasa al servicio"
              value={servicioId}
              onChange={(e) => {
                const s = e.currentTarget.value;
                setServicioId(s);
                setPlanId(planes.find((x) => x.servicio.id === s)?.id ?? '');
              }}
            >
              <option value="">Elige</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Selector>
            <Selector
              etiqueta="Plan de las suscripciones"
              value={planId}
              onChange={(e) => setPlanId(e.currentTarget.value)}
              error={simular.campos.planId}
            >
              <option value="">Elige</option>
              {delServicio.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </Selector>
          </div>
          {simulado?.clave === clave && <Cuadre c={simulado.cuadre} />}
          <ErrorGeneral error={simular.error ?? importar.error} />
          <div className="flex flex-wrap gap-2">
            <Boton
              variante="secundario"
              cargando={simular.cargando}
              disabled={!servicioId || !planId}
              onClick={async () => {
                importar.limpiar();
                const res = await simular.ejecutar<CuadreGestor>(
                  'POST',
                  '/cuentas/gestor/simular',
                  cuerpo(),
                );
                if (res) setSimulado({ clave, cuadre: res.datos });
              }}
            >
              Simular
            </Boton>
            <Boton
              cargando={importar.cargando}
              disabled={simulado?.clave !== clave || !hayAlgo(simulado.cuadre)}
              onClick={async () => {
                const res = await importar.ejecutar<{ cuadre: CuadreGestor }>(
                  'POST',
                  '/cuentas/gestor/importar',
                  cuerpo(),
                );
                if (!res) return;
                setHecho(res.datos.cuadre);
                // El icono del Gestor pasa a la plataforma solo si todavía no tiene logo.
                const servicio = servicios.find((s) => s.id === servicioId);
                if (icono && servicio && !servicio.conLogo) {
                  setAvisoIcono(await ponerIcono(icono, servicio));
                }
              }}
            >
              {simulado?.clave === clave
                ? simulado.cuadre.cuentas.nuevas || simulado.cuadre.cuentas.rellenadas
                  ? `Importar ${plural(simulado.cuadre.cuentas.nuevas + (simulado.cuadre.cuentas.rellenadas ?? 0), 'cuenta', 'cuentas')}`
                  : simulado.cuadre.clientes.sinPerfil
                    ? `Importar ${plural(simulado.cuadre.clientes.sinPerfil, 'cliente', 'clientes')}`
                    : simulado.cuadre.perfiles.clientesCorregidos
                      ? `Corregir ${plural(simulado.cuadre.perfiles.clientesCorregidos, 'cupo', 'cupos')}`
                      : simulado.cuadre.perfiles.miembrosRecuperados
                        ? `Recuperar ${plural(simulado.cuadre.perfiles.miembrosRecuperados, 'miembro', 'miembros')}`
                        : `Guardar ${plural(simulado.cuadre.perfiles.preciosRecuperados ?? 0, 'precio', 'precios')}`
                : 'Importar'}
            </Boton>
          </div>
        </>
      )}
    </li>
  );
}

/** Pasa un lote a otro servicio (p. ej. Gemini Plus que entró en Google One). */
function CambiarPlataforma({
  lote,
  servicios,
  planes,
}: {
  lote: LoteGestorPublico;
  servicios: ServicioImportar[];
  planes: PlanPublico[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [servicioId, setServicioId] = useState('');
  const [planId, setPlanId] = useState('');
  const [vista, setVista] = useState<{ clave: string; c: CambioPlataformaLote } | null>(null);
  const accion = useAccion();
  const clave = `${servicioId}|${planId}`;
  const otros = servicios.filter((s) => s.id !== lote.servicio.id);
  const delServicio = planes.filter((x) => x.servicio.id === servicioId);
  const enviar = (confirmar: boolean) =>
    accion.ejecutar<CambioPlataformaLote>('POST', `/cuentas/gestor/lotes/${lote.id}/plataforma`, {
      servicioId,
      planId,
      confirmar,
    });
  return (
    <>
      <Boton
        tamano="sm"
        variante="fantasma"
        icono={<ArrowRightLeft className="size-3.5" />}
        onClick={() => {
          accion.limpiar();
          setVista(null);
          setServicioId('');
          setPlanId('');
          setAbierto(true);
        }}
      >
        Cambiar plataforma
      </Boton>
      {abierto && (
        <Dialogo
          titulo={`Cambiar de plataforma: ${lote.plataforma}`}
          icono={<ArrowRightLeft className="size-5 text-cian" aria-hidden />}
          onCerrar={() => setAbierto(false)}
          bloquear={accion.cargando}
        >
          <p className="text-sm text-tinta-suave">
            Hoy está en <b className="text-tinta">{lote.servicio.nombre}</b>. Sus cuentas y los
            cupos de sus clientes pasan a la plataforma que elijas. No se borra nada: los clientes,
            fechas y facturas quedan igual. Si la plataforma no existe, créala antes en el Catálogo.
          </p>
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <Selector
              etiqueta="Pasa a la plataforma"
              value={servicioId}
              onChange={(e) => {
                const s = e.currentTarget.value;
                setServicioId(s);
                setPlanId(planes.find((x) => x.servicio.id === s)?.id ?? '');
              }}
              error={accion.campos.servicioId}
            >
              <option value="">Elige</option>
              {otros.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Selector>
            <Selector
              etiqueta="Plan de las suscripciones"
              value={planId}
              onChange={(e) => setPlanId(e.currentTarget.value)}
              error={accion.campos.planId}
            >
              <option value="">Elige</option>
              {delServicio.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </Selector>
          </div>
          {vista?.clave === clave && (
            <Alerta tono={vista.c.hecho ? 'exito' : 'info'}>
              {vista.c.hecho ? 'Listo: pasaron ' : 'Pasarían '}
              {plural(vista.c.cuentas, 'cuenta', 'cuentas')} y{' '}
              {plural(vista.c.suscripciones, 'suscripción', 'suscripciones')}.
            </Alerta>
          )}
          <ErrorGeneral error={accion.error} />
          <div className="flex flex-wrap justify-end gap-2">
            {vista?.clave === clave && vista.c.hecho ? (
              <Boton onClick={() => setAbierto(false)}>Cerrar</Boton>
            ) : (
              <>
                <Boton
                  variante="secundario"
                  cargando={accion.cargando}
                  disabled={!servicioId || !planId}
                  onClick={async () => {
                    const r = await enviar(false);
                    if (r) setVista({ clave, c: r.datos });
                  }}
                >
                  Ver qué cambia
                </Boton>
                <Boton
                  cargando={accion.cargando}
                  disabled={vista?.clave !== clave}
                  onClick={async () => {
                    const r = await enviar(true);
                    if (!r) return;
                    setVista({ clave, c: r.datos });
                    router.refresh();
                  }}
                >
                  Cambiar
                </Boton>
              </>
            )}
          </div>
        </Dialogo>
      )}
    </>
  );
}

function Lotes({
  lotes,
  servicios,
  planes,
}: {
  lotes: LoteGestorPublico[];
  servicios: ServicioImportar[];
  planes: PlanPublico[];
}) {
  const deshacer = useAccion();
  const [cual, setCual] = useState<string | null>(null);
  if (!lotes.length) return null;
  return (
    <Tarjeta>
      <CabeceraTarjeta
        titulo="Lotes importados"
        descripcion="Cada plataforma importada es un lote. Se puede deshacer mientras nada de lo importado tenga facturas, pagos u otros movimientos."
      />
      {deshacer.error && (
        <div className="px-5 pt-4 sm:px-6">
          <ErrorGeneral error={deshacer.error} />
        </div>
      )}
      <Tabla>
        <Encabezados columnas={['Plataforma', 'Servicio', 'Cuentas', 'Clientes', 'Fecha', '']} />
        <Cuerpo>
          {lotes.map((l) => (
            <tr key={l.id}>
              <Celda>{l.plataforma}</Celda>
              <Celda>{l.servicio.nombre}</Celda>
              <Celda className="tabular-nums">{l.cuadre.cuentas.nuevas}</Celda>
              <Celda className="tabular-nums">{l.cuadre.clientes.nuevos}</Celda>
              <Celda className="text-sm text-tinta-suave">
                {formatearFechaHora(l.creadoEn)}
                {l.creadoPor ? ` · ${l.creadoPor}` : ''}
              </Celda>
              <Celda>
                {l.revertidoEn ? (
                  <Insignia>Deshecho</Insignia>
                ) : cual === l.id ? (
                  <span className="flex flex-wrap gap-2">
                    <Boton
                      tamano="sm"
                      variante="peligro"
                      cargando={deshacer.cargando}
                      onClick={async () => {
                        await deshacer.ejecutar('POST', `/cuentas/gestor/lotes/${l.id}/deshacer`);
                        setCual(null);
                      }}
                    >
                      Sí, deshacer
                    </Boton>
                    <Boton tamano="sm" variante="fantasma" onClick={() => setCual(null)}>
                      No
                    </Boton>
                  </span>
                ) : (
                  <span className="flex flex-wrap gap-2">
                    <CambiarPlataforma lote={l} servicios={servicios} planes={planes} />
                    <Boton
                      tamano="sm"
                      variante="fantasma"
                      icono={<Undo2 className="size-3.5" />}
                      onClick={() => {
                        deshacer.limpiar();
                        setCual(l.id);
                      }}
                    >
                      Deshacer
                    </Boton>
                  </span>
                )}
              </Celda>
            </tr>
          ))}
        </Cuerpo>
      </Tabla>
    </Tarjeta>
  );
}

/**
 * Importación del Gestor viejo: la «Copia completa» se lee en este navegador
 * y solo se envía, plataforma por plataforma, lo que se va a importar.
 */
export function ImportarGestor({
  servicios,
  planes,
  lotes,
}: {
  servicios: ServicioImportar[];
  planes: PlanPublico[];
  lotes: LoteGestorPublico[];
}) {
  const [json, setJson] = useState<unknown>(null);
  const [prefijo, setPrefijo] = useState('+58');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [migracion, setMigracion] = useState<ArchivoMigracionGestor | null>(null);
  const [frase, setFrase] = useState('');
  const [abriendo, setAbriendo] = useState(false);

  let respaldo: RespaldoGestor | null = null;
  let errorLectura: string | null = null;
  if (json) {
    try {
      respaldo = leerRespaldoGestor(json, /^\+\d{1,4}$/.test(prefijo) ? prefijo : '+58');
    } catch (e) {
      errorLectura = (e as Error).message;
    }
  }
  const iconos = new Map<string, IconoMigracion>(
    (Array.isArray(migracion?.secciones.iconos)
      ? (migracion.secciones.iconos as IconoMigracion[])
      : []
    ).map((i) => [i.plataformaId, i]),
  );
  const comparacion = respaldo && migracion ? compararMigracion(migracion, respaldo) : null;

  async function abrirMigracion() {
    if (!migracion) return;
    setAbriendo(true);
    setError(null);
    try {
      const cred = await descifrarMigracion(migracion, frase);
      setJson(reconstruirMigracionGestor(migracion, cred));
      setFrase('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAbriendo(false);
    }
  }

  async function cargar(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    setError(null);
    setJson(null);
    setMigracion(null);
    if (!archivo) return;
    if (archivo.size > MAX_BYTES_RESPALDO_GESTOR) {
      setError(
        `El archivo pesa ${Math.round(archivo.size / 1048576)} MB y el máximo es ${Math.round(MAX_BYTES_RESPALDO_GESTOR / 1048576)} MB. Revisa que sea la copia del Gestor.`,
      );
      return;
    }
    let leido: unknown;
    try {
      leido = JSON.parse(await archivo.text());
    } catch {
      setError('No se pudo leer: el archivo no es un JSON válido.');
      return;
    }
    setNombre(archivo.name);
    try {
      if (!esMigracionGestor(leido)) {
        setJson(leido);
        return;
      }
      const malas = await verificarMigracion(leido);
      if (malas.length) {
        setError(
          `El archivo está dañado o fue modificado (no cuadra: ${malas.join(', ')}). Descarga la migración otra vez en el Gestor.`,
        );
        return;
      }
      setMigracion(leido);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Tarjeta>
        <CabeceraTarjeta
          titulo="1. Sube la copia del Gestor"
          descripcion="En el Gestor: Copias de seguridad → «Migración a NV Streaming (cifrada)» (también sirven la «Copia para NV Streaming» y la copia completa). El archivo se lee en este navegador; al panel solo llega lo que importes."
        />
        <div className="grid gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-3">
            <label className="mt-7 inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-borde px-4 text-sm font-medium hover:border-borde-fuerte">
              <FileUp className="size-4" aria-hidden="true" />
              Elegir archivo .json
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={cargar}
              />
            </label>
            <Campo
              etiqueta="Código de país"
              value={prefijo}
              onChange={(e) => setPrefijo(e.currentTarget.value.trim())}
              className="w-40"
              ayuda="Para números sin él."
            />
            <Selector
              etiqueta="Moneda de los clientes"
              value={moneda}
              onChange={(e) => setMoneda(e.currentTarget.value as Moneda)}
              className="w-44"
            >
              {MONEDAS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Selector>
          </div>
          <p className="flex items-start gap-2 text-sm text-tinta-suave">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
            Las claves y los PIN se guardan cifrados. Los clientes importados no reciben mensajes
            hasta que acepten. Cada plataforma queda en un lote que puedes deshacer.
          </p>
          {migracion && !json && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void abrirMigracion();
              }}
            >
              <Alerta tono="exito">
                «{nombre}»: migración del Gestor verificada (sin cambios desde que se descargó el{' '}
                {formatearFechaHora(migracion.manifiesto.creadoEn)}).
              </Alerta>
              <div className="flex flex-wrap items-end gap-3">
                <Campo
                  etiqueta="Frase de la migración"
                  type="password"
                  autoComplete="off"
                  value={frase}
                  onChange={(e) => setFrase(e.currentTarget.value)}
                  className="w-72"
                  ayuda="La que escribiste en el Gestor al descargarla."
                />
                <Boton type="submit" cargando={abriendo} disabled={frase.length < 10}>
                  Abrir migración
                </Boton>
              </div>
            </form>
          )}
          {(error ?? errorLectura) && <Alerta tono="peligro">{error ?? errorLectura}</Alerta>}
          {comparacion && <Comparacion filas={comparacion} />}
          {respaldo && (
            <Alerta tono="exito">
              «{nombre}»: {plural(respaldo.plataformas.length, 'plataforma', 'plataformas')} con{' '}
              {plural(
                respaldo.plataformas.reduce((s, p) => s + p.cuentas.length, 0),
                'cuenta',
                'cuentas',
              )}
              .
            </Alerta>
          )}
          {respaldo && respaldo.avisos.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-aviso">
                {plural(respaldo.avisos.length, 'cosa no se importa', 'cosas no se importan')}
              </summary>
              <ul className="mt-2 list-disc pl-5 text-tinta-suave">
                {respaldo.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Tarjeta>

      {respaldo && respaldo.pendientes.length > 0 && (
        <Tarjeta>
          <CabeceraTarjeta
            titulo={`Pendientes por revisar: ${plural(respaldo.pendientes.length, 'correo', 'correos')} en más de un lugar`}
            descripcion="Se importan tal cual y cada cuenta queda con una nota «Pendiente por revisar» que dice de dónde viene. Nada se junta solo."
          />
          <div className="max-h-80 overflow-y-auto px-5 pb-5 sm:px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-tinta-suave">
                  <th className="py-1 pr-4 font-medium">Correo</th>
                  <th className="py-1 font-medium">Dónde aparece</th>
                </tr>
              </thead>
              <tbody>
                {respaldo.pendientes.map((x) => (
                  <tr key={x.correo} className="border-t border-borde/60 align-top">
                    <td className="py-1.5 pr-4 break-all">{x.correo}</td>
                    <td className="py-1.5">
                      <ul className="grid gap-0.5">
                        {x.lugares.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      {respaldo && respaldo.numerosSupuestos.length > 0 && (
        <Tarjeta>
          <CabeceraTarjeta
            titulo={`Revisa ${plural(respaldo.numerosSupuestos.length, 'número', 'números')} sin código de país`}
            descripcion={`En el Gestor están escritos sin código y se van a guardar con ${prefijo}. Si alguno es de otro país, corrígelo en el Gestor y descarga la migración otra vez, o cámbialo después en Clientes.`}
          />
          <div className="max-h-80 overflow-y-auto px-5 pb-5 sm:px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-tinta-suave">
                  <th className="py-1 pr-4 font-medium">Plataforma</th>
                  <th className="py-1 pr-4 font-medium">Cliente</th>
                  <th className="py-1 pr-4 font-medium">En el Gestor</th>
                  <th className="py-1 font-medium">Se guarda como</th>
                </tr>
              </thead>
              <tbody>
                {respaldo.numerosSupuestos.map((n, i) => (
                  <tr key={i} className="border-t border-borde/60">
                    <td className="py-1.5 pr-4">{n.plataforma}</td>
                    <td className="py-1.5 pr-4">{n.cliente}</td>
                    <td className="py-1.5 pr-4 tabular-nums">{n.escrito}</td>
                    <td className="py-1.5 tabular-nums">{n.guardado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      {respaldo && (
        <Tarjeta>
          <CabeceraTarjeta
            titulo="2. Pasa cada plataforma a un servicio"
            descripcion="Elige el servicio y el plan, simula para ver el cuadre y, si cuadra, importa. Nada se escribe al simular."
          />
          <ul className="grid gap-4 p-5 sm:p-6">
            {respaldo.plataformas.map((p) => (
              <Plataforma
                key={`${nombre}-${p.origenId}-${prefijo}`}
                p={p}
                servicios={servicios}
                planes={planes}
                moneda={moneda}
                icono={iconos.get(p.origenId)}
              />
            ))}
          </ul>
        </Tarjeta>
      )}

      <Lotes lotes={lotes} servicios={servicios} planes={planes} />
    </div>
  );
}
