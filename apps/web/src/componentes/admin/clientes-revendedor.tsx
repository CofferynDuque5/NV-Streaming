'use client';

import type { ClienteDeRevendedor } from '@nv/shared';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { BotonCopiar } from '@/componentes/accesos';
import { Boton } from '@/componentes/ui/boton';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { ESTADO_SUSCRIPCION } from '@/lib/estados';
import { formatearFecha } from '@/lib/formato';

const vence = (iso: string | null) => (iso ? formatearFecha(iso) : 'sin fecha');

/** Texto para pegar en WhatsApp: cada cliente con lo que tiene y cuándo vence. */
function listaWhatsapp(responsable: string, clientes: ClienteDeRevendedor[]) {
  const lineas = [`*Clientes de ${responsable}* (${clientes.length})`, ''];
  clientes.forEach((c, i) => {
    lineas.push(`${i + 1}. *${c.nombre}*${c.whatsapp ? ` · ${c.whatsapp}` : ''}`);
    if (c.suscripciones.length === 0) lineas.push('   Sin servicios vigentes');
    for (const s of c.suscripciones) {
      lineas.push(`   ${s.servicio} (${s.plan}) · vence ${vence(s.venceEn)}`);
    }
  });
  return lineas.join('\n');
}

const celdaCsv = (v: string) => (/[",\n;]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

function descargarCsv(responsable: string, clientes: ClienteDeRevendedor[]) {
  const filas = [['Cliente', 'Correo', 'WhatsApp', 'Servicio', 'Plan', 'Estado', 'Vence']];
  for (const c of clientes) {
    const base = [c.nombre, c.correo ?? '', c.whatsapp ?? ''];
    if (c.suscripciones.length === 0) filas.push([...base, '', '', '', '']);
    for (const s of c.suscripciones) {
      filas.push([
        ...base,
        s.servicio,
        s.plan,
        ESTADO_SUSCRIPCION[s.estado].texto,
        s.venceEn ? s.venceEn.slice(0, 10) : '',
      ]);
    }
  }
  // BOM para que Excel lea bien los acentos.
  const texto = `﻿${filas.map((f) => f.map(celdaCsv).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `clientes-${responsable.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ClientesDeRevendedor({
  responsable,
  clientes,
}: {
  responsable: string;
  clientes: ClienteDeRevendedor[];
}) {
  return (
    <Tarjeta>
      <CabeceraTarjeta
        titulo={`Sus clientes · ${clientes.length}`}
        descripcion="La lista por responsable: cópiala para enviarla por WhatsApp o descárgala en CSV."
        accion={
          clientes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <BotonCopiar
                texto={listaWhatsapp(responsable, clientes)}
                que="la lista para WhatsApp"
              />
              <Boton
                tamano="sm"
                variante="secundario"
                onClick={() => descargarCsv(responsable, clientes)}
                icono={<Download className="size-3.5" />}
              >
                CSV
              </Boton>
            </div>
          ) : undefined
        }
      />
      {clientes.length === 0 ? (
        <p className="px-5 py-6 text-sm text-tinta-suave sm:px-6">
          Todavía no tiene clientes registrados.
        </p>
      ) : (
        <ul className="divide-y divide-borde" aria-label="Clientes del revendedor">
          {clientes.map((c) => (
            <li key={c.id} className="grid gap-1.5 px-5 py-3.5 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/clientes/${c.id}`} className="font-medium hover:text-marca">
                  {c.nombre}
                </Link>
                {c.estado === 'archivado' && <Insignia>Archivado</Insignia>}
                {c.whatsapp && <span className="text-xs text-tinta-suave">{c.whatsapp}</span>}
              </div>
              {c.suscripciones.length === 0 ? (
                <p className="text-sm text-tinta-tenue">Sin servicios vigentes</p>
              ) : (
                <ul className="grid gap-1 text-sm">
                  {c.suscripciones.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/suscripciones/${s.id}`}
                        className="text-tinta-suave hover:text-marca"
                      >
                        {s.servicio} · {s.plan}
                      </Link>
                      <Insignia tono={ESTADO_SUSCRIPCION[s.estado].tono}>
                        {ESTADO_SUSCRIPCION[s.estado].texto}
                      </Insignia>
                      <span className="text-xs text-tinta-tenue">vence {vence(s.venceEn)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
