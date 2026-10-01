import { enlaceWhatsapp, type TemaSitioPublico } from '@nv/shared';
import { Camera, Mail, MessageCircle, Music2 } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { LogoTienda } from '@/componentes/logo';
import { clasesBoton } from '@/componentes/ui/boton';
import type { CategoriaMenu } from './tipos';

const MENSAJE_WHATSAPP = 'Hola, tengo una duda antes de comprar en NV Streaming.';

function Red({
  href,
  etiqueta,
  color,
  children,
}: {
  href: string;
  etiqueta: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={etiqueta}
      className="orbe orbe-sm transition-transform hover:-translate-y-0.5"
      style={{ '--c': color } as CSSProperties}
    >
      {children}
    </a>
  );
}

function Columna({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-3">
      <h2 className="font-titulo text-xs font-bold tracking-[0.18em] text-cian uppercase">
        {titulo}
      </h2>
      <ul className="grid gap-2.5 text-[0.95rem] text-tinta-suave">{children}</ul>
    </div>
  );
}

function Enlace({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link href={href} className="hover:text-tinta">
        {children}
      </Link>
    </li>
  );
}

/**
 * Pie de la tienda. WhatsApp, redes y correo solo aparecen si el equipo los
 * configuró en el editor visual; los métodos de pago salen del panel de cobros.
 */
export function PieTienda({
  tema,
  categorias,
  conSesion,
}: {
  tema: TemaSitioPublico;
  categorias: CategoriaMenu[];
  conSesion: boolean;
}) {
  const { contacto } = tema;
  const whatsapp = contacto.whatsapp ? enlaceWhatsapp(contacto.whatsapp, MENSAJE_WHATSAPP) : null;
  const metodos = [...new Set(tema.metodosPago.map((m) => m.nombre))];

  return (
    <footer className="relative mt-16 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-20%] top-0 h-40 rounded-[50%] bg-[radial-gradient(60%_100%_at_50%_0%,rgb(37_99_235/0.22),transparent_70%)] shadow-[0_-1px_0_rgb(34_211_238/0.35)]"
      />
      <div className="contenedor relative grid gap-12 pt-14 pb-8">
        <div
          className="tarjeta-brillo flex flex-col gap-5 p-6 sm:flex-row sm:items-center"
          style={{ '--c': '#22c55e' } as CSSProperties}
        >
          <span className="orbe" style={{ '--c': '#22c55e' } as CSSProperties} aria-hidden="true">
            <MessageCircle />
          </span>
          <div className="grid flex-1 gap-1">
            <h2 className="text-xl">¿Dudas antes de comprar?</h2>
            <p className="text-sm text-tinta-suave">
              {whatsapp
                ? 'Escríbenos por WhatsApp y te ayudamos a elegir tu plan.'
                : 'Abre un ticket de soporte y te ayudamos a elegir tu plan.'}
            </p>
          </div>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton('primario', 'lg')}
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Hablar por WhatsApp
            </a>
          ) : (
            <Link href="/cuenta/soporte/nueva" className={clasesBoton('primario', 'lg')}>
              Escribir a soporte
            </Link>
          )}
        </div>

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="grid content-start gap-4 sm:col-span-2 lg:col-span-1">
            <LogoTienda />
            <p className="max-w-sm text-sm text-tinta-suave">
              Tu portal a todos los universos del entretenimiento. Pagas en tu moneda y tu
              comprobante lo revisa nuestro equipo.
            </p>
            {(contacto.instagram || whatsapp || contacto.tiktok || contacto.correo) && (
              <div className="flex gap-3">
                {contacto.instagram && (
                  <Red
                    href={contacto.instagram}
                    etiqueta="Instagram de NV Streaming"
                    color="#e879f9"
                  >
                    <Camera />
                  </Red>
                )}
                {whatsapp && (
                  <Red href={whatsapp} etiqueta="WhatsApp de NV Streaming" color="#22c55e">
                    <MessageCircle />
                  </Red>
                )}
                {contacto.tiktok && (
                  <Red href={contacto.tiktok} etiqueta="TikTok de NV Streaming" color="#22d3ee">
                    <Music2 />
                  </Red>
                )}
                {contacto.correo && (
                  <Red
                    href={`mailto:${contacto.correo}`}
                    etiqueta="Correo de NV Streaming"
                    color="#4f8dff"
                  >
                    <Mail />
                  </Red>
                )}
              </div>
            )}
          </div>
          <Columna titulo="Tienda">
            <Enlace href="/catalogo">Catálogo</Enlace>
            {categorias.slice(0, 3).map((c) => (
              <Enlace key={c.id} href={`/catalogo?categoria=${c.id}`}>
                {c.nombre}
              </Enlace>
            ))}
            <Enlace href="/#como-comprar">Cómo comprar</Enlace>
          </Columna>
          <Columna titulo="Tu cuenta">
            {conSesion ? (
              <Enlace href="/panel">Mi panel</Enlace>
            ) : (
              <Enlace href="/ingresar">Ingresar</Enlace>
            )}
            <Enlace href="/cuenta/billetera">Billetera</Enlace>
            <Enlace href="/cuenta/planes">Mis planes</Enlace>
            <Enlace href="/cuenta/revendedor">Revendedores</Enlace>
          </Columna>
          <Columna titulo="Ayuda">
            <Enlace href="/cuenta/soporte/nueva">Soporte</Enlace>
            <Enlace href="/terminos">Términos</Enlace>
            <Enlace href="/privacidad">Privacidad</Enlace>
            {contacto.correo && (
              <li>
                <a href={`mailto:${contacto.correo}`} className="hover:text-tinta">
                  Contacto
                </a>
              </li>
            )}
          </Columna>
        </div>

        <div className="grid gap-4 border-t border-borde pt-6">
          {metodos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-xs font-bold tracking-[0.16em] text-tinta-tenue uppercase">
                Pagas con
              </span>
              {metodos.map((m) => (
                <span key={m} className="rounded-full border border-borde-fuerte px-3 py-1 text-sm">
                  {m}
                </span>
              ))}
              <span className="rounded-full border border-borde-fuerte px-3 py-1 text-sm">
                Saldo NV
              </span>
            </div>
          )}
          <p className="text-sm text-tinta-tenue">
            © {new Date().getFullYear()} NV Streaming · Hecho en Venezuela
          </p>
        </div>
        <p
          aria-hidden="true"
          className="pointer-events-none -mb-10 bg-[linear-gradient(180deg,rgb(140_160_255/0.16),transparent_85%)] bg-clip-text text-center font-titulo text-[clamp(3rem,11vw,9rem)] leading-none font-extrabold whitespace-nowrap text-transparent select-none"
        >
          NV STREAMING
        </p>
      </div>
    </footer>
  );
}
