import {
  enlaceWhatsapp,
  pendientesPorDefinir,
  REVISION_LEGAL_PENDIENTE,
  textoPoliticas,
} from '@nv/shared';
import { TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { AccionesContacto, DocumentoPolitica } from '@/componentes/politicas/documento';
import { type EntradaIndice, MarcoPoliticas } from '@/componentes/politicas/marco';
import { fechaPoliticas, leerCifrasPoliticas } from '@/lib/politicas';
import { leerTemaPublico } from '@/lib/tienda';
import './politicas.css';

const DESCRIPCION =
  'Las reglas de NV Streaming en un solo lugar: términos de uso, privacidad, pagos y reembolsos, entregas, revendedores y cookies.';

export const metadata: Metadata = {
  title: 'Políticas y términos',
  description: DESCRIPCION,
  openGraph: { title: 'Políticas y términos', description: DESCRIPCION },
  alternates: { canonical: '/politicas' },
};

const MENSAJE_WHATSAPP = 'Hola, tengo una pregunta sobre las políticas de NV Streaming.';

/**
 * Políticas y términos (ventana 13): una sola página con índice, resumen y las
 * siete secciones. El texto y su versión viven en @nv/shared (politicas.ts); las
 * cifras configurables las da la API y los datos que faltan se marcan «Por definir».
 */
export default async function Politicas() {
  const [cifras, tema] = await Promise.all([leerCifrasPoliticas(), leerTemaPublico()]);
  const whatsapp = tema.contacto.whatsapp
    ? enlaceWhatsapp(tema.contacto.whatsapp, MENSAJE_WHATSAPP)
    : null;
  const doc = textoPoliticas({ cifras, whatsapp: whatsapp !== null });
  const pendientes = pendientesPorDefinir(doc);
  const indice: EntradaIndice[] = [
    { id: 'esencial', texto: 'Lo esencial', numero: '' },
    ...doc.secciones.map((s, n) => ({
      id: s.id,
      texto: s.corto,
      numero: String(n + 1).padStart(2, '0'),
    })),
  ];

  const cabecera = (
    <header className="grid max-w-[760px] justify-items-start gap-3 pt-[18px] pb-[22px] lg:ml-[288px] lg:pt-[30px] lg:pb-[34px]">
      <span className="etiqueta-orbita">Legal</span>
      <h1 tabIndex={-1} className="text-[clamp(2rem,5vw,3.1rem)] outline-none">
        Políticas y términos
      </h1>
      <p className="max-w-[62ch] text-[1.03rem] leading-[1.6] text-tinta/85">
        Las reglas de la tienda en un solo lugar: cómo compras, qué hacemos con tus datos y qué pasa
        con tus pagos, entregas y suscripciones.
      </p>
      <p className="text-[0.85rem] text-tinta-suave">
        Versión <b className="font-semibold text-tinta">{doc.version}</b> · vigente desde{' '}
        <b className="font-semibold text-tinta">{fechaPoliticas(doc.vigenteDesde)}</b>
      </p>
      {(REVISION_LEGAL_PENDIENTE || pendientes > 0) && (
        <div
          role="note"
          className="mt-1 flex items-start gap-3 rounded-2xl border border-dashed border-aviso/60 bg-aviso/[0.08] px-[15px] py-[13px] text-sm leading-normal text-[color-mix(in_srgb,var(--nv-aviso)_40%,white)]"
        >
          <TriangleAlert className="mt-px size-5 shrink-0 text-aviso" aria-hidden="true" />
          <p>
            {REVISION_LEGAL_PENDIENTE && (
              <b className="text-tinta">
                Borrador: este texto debe revisarlo un abogado antes de publicarlo.
              </b>
            )}
            {REVISION_LEGAL_PENDIENTE && pendientes > 0 && ' '}
            {pendientes > 0 && (
              <>
                Tiene{' '}
                <b className="text-tinta">
                  {pendientes} {pendientes === 1 ? 'punto' : 'puntos'}
                </b>{' '}
                {pendientes === 1 ? 'marcado' : 'marcados'}{' '}
                <span className="pl-pd pl-pd-mini">
                  <b>Por definir</b>
                </span>{' '}
                que {pendientes === 1 ? 'falta' : 'faltan'} por completar.
              </>
            )}
          </p>
        </div>
      )}
    </header>
  );

  return (
    <MarcoPoliticas indice={indice} cabecera={cabecera}>
      <DocumentoPolitica doc={doc} contacto={<AccionesContacto whatsapp={whatsapp} />} />
      <p className="flex flex-wrap justify-between gap-x-5 gap-y-2.5 border-t border-borde pt-[22px] pb-2 text-[0.85rem] text-tinta-tenue">
        <span>Fin del documento · Versión {doc.version}</span>
        <a
          href="#"
          data-arriba
          className="font-semibold whitespace-nowrap text-cian hover:underline"
        >
          Volver arriba
        </a>
      </p>
    </MarcoPoliticas>
  );
}
