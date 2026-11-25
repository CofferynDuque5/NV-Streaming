'use client';

import {
  ACCIONES_POR_PLATAFORMA,
  ACCIONES_PROVEEDOR,
  type AccionProveedor,
  type BuzonPublico,
  type ConectorPublico,
  NOMBRE_ACCION_PROVEEDOR,
  type PlataformaProveedor,
  type ResultadoProveedor,
} from '@nv/shared';
import { ExternalLink, Plug, Wand2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { BotonCopiar } from '@/componentes/accesos';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Insignia } from '@/componentes/ui/insignia';
import { Casilla, Selector } from '@/componentes/ui/selector';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { formatearFechaHora } from '@/lib/formato';
import { ErrorGeneral, textoDe, useAccion } from './piezas';

const ESTADO: Record<
  ConectorPublico['estado'],
  { texto: string; tono: 'exito' | 'aviso' | 'peligro' | 'neutro' }
> = {
  sin_probar: { texto: 'Sin probar', tono: 'neutro' },
  conectado: { texto: 'Conectado', tono: 'exito' },
  esperando_aprobacion: { texto: 'Esperando aprobación de IP', tono: 'aviso' },
  error: { texto: 'Con error', tono: 'peligro' },
};

const PLATAFORMAS: { clave: PlataformaProveedor; nombre: string }[] = [
  { clave: 'netflix', nombre: 'Netflix' },
  { clave: 'disney', nombre: 'Disney+' },
  { clave: 'hbo', nombre: 'HBO Max' },
];

/** Configuración del conector con el panel de ikercuentas y prueba de cada botón. */
export function ConectorProveedor({
  conector,
  buzones,
}: {
  conector: ConectorPublico;
  buzones: BuzonPublico[];
}) {
  const { cargando, error, ejecutar } = useAccion();
  const prueba = useAccion();
  const campos = erroresPorCampo(error);
  const estado = ESTADO[conector.estado];

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await ejecutar('PUT', '/codigos/conector', {
      activo: d.get('activo') === 'on',
      urlBase: textoDe(d, 'urlBase') ?? '',
      usuario: textoDe(d, 'usuario') ?? '',
      clave: String(d.get('clave') ?? ''),
      marcaProveedor: textoDe(d, 'marcaProveedor') ?? '',
      buzonId: textoDe(d, 'buzonId') ?? null,
      carpetaAprobacion: textoDe(d, 'carpetaAprobacion') ?? 'INBOX',
      remitenteAprobacion: textoDe(d, 'remitenteAprobacion') ?? '',
      accionesCliente: ACCIONES_PROVEEDOR.filter((a) => d.get(`accion_${a}`) === 'on'),
    });
  }

  return (
    <div className="grid gap-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Insignia tono={estado.tono}>{estado.texto}</Insignia>
        {conector.probadoEn && (
          <span className="text-tinta-tenue">
            Última vez: {formatearFechaHora(conector.probadoEn)}
          </span>
        )}
      </div>
      {conector.ultimoError && (
        <Alerta tono={conector.estado === 'esperando_aprobacion' ? 'aviso' : 'peligro'}>
          {conector.ultimoError}
        </Alerta>
      )}

      <form onSubmit={guardar} className="@container grid gap-4" noValidate autoComplete="off">
        <div className="grid gap-4 @xl:grid-cols-2">
          <Campo
            etiqueta="Dirección del panel"
            name="urlBase"
            defaultValue={conector.urlBase}
            spellCheck={false}
            error={campos.urlBase}
          />
          <Campo
            etiqueta="Proveedor en tus cuentas"
            name="marcaProveedor"
            defaultValue={conector.marcaProveedor}
            ayuda="Las cuentas cuyo campo «Proveedor» contenga este texto usan estos botones."
            error={campos.marcaProveedor}
          />
          <Campo
            etiqueta={
              conector.pista ? `Correo del panel (ahora ${conector.pista})` : 'Correo del panel'
            }
            name="usuario"
            spellCheck={false}
            autoComplete="off"
            placeholder={conector.pista ? 'Vacío: se queda igual' : 'tucorreo@gmail.com'}
            error={campos.usuario}
          />
          <Campo
            etiqueta={conector.tieneClave ? 'Clave nueva' : 'Clave del panel'}
            name="clave"
            type="password"
            autoComplete="new-password"
            placeholder={conector.tieneClave ? 'Vacío: se queda igual' : undefined}
            error={campos.clave}
          />
          <Selector
            etiqueta="Buzón donde llega «Nuevo dispositivo detectado»"
            name="buzonId"
            defaultValue={conector.buzonId ?? ''}
            ayuda="El servidor lee ese correo y aprueba la IP solo."
            error={campos.buzonId}
          >
            <option value="">Ninguno (aprobaré a mano)</option>
            {buzones.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre} ({b.pista})
              </option>
            ))}
          </Selector>
          <Campo
            etiqueta="Carpeta del correo de aprobación"
            name="carpetaAprobacion"
            defaultValue={conector.carpetaAprobacion}
            ayuda="Normalmente INBOX (la bandeja de entrada)."
            error={campos.carpetaAprobacion}
          />
          <Campo
            etiqueta="Remitente del correo de aprobación"
            name="remitenteAprobacion"
            defaultValue={conector.remitenteAprobacion}
            spellCheck={false}
            ayuda="Solo se aprueban enlaces de este remitente."
            error={campos.remitenteAprobacion}
          />
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">
            Botones que ven clientes y revendedores
          </legend>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {ACCIONES_PROVEEDOR.map((a) => (
              <Casilla
                key={a}
                name={`accion_${a}`}
                etiqueta={NOMBRE_ACCION_PROVEEDOR[a]}
                defaultChecked={conector.accionesCliente.includes(a)}
              />
            ))}
          </div>
        </fieldset>
        <Casilla
          name="activo"
          etiqueta="Activo"
          ayuda="Si lo desactivas, los clientes dejan de ver estos botones."
          defaultChecked={conector.activo}
        />
        <p className="text-xs text-tinta-tenue">
          El correo, la clave y la sesión se guardan cifrados. Los códigos nunca se guardan.
        </p>
        <ErrorGeneral error={error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={cargando}>
            Guardar
          </Boton>
          <Boton
            variante="secundario"
            cargando={prueba.cargando}
            icono={<Plug className="size-3.5" />}
            onClick={() => void prueba.ejecutar('POST', '/codigos/conector/probar')}
          >
            Probar entrada
          </Boton>
        </div>
        <ErrorGeneral error={prueba.error} />
        {prueba.cargando && (
          <p className="text-xs text-tinta-tenue">
            Entrando al panel… si pide aprobar la IP, se espera el correo hasta 2 minutos.
          </p>
        )}
      </form>

      <ProbarBoton />

      {conector.diagnostico && (
        <details className="text-xs text-tinta-suave">
          <summary className="cursor-pointer">Lo último que vio el servidor en el panel</summary>
          <dl className="mt-2 grid gap-1">
            <div>
              <dt className="inline font-medium">Paso: </dt>
              <dd className="inline">{conector.diagnostico.paso}</dd>
            </div>
            {conector.diagnostico.botones.length > 0 && (
              <div>
                <dt className="inline font-medium">Botones de la fila: </dt>
                <dd className="inline">{conector.diagnostico.botones.join(' · ')}</dd>
              </div>
            )}
            {conector.diagnostico.rutas.length > 0 && (
              <div>
                <dt className="inline font-medium">Llamadas: </dt>
                <dd className="inline break-all">{conector.diagnostico.rutas.join(' · ')}</dd>
              </div>
            )}
            {conector.diagnostico.avisos.length > 0 && (
              <div>
                <dt className="inline font-medium">Avisos: </dt>
                <dd className="inline">{conector.diagnostico.avisos.join(' · ')}</dd>
              </div>
            )}
          </dl>
        </details>
      )}
    </div>
  );
}

/** El equipo pulsa cualquier botón para un correo escrito a mano. */
function ProbarBoton() {
  const [plataforma, setPlataforma] = useState<PlataformaProveedor>('netflix');
  const [correo, setCorreo] = useState('');
  const [cargando, setCargando] = useState<AccionProveedor | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [resultado, setResultado] = useState<ResultadoProveedor | null>(null);

  async function pedir(accion: AccionProveedor) {
    setCargando(accion);
    setError(null);
    setResultado(null);
    const r = await llamarApi<ResultadoProveedor>('POST', '/codigos/conector/pedir', {
      correo,
      plataforma,
      accion,
    });
    setCargando(null);
    if (!r.ok) return setError(r.error);
    setResultado(r.datos);
  }

  return (
    <div className="@container grid gap-3 border-t border-borde pt-5">
      <h3 className="text-sm font-semibold">Pedir un código a mano</h3>
      <div className="grid gap-3 @xl:grid-cols-[12rem_1fr]">
        <Selector
          etiqueta="Plataforma"
          value={plataforma}
          onChange={(e) => setPlataforma(e.currentTarget.value as PlataformaProveedor)}
        >
          {PLATAFORMAS.map((p) => (
            <option key={p.clave} value={p.clave}>
              {p.nombre}
            </option>
          ))}
        </Selector>
        <Campo
          etiqueta="Correo de la cuenta"
          value={correo}
          onChange={(e) => setCorreo(e.currentTarget.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder="cuenta@platonuma.com"
          error={erroresPorCampo(error).correo}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {ACCIONES_POR_PLATAFORMA[plataforma].map((a) => (
          <Boton
            key={a}
            variante="secundario"
            tamano="sm"
            cargando={cargando === a}
            disabled={!correo.trim() || (cargando !== null && cargando !== a)}
            icono={<Wand2 className="size-3.5" />}
            onClick={() => void pedir(a)}
          >
            {NOMBRE_ACCION_PROVEEDOR[a]}
          </Boton>
        ))}
      </div>
      {cargando && (
        <p className="text-xs text-tinta-tenue">
          Buscando en el panel… puede tardar hasta un minuto.
        </p>
      )}
      <ErrorGeneral error={error} />
      {resultado && (
        <div aria-live="polite" className="grid gap-2">
          {resultado.codigo && (
            <div className="flex items-center justify-between gap-3 rounded-[0.875rem] bg-cian/[0.07] px-3.5 py-3">
              <b className="font-mono text-[1.375rem] tracking-[0.18em] select-all">
                {resultado.codigo}
              </b>
              <BotonCopiar texto={resultado.codigo} que="el código" />
            </div>
          )}
          {resultado.enlace && (
            <a
              href={resultado.enlace.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-2 justify-self-start rounded-[0.875rem] border border-cian bg-cian/[0.08] px-3.5 py-2 text-sm font-semibold hover:bg-cian/[0.14]"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Abrir el enlace
            </a>
          )}
          {resultado.mensaje && <p className="text-sm text-tinta-suave">{resultado.mensaje}</p>}
        </div>
      )}
    </div>
  );
}
