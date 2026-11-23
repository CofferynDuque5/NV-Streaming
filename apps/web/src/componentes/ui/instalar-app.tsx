'use client';

import { Download, EllipsisVertical, Share, SquarePlus, X } from 'lucide-react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';

/** Evento de Chrome/Android para instalar la web como app (no está en los tipos del DOM). */
interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Modo = 'android' | 'android-manual' | 'iphone' | 'iphone-otro';

const CLAVE = 'nv-instalar-app-cerrado';
/** Si la persona lo cierra, no se vuelve a ofrecer hasta dentro de 14 días. */
const PAUSA_MS = 14 * 24 * 60 * 60 * 1000;

function yaInstalada(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function cerradoHace(): boolean {
  try {
    const v = Number(localStorage.getItem(CLAVE));
    return Number.isFinite(v) && v > 0 && Date.now() - v < PAUSA_MS;
  } catch {
    return false;
  }
}

/** En el pago y el carrito no se tapa la barra de abajo ni se distrae. */
function rutaSinAviso(ruta: string): boolean {
  return /pago|carrito|\/panel|\/editor/.test(ruta);
}

/**
 * En el teléfono, al cargar la web ofrece agregarla a la pantalla de inicio como
 * app: en Android con el botón «Instalar» del navegador y en iPhone con los
 * pasos de Safari (Compartir → Agregar a inicio), que Apple no deja automatizar.
 */
export function InstalarApp() {
  const ruta = usePathname();
  const [modo, setModo] = useState<Modo | null>(null);
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    if (yaInstalada() || cerradoHace()) return;
    const ua = navigator.userAgent;
    const iphone =
      /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    if (!iphone && !android) return;

    let espera: ReturnType<typeof setTimeout> | undefined;
    if (iphone) {
      // Safari muestra «Agregar a inicio» en Compartir; Chrome y otros en iPhone también,
      // pero el botón está en otro lugar.
      const safari = !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
      espera = setTimeout(() => setModo(safari ? 'iphone' : 'iphone-otro'), 2500);
      return () => clearTimeout(espera);
    }

    const alPedir = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
      clearTimeout(espera);
      espera = setTimeout(() => setModo('android'), 1500);
    };
    const alInstalar = () => {
      setModo(null);
      setEvento(null);
    };
    window.addEventListener('beforeinstallprompt', alPedir);
    window.addEventListener('appinstalled', alInstalar);
    // Navegadores de Android que no avisan (Samsung Internet, Firefox): los pasos a mano.
    espera = setTimeout(() => setModo((m) => m ?? 'android-manual'), 6000);
    return () => {
      clearTimeout(espera);
      window.removeEventListener('beforeinstallprompt', alPedir);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  if (!modo || rutaSinAviso(ruta)) return null;

  function cerrar() {
    try {
      localStorage.setItem(CLAVE, String(Date.now()));
    } catch {
      // Sin almacenamiento (modo privado): solo se oculta esta vez.
    }
    setModo(null);
  }

  async function instalar() {
    if (!evento) return;
    setInstalando(true);
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    setInstalando(false);
    setEvento(null);
    if (outcome === 'accepted') setModo(null);
    else cerrar();
  }

  return (
    <section
      aria-label="Instalar NV Streaming"
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-[70] mx-auto max-w-md animate-[nv-entrar_.25s_ease] rounded-2xl border border-borde-fuerte bg-elevada/95 p-4 shadow-[0_20px_50px_-15px_rgb(0_0_0/0.8)] backdrop-blur-md lg:hidden"
    >
      <div className="flex items-start gap-3">
        <Image
          src="/app/icono-192.png"
          alt=""
          width={48}
          height={48}
          className="size-12 shrink-0 rounded-xl"
        />
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="font-semibold text-tinta">Instala NV Streaming en tu teléfono</p>
          <p className="text-sm text-tinta-suave">
            Tenla en tu pantalla de inicio y entra con un toque, como una app.
          </p>
        </div>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Ahora no"
          className="-m-1 grid size-9 shrink-0 place-items-center rounded-lg text-tinta-tenue hover:bg-white/[0.06] hover:text-tinta"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {modo === 'android' && (
        <div className="mt-3 flex justify-end gap-2">
          <Boton variante="fantasma" tamano="sm" onClick={cerrar}>
            Ahora no
          </Boton>
          <Boton
            tamano="sm"
            icono={<Download className="size-4" />}
            cargando={instalando}
            onClick={() => void instalar()}
          >
            Instalar app
          </Boton>
        </div>
      )}

      {modo !== 'android' && (
        <ol className="mt-3 grid gap-2 text-sm text-tinta-suave">
          {modo === 'iphone' && (
            <>
              <Paso n={1}>
                Toca <Share className="mx-0.5 inline size-4 text-cian" aria-label="Compartir" />
                <b className="text-tinta">Compartir</b> en la barra de Safari.
              </Paso>
              <Paso n={2}>
                Elige <SquarePlus className="mx-0.5 inline size-4 text-cian" aria-hidden="true" />
                <b className="text-tinta">Agregar a inicio</b> y luego{' '}
                <b className="text-tinta">Agregar</b>.
              </Paso>
            </>
          )}
          {modo === 'iphone-otro' && (
            <>
              <Paso n={1}>
                Toca <Share className="mx-0.5 inline size-4 text-cian" aria-label="Compartir" />
                <b className="text-tinta">Compartir</b> (en Chrome, junto a la dirección).
              </Paso>
              <Paso n={2}>
                Elige <b className="text-tinta">Agregar a inicio</b>. Si no aparece, abre esta
                página en <b className="text-tinta">Safari</b>.
              </Paso>
            </>
          )}
          {modo === 'android-manual' && (
            <>
              <Paso n={1}>
                Toca el menú{' '}
                <EllipsisVertical className="inline size-4 text-cian" aria-label="de tres puntos" />{' '}
                del navegador.
              </Paso>
              <Paso n={2}>
                Elige <b className="text-tinta">Instalar app</b> o{' '}
                <b className="text-tinta">Agregar a pantalla de inicio</b>.
              </Paso>
            </>
          )}
        </ol>
      )}
    </section>
  );
}

function Paso({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-marca-suave text-xs font-semibold text-marca">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}
