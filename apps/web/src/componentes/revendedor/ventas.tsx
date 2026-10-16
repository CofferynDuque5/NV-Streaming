'use client';

import type { PaginaVentas, VentaRevendedor } from '@nv/shared';
import { useState } from 'react';
import { MensajeError, PildoraEstado } from '@/componentes/cliente/pago';
import { Boton } from '@/componentes/ui/boton';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import { CeldaPlan, claseTabla, fechaCorta, horaCorta, usd } from './panel';

/**
 * Tabla de ventas del periodo con los totales al pie (los calcula la API
 * sobre todo el filtro) y «Ver más», que trae la página siguiente.
 */
export function TablaVentas({ inicial, consulta }: { inicial: PaginaVentas; consulta: string }) {
  const [filas, setFilas] = useState<VentaRevendedor[]>(inicial.elementos);
  const [pagina, setPagina] = useState(inicial.pagina);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const t = inicial.totales;
  const faltan = inicial.total - filas.length;

  async function verMas() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<PaginaVentas>(
      'GET',
      `/revendedor/ventas?${consulta}&pagina=${pagina + 1}&porPagina=${inicial.porPagina}`,
    );
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setPagina(r.datos.pagina);
    setFilas((f) => [...f, ...r.datos.elementos.filter((v) => !f.some((x) => x.id === v.id))]);
  }

  return (
    <>
      <div className={claseTabla}>
        <table className="t-tab">
          <thead>
            <tr>
              <th scope="col">Cliente y plan</th>
              <th scope="col">Fecha</th>
              <th scope="col">Tipo</th>
              <th scope="col" className="num">
                Pagaste
              </th>
              <th scope="col" className="num">
                Público
              </th>
              <th scope="col" className="num">
                Ganancia
              </th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((v) => {
              const reembolsada = v.estado === 'reembolsada';
              return (
                <tr key={v.id} data-reembolsada={reembolsada || undefined}>
                  <td data-l="Cliente">
                    <CeldaPlan
                      servicio={{
                        slug: v.plan.servicioSlug,
                        categoria: v.plan.categoria,
                        nombre: v.plan.servicio,
                      }}
                      titulo={v.cliente.nombre}
                      detalle={`${v.plan.servicio} ${v.plan.nombre}`}
                    />
                  </td>
                  <td data-l="Fecha">
                    {fechaCorta(v.creadoEn)}
                    <small>{horaCorta(v.creadoEn)}</small>
                  </td>
                  <td data-l="Tipo">{v.tipo === 'alta' ? 'Activación' : 'Renovación'}</td>
                  <td data-l="Pagaste" className="num">
                    <span className={reembolsada ? 'line-through' : undefined}>
                      {usd(v.precioUsd)}
                    </span>
                  </td>
                  <td data-l="Público" className="num">
                    {usd(v.precioPublicoUsd)}
                  </td>
                  <td data-l="Ganancia" className="num text-[#4ade80]">
                    {v.gananciaUsd !== null ? (
                      usd(v.gananciaUsd)
                    ) : (
                      <span className="text-tinta-tenue">—</span>
                    )}
                  </td>
                  <td data-l="Estado">
                    <PildoraEstado
                      texto={reembolsada ? 'Reembolsada' : 'Completada'}
                      tono={reembolsada ? 'aviso' : 'exito'}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Total · {t.ventas} {t.ventas === 1 ? 'venta' : 'ventas'}
              </th>
              <td className="num" data-l="Pagaste">
                {usd(t.pagadoUsd)}
              </td>
              <td className="num" data-l="Público">
                {usd(t.publicoUsd)}
              </td>
              <td className="num text-[#4ade80]" data-l="Ganancia">
                {usd(t.gananciaUsd)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {error && <MensajeError error={error} />}
      {faltan > 0 && (
        <Boton
          variante="secundario"
          className="justify-self-center"
          cargando={cargando}
          onClick={() => void verMas()}
        >
          {cargando ? 'Cargando…' : `Ver ${Math.min(inicial.porPagina, faltan)} más`}
        </Boton>
      )}
    </>
  );
}
