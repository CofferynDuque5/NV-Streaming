'use client';

import {
  CATEGORIAS_SERVICIO,
  type CategoriaServicio,
  INFO_CATEGORIA,
  type PlataformaCreada,
} from '@nv/shared';
import { LayoutGrid, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Selector } from '@/componentes/ui/selector';
import { Dialogo } from './cuentas-gestor';
import { ErrorGeneral, useAccion } from './piezas';

/** Categoría que suele tener una plataforma por su nombre. */
function categoriaPorNombre(nombre: string): CategoriaServicio | '' {
  const n = nombre.toLowerCase();
  if (/spotify|deezer|tidal|music|musica/.test(n)) return 'musica';
  if (/chatgpt|gemini|claude|copilot|perplexity|midjourney/.test(n)) return 'ia';
  if (
    /free ?fire|roblox|pubg|clash|xbox|playstation|psn|call of duty|genshin|brawl|legends/.test(n)
  )
    return 'juegos';
  if (/office|microsoft|windows|canva|capcut|duolingo|vpn|surfshark|windscribe/.test(n))
    return 'software';
  if (/google one|icloud|drive|dropbox/.test(n)) return 'nube';
  return n ? 'streaming' : '';
}

/**
 * «Crear plataforma» como en el Gestor: solo el nombre y el precio del mes.
 * El servicio, su identificador y el primer plan se crean juntos.
 */
export function CrearPlataforma({
  nombreInicial = '',
  precioInicial = '',
  etiqueta = 'Crear plataforma',
  variante = 'primario',
  onCreada,
}: {
  nombreInicial?: string;
  precioInicial?: string;
  etiqueta?: string;
  variante?: 'primario' | 'secundario';
  /** Sin esto, al crearla se abre la plataforma nueva. */
  onCreada?: (p: PlataformaCreada) => void;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(nombreInicial);
  const [precio, setPrecio] = useState(precioInicial);
  const [meses, setMeses] = useState('1');
  const [categoria, setCategoria] = useState<CategoriaServicio | ''>(
    categoriaPorNombre(nombreInicial),
  );
  const [tocada, setTocada] = useState(false);
  const crear = useAccion();

  return (
    <>
      <Boton
        tamano="sm"
        variante={variante}
        icono={<Plus className="size-4" aria-hidden />}
        onClick={() => {
          crear.limpiar();
          setAbierto(true);
        }}
      >
        {etiqueta}
      </Boton>
      {abierto && (
        <Dialogo
          titulo="Crear plataforma"
          icono={<LayoutGrid className="size-5" aria-hidden />}
          onCerrar={() => setAbierto(false)}
          bloquear={crear.cargando}
        >
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await crear.ejecutar<PlataformaCreada>('POST', '/catalogo/plataformas', {
                nombre,
                precioUsd: precio.trim() === '' ? '0' : precio.trim().replace(',', '.'),
                meses: Number(meses),
                categoria,
              });
              if (!r) return;
              setAbierto(false);
              if (onCreada) onCreada(r.datos);
              else router.push(`/admin/plataformas/${r.datos.servicioId}`);
            }}
          >
            <Campo
              etiqueta="Nombre de la plataforma"
              placeholder="Netflix, Spotify, Canva…"
              value={nombre}
              autoFocus
              required
              maxLength={80}
              error={crear.campos.nombre}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setNombre(v);
                if (!tocada) setCategoria(categoriaPorNombre(v));
              }}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                etiqueta="Precio para el cliente (USD)"
                inputMode="decimal"
                placeholder="4.00"
                value={precio}
                error={crear.campos.precioUsd}
                ayuda="Vacío o 0: el plan no sale en la tienda hasta que le pongas precio."
                onChange={(e) => setPrecio(e.currentTarget.value)}
              />
              <Selector
                etiqueta="Dura"
                value={meses}
                error={crear.campos.meses}
                onChange={(e) => setMeses(e.currentTarget.value)}
              >
                {[1, 2, 3, 6, 12].map((m) => (
                  <option key={m} value={m}>
                    {m === 1 ? '1 mes' : `${m} meses`}
                  </option>
                ))}
              </Selector>
            </div>
            <Selector
              etiqueta="Categoría en la tienda"
              value={categoria}
              error={crear.campos.categoria}
              onChange={(e) => {
                setTocada(true);
                setCategoria(e.currentTarget.value as CategoriaServicio | '');
              }}
            >
              <option value="">Sin categoría</option>
              {CATEGORIAS_SERVICIO.map((c) => (
                <option key={c} value={c}>
                  {INFO_CATEGORIA[c].nombre}
                </option>
              ))}
            </Selector>
            <p className="text-sm text-tinta-suave">
              Después agregas sus cuentas completas o individuales. El logo, la descripción y más
              planes se cambian en el editor de la tienda.
            </p>
            <ErrorGeneral error={crear.error} />
            <div className="flex flex-wrap justify-end gap-2">
              <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
              <Boton type="submit" cargando={crear.cargando}>
                Crear plataforma
              </Boton>
            </div>
          </form>
        </Dialogo>
      )}
    </>
  );
}
