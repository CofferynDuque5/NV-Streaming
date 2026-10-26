'use client';

import {
  type CuadreGestor,
  type ImportarGestorEntrada,
  leerRespaldoGestor,
  type LoteGestorPublico,
  MAX_BYTES_RESPALDO_GESTOR,
  MAX_CUENTAS_LOTE_GESTOR,
  type Moneda,
  MONEDAS,
  type PlanPublico,
  type PlataformaGestor,
  type RespaldoGestor,
  resumenPlataforma,
} from '@nv/shared';
import { FileUp, ShieldCheck, Undo2 } from 'lucide-react';
import { type ChangeEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Insignia } from '@/componentes/ui/insignia';
import { Selector } from '@/componentes/ui/selector';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { formatearFechaHora, formatearMonto } from '@/lib/formato';
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

function Plataforma({
  p,
  servicios,
  planes,
  moneda,
}: {
  p: PlataformaGestor;
  servicios: { id: string; nombre: string }[];
  planes: PlanPublico[];
  moneda: Moneda;
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
  const simular = useAccion();
  const importar = useAccion();
  const clave = `${servicioId}|${planId}|${moneda}`;
  const cuerpo = (): ImportarGestorEntrada => ({
    plataforma: { origenId: p.origenId, nombre: p.nombre },
    servicioId,
    planId,
    moneda,
    cuentas: p.cuentas,
  });

  if (!p.cuentas.length) {
    return (
      <li className="rounded-xl border border-borde p-4 text-sm text-tinta-suave">
        <b className="text-tinta">{p.nombre}</b>: no tiene cuentas para importar.
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
        <Cuadre c={hecho} />
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
              disabled={simulado?.clave !== clave || !simulado.cuadre.cuentas.nuevas}
              onClick={async () => {
                const res = await importar.ejecutar<{ cuadre: CuadreGestor }>(
                  'POST',
                  '/cuentas/gestor/importar',
                  cuerpo(),
                );
                if (res) setHecho(res.datos.cuadre);
              }}
            >
              {simulado?.clave === clave
                ? `Importar ${plural(simulado.cuadre.cuentas.nuevas, 'cuenta', 'cuentas')}`
                : 'Importar'}
            </Boton>
          </div>
        </>
      )}
    </li>
  );
}

function Lotes({ lotes }: { lotes: LoteGestorPublico[] }) {
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
  servicios: { id: string; nombre: string }[];
  planes: PlanPublico[];
  lotes: LoteGestorPublico[];
}) {
  const [json, setJson] = useState<unknown>(null);
  const [prefijo, setPrefijo] = useState('+58');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');

  let respaldo: RespaldoGestor | null = null;
  let errorLectura: string | null = null;
  if (json) {
    try {
      respaldo = leerRespaldoGestor(json, /^\+\d{1,4}$/.test(prefijo) ? prefijo : '+58');
    } catch (e) {
      errorLectura = (e as Error).message;
    }
  }

  async function cargar(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    setError(null);
    setJson(null);
    if (!archivo) return;
    if (archivo.size > MAX_BYTES_RESPALDO_GESTOR) {
      setError('El archivo es demasiado grande para ser una copia del Gestor.');
      return;
    }
    try {
      setJson(JSON.parse(await archivo.text()));
      setNombre(archivo.name);
    } catch {
      setError('No se pudo leer: el archivo no es un JSON válido.');
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Tarjeta>
        <CabeceraTarjeta
          titulo="1. Sube la copia del Gestor"
          descripcion="En el Gestor: Copias → «Guardar copia completa». El archivo se lee en este navegador; al panel solo llega lo que importes."
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
          {(error ?? errorLectura) && <Alerta tono="peligro">{error ?? errorLectura}</Alerta>}
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
              />
            ))}
          </ul>
        </Tarjeta>
      )}

      <Lotes lotes={lotes} />
    </div>
  );
}
