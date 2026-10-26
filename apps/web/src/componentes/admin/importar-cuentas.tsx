'use client';

import {
  type CuentaEncontrada,
  type FilaArchivoCuenta,
  type FilaRevisada,
  type ImportarCuentasEntrada,
  leerArchivoProveedor,
  MAX_BYTES_IMPORTAR,
  MAX_FILAS_IMPORTAR,
  MAX_PERFILES_CUENTA,
  type ModoCuenta,
  type ResultadoImportacion,
  type RevisionImportacion,
  ZONA_HORARIA,
} from '@nv/shared';
import clsx from 'clsx';
import { FileUp, RotateCcw, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { type ChangeEvent, type FormEvent, useMemo, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Insignia } from '@/componentes/ui/insignia';
import { AreaTexto, Selector } from '@/componentes/ui/selector';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import type { ErrorLlamada } from '@/lib/api-cliente';
import { CICLOS_CUENTA, formatearDia } from '@/lib/formato';
import { ErrorGeneral, textoDe, useAccion } from './piezas';

const HOY = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

type Filtro = 'todas' | 'nuevas' | 'cambios' | 'otras' | 'no_estan';

const plural = (n: number, uno: string, varios: string) =>
  n === 1 ? `1 ${uno}` : `${n} ${varios}`;

/** Los errores de una fila llegan como «filas.3.usuario»: se dicen con su línea del archivo. */
function errorDeFilas(error: ErrorLlamada | null, lineas: number[]): string | null {
  for (const [campo, mensajes] of Object.entries(error?.campos ?? {})) {
    const m = /^(?:filas|nuevas)\.(\d+)/.exec(campo);
    if (m && mensajes[0]) {
      const linea = lineas[Number(m[1])];
      return linea ? `Línea ${linea} del archivo: ${mensajes[0]}` : mensajes[0];
    }
  }
  return null;
}

function Guardada({ c }: { c: CuentaEncontrada }) {
  return (
    <Link href={`/admin/cuentas/${c.id}`} className="block hover:text-marca">
      <span className="block font-mono text-xs">{c.pista}</span>
      <span className="block text-xs text-tinta-tenue">
        {c.facturaEn ? `Cobro ${formatearDia(c.facturaEn)}` : 'Sin fecha'}
        {c.estado !== 'activa' ? ` · ${c.estado === 'caida' ? 'caída' : 'retirada'}` : ''}
      </span>
    </Link>
  );
}

function Estado({ f }: { f: FilaRevisada }) {
  if (f.estado === 'nueva') return <Insignia tono="exito">Nueva</Insignia>;
  if (f.estado === 'sin_clave') return <Insignia tono="aviso">Sin clave</Insignia>;
  if (f.estado === 'otro_servicio') {
    return <Insignia tono="aviso">En {f.cuenta?.servicio.nombre ?? 'otro servicio'}</Insignia>;
  }
  if (!f.fechaDistinta && !f.claveDistinta) return <Insignia>Igual</Insignia>;
  return (
    <span className="flex flex-wrap gap-1">
      {f.fechaDistinta && (
        <Insignia tono="marca">{f.fechaPosterior ? 'Renovada' : 'Otra fecha'}</Insignia>
      )}
      {f.claveDistinta && <Insignia tono="peligro">Otra clave</Insignia>}
    </span>
  );
}

function Casilla({
  marcada,
  onCambio,
  etiqueta,
}: {
  marcada: boolean;
  onCambio: (v: boolean) => void;
  etiqueta: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm whitespace-nowrap">
      <input
        type="checkbox"
        className="size-4"
        checked={marcada}
        onChange={(e) => onCambio(e.currentTarget.checked)}
      />
      {etiqueta}
    </label>
  );
}

/**
 * «Verificar con TXT o CSV» del Gestor: el archivo se lee en el navegador,
 * se compara con las cuentas guardadas y no se escribe nada hasta confirmar.
 */
export function ImportarCuentas({ servicios }: { servicios: { id: string; nombre: string }[] }) {
  const revision = useAccion();
  const importacion = useAccion();
  const [texto, setTexto] = useState('');
  const [archivo, setArchivo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [servicioId, setServicioId] = useState(servicios.length === 1 ? servicios[0]!.id : '');
  const [proveedor, setProveedor] = useState('');
  const [leidas, setLeidas] = useState<FilaArchivoCuenta[] | null>(null);
  const [res, setRes] = useState<RevisionImportacion | null>(null);
  const [nuevas, setNuevas] = useState<Set<number>>(new Set());
  const [fechas, setFechas] = useState<Set<number>>(new Set());
  const [claves, setClaves] = useState<Set<number>>(new Set());
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [modo, setModo] = useState<ModoCuenta>('perfiles');
  const [hecho, setHecho] = useState<ResultadoImportacion | null>(null);

  function cargarArchivo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!f) return;
    if (f.size > MAX_BYTES_IMPORTAR) {
      setAviso('El archivo pesa más de 512 KB. Divídelo en partes.');
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      setTexto(String(lector.result ?? ''));
      setArchivo(f.name);
      setAviso(null);
    };
    lector.onerror = () => setAviso('No pudimos leer el archivo.');
    lector.readAsText(f);
  }

  function empezarDeNuevo() {
    setRes(null);
    setLeidas(null);
    setHecho(null);
    setTexto('');
    setArchivo(null);
    setFiltro('todas');
    revision.limpiar();
    importacion.limpiar();
  }

  async function revisar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAviso(null);
    setHecho(null);
    if (!servicioId) return setAviso('Elige el servicio de las cuentas.');
    if (new Blob([texto]).size > MAX_BYTES_IMPORTAR) {
      return setAviso('El texto pesa más de 512 KB. Divídelo en partes.');
    }
    const filas = leerArchivoProveedor(texto, HOY.format(new Date()), archivo ?? undefined).map(
      // Una clave imposible de guardar no se compara.
      (f) => (f.clave && f.clave.length > 200 ? { ...f, clave: null } : f),
    );
    if (!filas.length) return setAviso('No encontramos correos ni usuarios en el archivo.');
    if (filas.length > MAX_FILAS_IMPORTAR) {
      return setAviso(
        `El archivo trae ${filas.length} cuentas. Revisa como máximo ${MAX_FILAS_IMPORTAR} de una vez: divídelo en partes.`,
      );
    }
    const r = await revision.ejecutar<RevisionImportacion>('POST', '/cuentas/importar/revisar', {
      servicioId,
      proveedor: proveedor.trim() || null,
      filas: filas.map((f) => ({ usuario: f.usuario, clave: f.clave, fecha: f.fecha })),
    });
    if (!r) {
      setLeidas(filas);
      return;
    }
    setLeidas(filas);
    setRes(r.datos);
    const de = (p: (f: FilaRevisada) => boolean) =>
      new Set(r.datos.filas.filter(p).map((f) => f.indice));
    setNuevas(de((f) => f.estado === 'nueva'));
    // Por defecto solo se adelanta el cobro cuando el proveedor la renovó; la clave, a mano.
    setFechas(de((f) => f.estado === 'existe' && f.fechaDistinta && f.fechaPosterior));
    setClaves(new Set());
  }

  const visibles = useMemo(() => {
    if (!res) return [];
    return res.filas.filter((f) => {
      if (filtro === 'nuevas') return f.estado === 'nueva';
      if (filtro === 'cambios')
        return f.estado === 'existe' && (f.fechaDistinta || f.claveDistinta);
      if (filtro === 'otras') return f.estado === 'sin_clave' || f.estado === 'otro_servicio';
      return true;
    });
  }, [res, filtro]);

  const cambiar = (set: Set<number>, poner: (s: Set<number>) => void, i: number, v: boolean) => {
    const s = new Set(set);
    if (v) s.add(i);
    else s.delete(i);
    poner(s);
  };

  async function importar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!res || !leidas) return;
    const d = new FormData(e.currentTarget);
    const actualizar = [...new Set([...fechas, ...claves])]
      .sort((a, b) => a - b)
      .map((i) => ({
        cuentaId: res.filas[i]!.cuenta!.id,
        ...(fechas.has(i) && leidas[i]!.fecha ? { facturaEn: leidas[i]!.fecha! } : {}),
        ...(claves.has(i) && leidas[i]!.clave ? { clave: leidas[i]!.clave! } : {}),
      }))
      .filter((a) => 'facturaEn' in a || 'clave' in a);
    const lista = [...nuevas].sort((a, b) => a - b);
    const cuerpo: ImportarCuentasEntrada = {
      servicioId,
      modo,
      perfiles: modo === 'completa' ? 1 : Number(textoDe(d, 'perfiles') ?? 0),
      plan: textoDe(d, 'plan') ?? null,
      pais: textoDe(d, 'pais') ?? null,
      costoUsd: textoDe(d, 'costoUsd') ?? '0',
      cicloMeses: Number(textoDe(d, 'cicloMeses') ?? 1),
      facturaEn: textoDe(d, 'facturaEn') ?? null,
      metodoPago: textoDe(d, 'metodoPago') ?? null,
      proveedor: proveedor.trim() || null,
      ...(lista.length
        ? {
            nuevas: lista.map((i) => ({
              usuario: leidas[i]!.usuario,
              clave: leidas[i]!.clave!,
              fecha: leidas[i]!.fecha,
            })),
          }
        : {}),
      ...(actualizar.length ? { actualizar } : {}),
    };
    const r = await importacion.ejecutar<ResultadoImportacion>('POST', '/cuentas/importar', cuerpo);
    if (r) {
      setHecho(r.datos);
      setRes(null);
      setLeidas(null);
      setTexto('');
      setArchivo(null);
    }
  }

  if (hecho) {
    return (
      <Tarjeta>
        <div className="grid gap-4 p-5 sm:p-6">
          <Alerta tono="exito">
            {[
              hecho.creadas
                ? plural(hecho.creadas, 'cuenta nueva guardada', 'cuentas nuevas guardadas')
                : '',
              hecho.actualizadas
                ? plural(hecho.actualizadas, 'cuenta actualizada', 'cuentas actualizadas')
                : '',
            ]
              .filter(Boolean)
              .join(' y ')}
            .
          </Alerta>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/cuentas?servicioId=${servicioId}`}
              className="inline-flex h-10 items-center rounded-xl border border-borde px-4 text-sm font-medium hover:border-borde-fuerte"
            >
              Ver las cuentas
            </Link>
            <Boton
              variante="fantasma"
              icono={<RotateCcw className="size-4" />}
              onClick={empezarDeNuevo}
            >
              Revisar otro archivo
            </Boton>
          </div>
        </div>
      </Tarjeta>
    );
  }

  const lineas = leidas?.map((f) => f.linea) ?? [];
  const errorFila =
    errorDeFilas(revision.error, lineas) ??
    errorDeFilas(
      importacion.error,
      [...nuevas].sort((a, b) => a - b).map((i) => lineas[i]!),
    );

  if (!res) {
    return (
      <Tarjeta>
        <CabeceraTarjeta
          titulo="1. Archivo del proveedor"
          descripcion="Sube el TXT o CSV, o pega el texto. Entiende «correo:clave fecha», «correo | clave | fecha», bloques con «Correo: … Contraseña: … Vence: …» y CSV con títulos."
        />
        <form onSubmit={revisar} className="grid gap-5 p-5 sm:p-6" noValidate autoComplete="off">
          <div className="grid gap-4 sm:grid-cols-2">
            <Selector
              etiqueta="Servicio de las cuentas"
              name="servicioId"
              value={servicioId}
              onChange={(e) => setServicioId(e.currentTarget.value)}
              required
              error={revision.campos.servicioId}
            >
              <option value="">Elige un servicio</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Selector>
            <Campo
              etiqueta="Proveedor (opcional)"
              name="proveedor"
              value={proveedor}
              onChange={(e) => setProveedor(e.currentTarget.value)}
              maxLength={120}
              ayuda="Así «No están en el archivo» compara solo con sus cuentas."
              error={revision.campos.proveedor}
            />
          </div>
          <div className="grid gap-2">
            <label
              className={clsx(
                'flex cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-dashed border-borde-fuerte px-4 py-3 text-sm',
                'hover:border-marca/60 focus-within:border-marca',
              )}
            >
              <FileUp className="size-4 text-marca" aria-hidden="true" />
              <span className="font-medium">{archivo ?? 'Elegir archivo TXT o CSV'}</span>
              <span className="text-tinta-tenue">hasta 512 KB</span>
              <input
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                className="sr-only"
                onChange={cargarArchivo}
              />
            </label>
            <AreaTexto
              etiqueta="O pega el texto"
              name="texto"
              rows={7}
              value={texto}
              spellCheck={false}
              className="[&_textarea]:font-mono [&_textarea]:text-sm"
              onChange={(e) => {
                setTexto(e.currentTarget.value);
                setArchivo(null);
              }}
            />
          </div>
          <p className="flex gap-2 text-sm text-tinta-suave">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
            El archivo no se sube ni se guarda: se lee en este navegador y solo se envían los
            correos, las claves y las fechas para compararlos. Nada cambia hasta que confirmes.
          </p>
          {aviso && <Alerta tono="aviso">{aviso}</Alerta>}
          {errorFila ? (
            <Alerta tono="peligro">{errorFila}</Alerta>
          ) : (
            <ErrorGeneral error={revision.error} />
          )}
          <div>
            <Boton type="submit" cargando={revision.cargando} disabled={!texto.trim()}>
              Revisar
            </Boton>
          </div>
        </form>
      </Tarjeta>
    );
  }

  const c = res.conteo;
  const totalActualizar = new Set([...fechas, ...claves]).size;
  const filtros: [Filtro, string, number][] = [
    ['todas', 'Todas', res.filas.length],
    ['nuevas', 'Nuevas', c.nuevas],
    [
      'cambios',
      'Con cambios',
      res.filas.filter((f) => f.estado === 'existe' && (f.fechaDistinta || f.claveDistinta)).length,
    ],
    ['otras', 'Sin clave u otro servicio', c.sinClave + c.otroServicio],
    ['no_estan', 'No están en el archivo', c.noEstan],
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Tarjeta>
        <CabeceraTarjeta
          titulo="2. Lo que encontramos"
          descripcion={`${plural(res.filas.length, 'cuenta leída', 'cuentas leídas')}${archivo ? ` de ${archivo}` : ''}. Todavía no se guardó nada.`}
        />
        <div className="grid gap-3 px-5 pt-1 pb-4 sm:px-6">
          <nav aria-label="Filtrar filas" className="flex flex-wrap gap-2">
            {filtros.map(([id, t, n]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filtro === id}
                onClick={() => setFiltro(id)}
                className={clsx(
                  'rounded-full border px-3 py-1.5 text-sm tabular-nums',
                  filtro === id
                    ? 'border-marca/60 bg-marca/10 text-tinta'
                    : 'border-borde text-tinta-suave hover:border-borde-fuerte hover:text-tinta',
                )}
              >
                {t} · {n}
              </button>
            ))}
          </nav>
          {c.claveDistinta > 0 && (
            <Alerta tono="aviso">
              {plural(c.claveDistinta, 'cuenta tiene', 'cuentas tienen')} otra clave en el archivo.
              Marca «Usar la clave del archivo» solo si el proveedor la cambió: tus clientes verán
              la nueva.
            </Alerta>
          )}
        </div>
        {filtro === 'no_estan' ? (
          res.noEstan.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-tinta-suave sm:px-6">
              Todas las cuentas guardadas de este servicio vienen en el archivo.
            </p>
          ) : (
            <>
              <p className="px-5 pb-3 text-sm text-tinta-suave sm:px-6">
                Guardadas aquí pero no vienen en el archivo. Revisa con el proveedor si siguen
                activas; desde la ficha puedes marcarlas como caídas o retiradas.
              </p>
              <Tabla minimo="32rem">
                <Encabezados columnas={['Cuenta guardada', 'Proveedor', 'Estado']} />
                <Cuerpo>
                  {res.noEstan.map((n) => (
                    <tr key={n.id}>
                      <Celda primera>
                        <Guardada c={n} />
                      </Celda>
                      <Celda className="text-tinta-suave">{n.proveedor ?? '—'}</Celda>
                      <Celda>
                        <Insignia tono={n.estado === 'activa' ? 'neutro' : 'aviso'}>
                          {n.estado === 'activa' ? 'Activa' : 'Caída'}
                        </Insignia>
                      </Celda>
                    </tr>
                  ))}
                </Cuerpo>
              </Tabla>
            </>
          )
        ) : visibles.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-tinta-suave sm:px-6">No hay filas con ese filtro.</p>
        ) : (
          <Tabla minimo="52rem">
            <Encabezados
              columnas={[
                'Línea',
                'Correo o usuario',
                'Fecha del archivo',
                'Guardada',
                'Estado',
                'Qué hacer',
              ]}
            />
            <Cuerpo>
              {visibles.map((f) => {
                const l = leidas?.[f.indice];
                return (
                  <tr key={f.indice}>
                    <Celda primera className="text-tinta-tenue tabular-nums">
                      {l?.linea}
                      {l && l.veces > 1 && (
                        <span className="block text-xs text-aviso">{l.veces} veces</span>
                      )}
                    </Celda>
                    <Celda className="max-w-64 font-mono text-xs break-all">{l?.usuario}</Celda>
                    <Celda className="whitespace-nowrap">
                      {l?.fecha ? (
                        formatearDia(l.fecha)
                      ) : (
                        <span className="text-tinta-tenue">Sin fecha</span>
                      )}
                    </Celda>
                    <Celda>
                      {f.cuenta ? (
                        <Guardada c={f.cuenta} />
                      ) : (
                        <span className="text-tinta-tenue">—</span>
                      )}
                    </Celda>
                    <Celda>
                      <Estado f={f} />
                    </Celda>
                    <Celda>
                      {f.estado === 'nueva' ? (
                        <Casilla
                          etiqueta="Importar"
                          marcada={nuevas.has(f.indice)}
                          onCambio={(v) => cambiar(nuevas, setNuevas, f.indice, v)}
                        />
                      ) : f.estado === 'existe' &&
                        (f.fechaDistinta || f.claveDistinta || f.fechaPosterior) ? (
                        <div className="grid gap-1">
                          {(f.fechaDistinta || f.fechaPosterior) && l?.fecha && (
                            <Casilla
                              etiqueta="Usar su fecha"
                              marcada={fechas.has(f.indice)}
                              onCambio={(v) => cambiar(fechas, setFechas, f.indice, v)}
                            />
                          )}
                          {f.claveDistinta && (
                            <Casilla
                              etiqueta="Usar la clave del archivo"
                              marcada={claves.has(f.indice)}
                              onCambio={(v) => cambiar(claves, setClaves, f.indice, v)}
                            />
                          )}
                        </div>
                      ) : f.estado === 'sin_clave' ? (
                        <span className="text-xs text-tinta-tenue">
                          Falta la clave para importarla
                        </span>
                      ) : f.estado === 'otro_servicio' ? (
                        <span className="text-xs text-tinta-tenue">Revisa el servicio</span>
                      ) : (
                        <span className="text-xs text-tinta-tenue">Nada</span>
                      )}
                    </Celda>
                  </tr>
                );
              })}
            </Cuerpo>
          </Tabla>
        )}
      </Tarjeta>

      <Tarjeta>
        <CabeceraTarjeta
          titulo="3. Confirmar"
          descripcion="Las cuentas nuevas se guardan cifradas con estos datos. Si una fila no trae fecha, usa el próximo cobro de abajo."
        />
        <form onSubmit={importar} className="grid gap-5 p-5 sm:p-6" noValidate autoComplete="off">
          {nuevas.size > 0 && (
            <>
              <div className="grid items-start gap-4 sm:grid-cols-3">
                <Selector
                  etiqueta="Cómo se venden"
                  name="modo"
                  value={modo}
                  onChange={(e) => setModo(e.currentTarget.value as ModoCuenta)}
                >
                  <option value="perfiles">Por perfiles</option>
                  <option value="completa">Cuenta completa</option>
                </Selector>
                {modo === 'perfiles' ? (
                  <Campo
                    etiqueta="Perfiles de cada cuenta"
                    name="perfiles"
                    type="number"
                    min={1}
                    max={MAX_PERFILES_CUENTA}
                    defaultValue={5}
                    error={importacion.campos.perfiles}
                  />
                ) : (
                  <div className="grid content-start gap-1.5">
                    <span className="text-sm font-semibold">Perfiles</span>
                    <p className="flex h-11 items-center rounded-xl border border-borde bg-hundida px-3.5 text-[0.95rem] text-tinta-suave">
                      Un solo cupo
                    </p>
                  </div>
                )}
                <Campo
                  etiqueta="Plan (opcional)"
                  name="plan"
                  maxLength={60}
                  error={importacion.campos.plan}
                />
                <Campo
                  etiqueta="Costo de cada cobro (USD)"
                  name="costoUsd"
                  inputMode="decimal"
                  placeholder="0.00"
                  error={importacion.campos.costoUsd}
                />
                <Selector
                  etiqueta="El proveedor cobra"
                  name="cicloMeses"
                  defaultValue="1"
                  error={importacion.campos.cicloMeses}
                >
                  {CICLOS_CUENTA.map(([m, t]) => (
                    <option key={m} value={m}>
                      {t}
                    </option>
                  ))}
                </Selector>
                <Campo
                  etiqueta="Próximo cobro si no trae fecha"
                  name="facturaEn"
                  type="date"
                  error={importacion.campos.facturaEn}
                />
                <Campo
                  etiqueta="Cómo las pagas (opcional)"
                  name="metodoPago"
                  maxLength={60}
                  placeholder="Tarjeta ···· 1234"
                  ayuda="Nunca el número completo de la tarjeta."
                  error={importacion.campos.metodoPago}
                />
                <Campo
                  etiqueta="País (opcional)"
                  name="pais"
                  maxLength={2}
                  placeholder="VE"
                  error={importacion.campos.pais}
                />
              </div>
            </>
          )}
          <p className="text-sm text-tinta-suave">
            {nuevas.size || totalActualizar
              ? [
                  nuevas.size
                    ? `${nuevas.size === 1 ? 'Se guarda' : 'Se guardan'} ${plural(nuevas.size, 'cuenta nueva', 'cuentas nuevas')}`
                    : '',
                  totalActualizar
                    ? `${nuevas.size ? 'y se' : 'Se'} ${totalActualizar === 1 ? 'actualiza' : 'actualizan'} ${plural(totalActualizar, 'cuenta', 'cuentas')}`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ') + '. Todo junto: si algo falla, no se guarda nada.'
              : 'No marcaste nada para guardar.'}
          </p>
          {errorFila ? (
            <Alerta tono="peligro">{errorFila}</Alerta>
          ) : (
            <ErrorGeneral error={importacion.error} />
          )}
          <div className="flex flex-wrap gap-2">
            <Boton
              type="submit"
              cargando={importacion.cargando}
              disabled={!nuevas.size && !totalActualizar}
            >
              Confirmar
            </Boton>
            <Boton
              variante="fantasma"
              icono={<RotateCcw className="size-4" />}
              onClick={empezarDeNuevo}
            >
              Empezar de nuevo
            </Boton>
          </div>
        </form>
      </Tarjeta>
    </div>
  );
}
