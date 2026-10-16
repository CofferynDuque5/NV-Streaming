'use client';

import { MAX_CODIGOS_POR_LOTE, type ResultadoLote } from '@nv/shared';
import { Ban, FileUp, Upload } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { AreaTexto } from '@/componentes/ui/selector';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Subir un lote de códigos: se pegan (uno por línea) o se elige un archivo de
 * texto o CSV, que se lee en el navegador. La respuesta solo cuenta: nunca
 * repite los códigos.
 */
export function SubirLote({ planId }: { planId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [archivo, setArchivo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);
  const { cargando, error, campos, ejecutar } = useAccion();
  const lineas = texto.split(/\r\n|\r|\n/).filter((l) => l.trim()).length;

  async function leerArchivo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    if (f.size > 1_000_000) {
      setArchivo('El archivo es demasiado grande (máximo 1 MB).');
      return;
    }
    setTexto(await f.text());
    setArchivo(f.name);
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar<ResultadoLote>('POST', `/inventario/planes/${planId}/lotes`, {
      nombre: textoDe(d, 'nombre') ?? '',
      texto,
      venceEn: textoDe(d, 'venceEn'),
    });
    if (r) {
      setResultado(r.datos);
      setTexto('');
      setArchivo(null);
      setAbierto(false);
    }
  }

  return (
    <div className="grid gap-3">
      {resultado && (
        <Alerta tono="exito" titulo={`Lote «${resultado.lote.nombre}» añadido`}>
          {plural(resultado.anadidos, 'código nuevo', 'códigos nuevos')}
          {resultado.repetidosEnArchivo > 0 &&
            `, ${plural(resultado.repetidosEnArchivo, 'repetido en el archivo', 'repetidos en el archivo')}`}
          {resultado.yaExistentes > 0 &&
            `, ${plural(resultado.yaExistentes, 'ya estaba en el inventario', 'ya estaban en el inventario')}`}
          {resultado.invalidos.length > 0 &&
            `, ${plural(resultado.invalidos.length, 'línea no válida', 'líneas no válidas')} (${resultado.invalidos
              .slice(0, 5)
              .map((i) => `línea ${i.linea}: ${i.motivo.toLowerCase()}`)
              .join('; ')})`}
          .
          {resultado.entregasReintentadas > 0 &&
            ` ${plural(resultado.entregasReintentadas, 'entrega que esperaba códigos se está haciendo', 'entregas que esperaban códigos se están haciendo')} ahora.`}
        </Alerta>
      )}
      {!abierto ? (
        <div>
          <Boton
            icono={<Upload className="size-4" aria-hidden="true" />}
            onClick={() => setAbierto(true)}
          >
            Subir lote de códigos
          </Boton>
        </div>
      ) : (
        <PanelFormulario
          titulo="Subir lote de códigos"
          descripcion={`Uno por línea, o un CSV con el código en la primera columna. Hasta ${MAX_CODIGOS_POR_LOTE} por lote. Se guardan cifrados y los repetidos se descartan.`}
          onCerrar={() => setAbierto(false)}
        >
          <form onSubmit={enviar} className="grid gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
              <Campo
                etiqueta="Nombre del lote"
                name="nombre"
                required
                maxLength={120}
                placeholder="Ej.: Factura 1234 del distribuidor"
                error={campos.nombre}
              />
              <Campo
                etiqueta="Vencen el"
                name="venceEn"
                type="date"
                ayuda="Opcional."
                error={campos.venceEn}
              />
            </div>
            <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-borde-fuerte bg-hundida/50 px-4 py-3 text-sm hover:border-marca focus-within:outline-2 focus-within:outline-marca">
              <FileUp className="size-4 shrink-0 text-marca" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                {archivo ?? 'Elegir un archivo .txt o .csv'}
              </span>
              <input
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                className="sr-only"
                onChange={(e) => void leerArchivo(e)}
              />
            </label>
            <AreaTexto
              etiqueta="Códigos"
              name="texto"
              rows={6}
              value={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
              placeholder={'ABCD-EFGH-0001\nABCD-EFGH-0002'}
              ayuda={
                lineas ? plural(lineas, 'línea', 'líneas') : 'Pega los códigos o elige un archivo.'
              }
              error={campos.texto}
              spellCheck={false}
              autoComplete="off"
              className="font-mono"
            />
            <Alerta tono="info">
              Solo códigos, tarjetas o activaciones oficiales del distribuidor. Nunca usuarios ni
              contraseñas de cuentas: esas líneas se rechazan.
            </Alerta>
            <ErrorGeneral error={error} />
            <div className="flex flex-wrap gap-2">
              <Boton type="submit" cargando={cargando} disabled={!texto.trim()}>
                Subir lote
              </Boton>
              <Boton variante="fantasma" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
            </div>
          </form>
        </PanelFormulario>
      )}
    </div>
  );
}

/** Anular un código disponible (por ejemplo, porque el distribuidor lo invalidó). */
export function AnularCodigo({ id, huella }: { id: string; huella: string }) {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('POST', `/inventario/codigos/${id}/anular`, {
      motivo: textoDe(d, 'motivo') ?? '',
    });
    if (r) setAbierto(false);
  }

  if (!abierto) {
    return (
      <Boton
        variante="fantasma"
        tamano="sm"
        icono={<Ban className="size-3.5" aria-hidden="true" />}
        onClick={() => setAbierto(true)}
        aria-label={`Anular el código ${huella}`}
      >
        Anular
      </Boton>
    );
  }
  return (
    <form onSubmit={enviar} className="grid min-w-64 gap-2" noValidate>
      <Campo
        etiqueta="Motivo"
        name="motivo"
        required
        maxLength={300}
        placeholder="Ej.: el distribuidor lo invalidó"
        error={campos.motivo}
      />
      <ErrorGeneral error={error} />
      <div className="flex gap-2">
        <Boton type="submit" tamano="sm" variante="peligro" cargando={cargando}>
          Anular código
        </Boton>
        <Boton tamano="sm" variante="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
