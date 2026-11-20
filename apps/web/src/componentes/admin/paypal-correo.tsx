'use client';

import type { ConfigPaypalCorreoPublica, CorreoPaypalPublico } from '@nv/shared';
import { Inbox, MailCheck, RefreshCw } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ErrorGeneral, useAccion } from '@/componentes/admin/piezas';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Casilla } from '@/componentes/ui/selector';
import { Celda, Cuerpo, Encabezados, Fila, Tabla } from '@/componentes/ui/tabla';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { formatearFechaHora, haceCuanto } from '@/lib/formato';

const textoDe = (d: FormData, k: string) => {
  const v = d.get(k);
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

const ESTADO_CORREO: Record<
  CorreoPaypalPublico['estado'],
  { texto: string; tono: 'exito' | 'aviso' | 'neutro' }
> = {
  usado: { texto: 'Confirmó un pago', tono: 'exito' },
  libre: { texto: 'Sin pedido', tono: 'aviso' },
  descartado: { texto: 'Descartado', tono: 'neutro' },
};

/** Buzón donde llegan los avisos de PayPal (cuenta personal) y últimos avisos leídos. */
export function ConfigPaypalCorreo({
  config,
  correos,
}: {
  config: ConfigPaypalCorreoPublica;
  correos: CorreoPaypalPublico[];
}) {
  const { cargando, error, campos, ejecutar } = useAccion();
  const prueba = useAccion();
  const lectura = useAccion();
  const [editando, setEditando] = useState(!config.configurada);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('PUT', '/pasarelas/paypal-correo/config', {
      host: textoDe(d, 'host') ?? 'imap.gmail.com',
      puerto: textoDe(d, 'puerto') ?? '993',
      usuario: textoDe(d, 'usuario') ?? '',
      clave: textoDe(d, 'clave'),
      carpeta: textoDe(d, 'carpeta') ?? 'NV-PayPal',
      activo: d.get('activo') === 'on',
    });
    if (r) setEditando(false);
  }

  const lista = config.configurada && config.activo && config.probadoEn;

  return (
    <Tarjeta className="grid gap-5 p-5" aria-labelledby="paypal-correo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="grid size-10 place-items-center rounded-xl border border-borde bg-hundida text-marca"
            aria-hidden="true"
          >
            <MailCheck className="size-5" />
          </span>
          <div>
            <h2 id="paypal-correo" className="text-base font-semibold">
              PayPal personal por correo
            </h2>
            <p className="text-sm text-tinta-suave">
              {config.pista
                ? `Lee ${config.pista}, carpeta «${config.carpeta}».`
                : 'Sin buzón todavía.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {lista ? (
            <Insignia tono="exito">Activa</Insignia>
          ) : config.configurada && !config.probadoEn ? (
            <Insignia tono="aviso">Falta probarla</Insignia>
          ) : config.configurada && !config.activo ? (
            <Insignia>Pausada</Insignia>
          ) : (
            <Insignia tono="aviso">Sin configurar</Insignia>
          )}
        </div>
      </div>

      {config.ultimoError && (
        <Alerta tono="peligro" titulo="La última lectura falló">
          {config.ultimoError}
        </Alerta>
      )}

      {editando ? (
        <form onSubmit={guardar} className="grid gap-4">
          <Alerta tono="info" titulo="Cómo prepararlo en Gmail">
            1) Usa el Gmail donde PayPal te avisa de los pagos (puede ser el mismo de Binance, con
            la misma contraseña de aplicación). 2) Crea un filtro: «De: paypal.com» y «Asunto: Ha
            recibido un pago» → etiqueta «NV-PayPal». NV solo acepta avisos firmados por paypal.com.
          </Alerta>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etiqueta="Correo de Gmail"
              name="usuario"
              type="email"
              required
              autoComplete="off"
              placeholder={config.pista ?? 'tu-correo@gmail.com'}
              error={campos.usuario}
            />
            <Campo
              etiqueta={
                config.configurada
                  ? 'Contraseña de aplicación (vacío = no cambia)'
                  : 'Contraseña de aplicación'
              }
              name="clave"
              type="password"
              required={!config.configurada}
              autoComplete="new-password"
              error={campos.clave}
            />
            <Campo
              etiqueta="Etiqueta o carpeta"
              name="carpeta"
              defaultValue={config.carpeta}
              required
              error={campos.carpeta}
            />
            <Campo
              etiqueta="Servidor IMAP"
              name="host"
              defaultValue={config.host}
              error={campos.host}
            />
            <Campo
              etiqueta="Puerto"
              name="puerto"
              type="number"
              defaultValue={config.puerto}
              error={campos.puerto}
            />
          </div>
          <Casilla
            name="activo"
            etiqueta="Activo"
            ayuda="Si lo pausas, PayPal personal deja de ofrecerse como pago en línea."
            defaultChecked={config.configurada ? config.activo : true}
          />
          <ErrorGeneral error={error} />
          <div className="flex flex-wrap gap-2">
            <Boton type="submit" cargando={cargando}>
              Guardar
            </Boton>
            {config.configurada && (
              <Boton variante="fantasma" onClick={() => setEditando(false)}>
                Cancelar
              </Boton>
            )}
          </div>
        </form>
      ) : (
        <div className="grid gap-3">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-tinta-tenue">Probada</dt>
              <dd>{config.probadoEn ? formatearFechaHora(config.probadoEn) : 'Aún no'}</dd>
            </div>
            <div>
              <dt className="text-xs text-tinta-tenue">Última lectura</dt>
              <dd>{config.ultimaLectura ? haceCuanto(config.ultimaLectura) : 'Aún no'}</dd>
            </div>
            <div>
              <dt className="text-xs text-tinta-tenue">Entrega automática</dt>
              <dd>Streaming, música, IA y software. Lo demás queda en revisión.</dd>
            </div>
          </dl>
          <ErrorGeneral error={prueba.error ?? lectura.error} />
          <div className="flex flex-wrap gap-2">
            <Boton
              cargando={prueba.cargando}
              onClick={() => void prueba.ejecutar('POST', '/pasarelas/paypal-correo/probar')}
            >
              Probar conexión
            </Boton>
            <Boton
              variante="secundario"
              cargando={lectura.cargando}
              disabled={!lista}
              onClick={() => void lectura.ejecutar('POST', '/pasarelas/paypal-correo/leer')}
            >
              <RefreshCw className="size-4" aria-hidden="true" /> Leer ahora
            </Boton>
            <Boton variante="fantasma" onClick={() => setEditando(true)}>
              Cambiar datos
            </Boton>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">Últimos avisos de PayPal</h3>
        {correos.length === 0 ? (
          <EstadoVacio icono={Inbox} titulo="Aún no hay correos">
            Aquí verás cada aviso de PayPal que llegue, a qué pago se asignó o por qué se descartó.
          </EstadoVacio>
        ) : (
          <Tabla>
            <Encabezados columnas={['Recibido', 'Pagador', 'Monto', 'Nota', 'Estado', 'Detalle']} />
            <Cuerpo>
              {correos.map((c) => (
                <Fila key={c.id}>
                  <Celda>{formatearFechaHora(c.recibidoEn)}</Celda>
                  <Celda>{c.pagador ?? '—'}</Celda>
                  <Celda>{c.monto ? `${c.monto} USD` : '—'}</Celda>
                  <Celda>{c.referencia ?? '—'}</Celda>
                  <Celda>
                    <Insignia tono={ESTADO_CORREO[c.estado].tono}>
                      {ESTADO_CORREO[c.estado].texto}
                    </Insignia>
                  </Celda>
                  <Celda className="text-tinta-suave">
                    {c.intento ? `Pago ${c.intento.referencia}` : (c.motivo ?? '—')}
                  </Celda>
                </Fila>
              ))}
            </Cuerpo>
          </Tabla>
        )}
      </div>
    </Tarjeta>
  );
}
