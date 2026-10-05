import { type ContactoSitio, enlaceWhatsapp } from '@nv/shared';
import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { clasesBoton } from '@/componentes/ui/boton';

/**
 * «¿No encuentras tu servicio?»: por WhatsApp si el equipo lo configuró; si
 * no, con un ticket de soporte desde el panel.
 */
export function SinServicio({ contacto }: { contacto: ContactoSitio | null }) {
  const whatsapp = contacto?.whatsapp;
  return (
    <div
      className="tarjeta-brillo mt-4 flex flex-col gap-4 p-5 @2xl:flex-row @2xl:items-center"
      style={{ '--c': '#22c55e' } as CSSProperties}
    >
      <span className="orbe" style={{ '--c': '#22c55e' } as CSSProperties} aria-hidden="true">
        <MessageCircle />
      </span>
      <div className="grid flex-1 gap-1">
        <h2 className="font-titulo text-lg font-bold">¿No encuentras tu servicio?</h2>
        <p className="text-sm text-tinta-suave">
          Pregúntanos y te decimos si lo tenemos o cuándo llega.
        </p>
      </div>
      {whatsapp ? (
        <a
          href={enlaceWhatsapp(whatsapp, 'Hola, busco un servicio que no vi en el catálogo.')}
          target="_blank"
          rel="noopener noreferrer"
          className={clasesBoton('secundario', 'md')}
        >
          Preguntar por WhatsApp
        </a>
      ) : (
        <Link href="/cuenta/soporte/nueva" className={clasesBoton('secundario', 'md')}>
          Escribir a soporte
        </Link>
      )}
    </div>
  );
}
