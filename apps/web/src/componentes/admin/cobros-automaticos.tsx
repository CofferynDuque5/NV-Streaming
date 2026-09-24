import {
  type CobroAutomaticoResumen,
  ESTADOS_COBRO_AUTOMATICO,
  filtroCobrosAutomaticosSchema,
  formatearMonto,
  type Pagina,
} from '@nv/shared';
import { Repeat } from 'lucide-react';
import Link from 'next/link';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { clasesEntrada } from '@/componentes/ui/clases';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, Fila, Tabla } from '@/componentes/ui/tabla';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { formatearFechaHora } from '@/lib/formato';
import { ESTADO_COBRO_AUTOMATICO, nombrePasarela } from '@/lib/pagos-en-linea';

type Crudo = Record<string, string | string[] | undefined>;

/**
 * Cobros automáticos autorizados (componente de servidor). Se muestra en Cobros
 * (quien ve facturas) y en Pagos en línea (administración).
 */
export async function TablaCobrosAutomaticos({
  crudo,
  ruta,
  fijos,
}: {
  crudo: Crudo;
  /** Página donde se muestra, para los filtros y la paginación. */
  ruta: string;
  /** Parámetros que conserva (p. ej. la vista). */
  fijos: Record<string, string>;
}) {
  const { filtro, parametros } = leerFiltro(filtroCobrosAutomaticosSchema, crudo);
  const consulta = new URLSearchParams({
    ...(filtro.estado ? { estado: filtro.estado } : {}),
    pagina: String(filtro.pagina),
  });
  const { datos } = await leerApi<Pagina<CobroAutomaticoResumen>>(
    `/cobros-automaticos?${consulta}`,
  );
  const pagina = datos ?? { elementos: [], total: 0, pagina: 1, porPagina: 20 };

  return (
    <Tarjeta>
      <form
        className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4 sm:px-6"
        role="search"
        aria-label="Filtrar cobros automáticos"
        action={ruta}
      >
        {Object.entries(fijos).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label htmlFor="filtro-cobro-estado" className="sr-only">
          Estado del cobro
        </label>
        <select
          id="filtro-cobro-estado"
          name="estado"
          defaultValue={filtro.estado ?? ''}
          className={`${clasesEntrada} w-auto`}
        >
          <option value="">Todos los estados</option>
          {ESTADOS_COBRO_AUTOMATICO.map((e) => (
            <option key={e} value={e}>
              {ESTADO_COBRO_AUTOMATICO[e].texto}
            </option>
          ))}
        </select>
        <Boton type="submit" variante="secundario">
          Filtrar
        </Boton>
        <p className="ml-auto text-sm text-tinta-tenue tabular-nums">
          {pagina.total === 1 ? '1 cobro' : `${pagina.total} cobros`}
        </p>
      </form>
      {!datos ? (
        <div className="p-5 sm:p-6">
          <Alerta tono="peligro">
            No pudimos cargar los cobros automáticos. Recarga la página.
          </Alerta>
        </div>
      ) : pagina.elementos.length === 0 ? (
        <EstadoVacio icono={Repeat} titulo="No hay cobros automáticos">
          {filtro.estado
            ? 'No hay cobros con ese estado.'
            : 'Aparecen aquí cuando vence una suscripción con cobro automático autorizado por el cliente.'}
        </EstadoVacio>
      ) : (
        <Tabla minimo="60rem">
          <Encabezados
            columnas={[
              'Factura',
              'Cliente',
              'Método',
              { texto: 'Importe', className: 'text-right' },
              'Intento',
              'Estado',
              'Fecha',
            ]}
          />
          <Cuerpo>
            {pagina.elementos.map((c) => {
              const e = ESTADO_COBRO_AUTOMATICO[c.estado];
              return (
                <Fila key={c.id}>
                  <Celda primera>
                    <Link
                      href={`/admin/cobros/facturas/${c.factura.id}`}
                      className="font-mono text-[0.8rem] font-medium hover:text-marca hover:underline"
                    >
                      {c.factura.numero}
                    </Link>
                  </Celda>
                  <Celda className="max-w-48 truncate">
                    <Link href={`/admin/clientes/${c.cliente.id}`} className="hover:underline">
                      {c.cliente.nombre}
                    </Link>
                  </Celda>
                  <Celda>
                    <span className="block max-w-48 truncate">{c.metodo.descripcion}</span>
                    <span className="block text-xs text-tinta-tenue">
                      {nombrePasarela(c.metodo.pasarela)}
                    </span>
                  </Celda>
                  <Celda className="text-right font-medium tabular-nums">
                    {formatearMonto(c.factura.total, c.factura.moneda)}
                  </Celda>
                  <Celda className="tabular-nums">{c.intento}</Celda>
                  <Celda>
                    <Insignia tono={e.tono}>{e.texto}</Insignia>
                    {c.error && (
                      <span className="mt-1 block max-w-56 text-xs text-peligro">{c.error}</span>
                    )}
                  </Celda>
                  <Celda className="text-tinta-suave">
                    <span className="block">
                      {formatearFechaHora(c.ejecutadoEn ?? c.programadoPara)}
                    </span>
                    <span className="block text-xs text-tinta-tenue">
                      {c.ejecutadoEn ? 'Ejecutado' : 'Programado'}
                    </span>
                  </Celda>
                </Fila>
              );
            })}
          </Cuerpo>
        </Tabla>
      )}
      <Paginacion
        ruta={ruta}
        parametros={{ ...fijos, ...parametros }}
        pagina={pagina.pagina}
        porPagina={pagina.porPagina}
        total={pagina.total}
      />
    </Tarjeta>
  );
}
