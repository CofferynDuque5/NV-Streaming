import type { ConfiguracionAsistentePublica } from '@nv/shared';
import { Cpu } from 'lucide-react';
import type { Metadata } from 'next';
import { FormularioAsistente } from '@/componentes/admin/asistente-configuracion';
import { PestanasAsistente } from '@/componentes/admin/piezas-asistente';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, Fila, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { AYUDA_PROVEEDOR, formatearNumero, nombreMes, nombreProveedor } from '@/lib/asistente';
import { formatearFechaHora } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Configuración del asistente' };

export default async function ConfiguracionAsistente() {
  await requerirSesion({ permiso: 'asistente.configurar' });
  const { datos: config } = await leerApi<ConfiguracionAsistentePublica>(
    '/asistente/configuracion',
  );
  // Los meses de uso van en hora de Caracas (UTC−4).
  const caracas = new Date(new Date().getTime() - 4 * 3_600_000);
  const mesActual = caracas.toISOString().slice(0, 7);
  caracas.setUTCDate(1);
  caracas.setUTCMonth(caracas.getUTCMonth() - 1);
  const mesAnterior = caracas.toISOString().slice(0, 7);
  const uso = (config?.usoMes ?? [])
    .filter((u) => u.mes.slice(0, 7) >= mesAnterior)
    .sort((a, b) => b.mes.localeCompare(a.mes) || a.proveedor.localeCompare(b.proveedor));

  return (
    <>
      <CabeceraPagina
        titulo="Asistente"
        descripcion="Pregunta en lenguaje natural por clientes, vencimientos, cobros y tickets. Si algo requiere un cambio, te lo propone y tú decides."
      />
      <PestanasAsistente vista="configuracion" puedeConfigurar />

      {!config ? (
        <Alerta tono="peligro" titulo="No pudimos cargar la configuración del asistente">
          Recarga la página. Si sigue fallando, revisa que la API esté en marcha.
        </Alerta>
      ) : (
        <>
          <Tarjeta>
            <CabeceraTarjeta
              titulo="Configuración"
              descripcion="El asistente usa los permisos de quien pregunta y nunca ejecuta cambios sin una confirmación."
            />
            <div className="grid gap-4 px-5 py-5 sm:px-6">
              <FormularioAsistente config={config} />
              <p className="text-xs text-tinta-tenue">
                {config.actualizadoEn ? (
                  <>
                    Última modificación
                    {config.actualizadoPor ? ` por ${config.actualizadoPor.nombre}` : ''} el{' '}
                    <time dateTime={config.actualizadoEn}>
                      {formatearFechaHora(config.actualizadoEn)}
                    </time>
                    .
                  </>
                ) : (
                  'Aún no se ha modificado: son los valores iniciales.'
                )}
              </p>
            </div>
          </Tarjeta>

          <div className="grid gap-4 lg:grid-cols-2">
            <Tarjeta aria-labelledby="motores" className="min-w-0">
              <header className="border-b border-borde px-5 py-4 sm:px-6">
                <h2 id="motores" className="text-base font-semibold">
                  Motores
                </h2>
                <p className="text-sm text-tinta-suave">
                  Se conectan con variables de entorno del servidor de la API; las claves nunca se
                  escriben en el panel.
                </p>
              </header>
              <ul className="divide-y divide-borde">
                {config.proveedores.map((p) => (
                  <li key={p.proveedor} className="grid gap-1.5 px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 font-medium">
                        <Cpu className="size-4 text-marca" aria-hidden="true" />
                        {p.nombre}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {p.proveedor === config.proveedor && (
                          <Insignia tono="marca">En uso</Insignia>
                        )}
                        {p.disponible ? (
                          <Insignia tono="exito">Disponible</Insignia>
                        ) : (
                          <Insignia tono="aviso">Sin configurar</Insignia>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-tinta-suave">
                      {AYUDA_PROVEEDOR[p.proveedor]?.descripcion}
                    </p>
                    {p.modeloPorDefecto && (
                      <p className="text-xs text-tinta-tenue">
                        Modelo por defecto:{' '}
                        <span className="font-mono break-all">{p.modeloPorDefecto}</span>
                      </p>
                    )}
                    {!p.disponible && (
                      <p className="text-xs text-aviso">
                        {p.motivo ? `${p.motivo} ` : ''}
                        {AYUDA_PROVEEDOR[p.proveedor]?.falta}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Tarjeta>

            <Tarjeta aria-labelledby="uso" className="min-w-0">
              <header className="border-b border-borde px-5 py-4 sm:px-6">
                <h2 id="uso" className="text-base font-semibold">
                  Uso
                </h2>
                <p className="text-sm text-tinta-suave">
                  Peticiones al motor y tokens de este mes y del anterior. El costo solo se acumula
                  con Claude; el tope es de {config.topeMensualUsd} USD al mes.
                </p>
              </header>
              {uso.length === 0 ? (
                <p className="px-5 py-6 text-sm text-tinta-tenue sm:px-6">
                  Todavía no hay uso registrado.
                </p>
              ) : (
                <Tabla minimo="36rem">
                  <Encabezados
                    columnas={[
                      'Mes',
                      'Motor',
                      { texto: 'Peticiones', className: 'text-right' },
                      { texto: 'Tokens (entrada / salida)', className: 'text-right' },
                      { texto: 'Costo', className: 'pr-5 text-right sm:pr-6' },
                    ]}
                  />
                  <Cuerpo>
                    {uso.map((u) => (
                      <Fila key={`${u.mes}-${u.proveedor}`}>
                        <Celda primera>
                          <span className="block first-letter:uppercase">{nombreMes(u.mes)}</span>
                          <span className="block text-xs text-tinta-tenue">
                            {u.mes.slice(0, 7) === mesActual ? 'Mes actual' : 'Mes anterior'}
                          </span>
                        </Celda>
                        <Celda>{nombreProveedor(u.proveedor)}</Celda>
                        <Celda className="text-right tabular-nums">
                          {formatearNumero(u.peticiones)}
                        </Celda>
                        <Celda className="text-right tabular-nums">
                          {formatearNumero(u.tokensEntrada)} / {formatearNumero(u.tokensSalida)}
                        </Celda>
                        <Celda className="pr-5 text-right tabular-nums sm:pr-6">
                          {u.costoUsd} USD
                        </Celda>
                      </Fila>
                    ))}
                  </Cuerpo>
                </Tabla>
              )}
            </Tarjeta>
          </div>
        </>
      )}
    </>
  );
}
