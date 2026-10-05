'use client';

import { type BloqueSitio, MAX_BLOQUES } from '@nv/shared';
import { ChevronLeft, Copy, PencilLine, TriangleAlert, Zap, Trash2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { claseEnlace } from '@/componentes/cliente/piezas-cuenta';
import { Boton } from '@/componentes/ui/boton';
import { OrbeBloque } from './cajones';
import { FormularioBloque, MasOpciones, type PropsFormulario } from './formularios';
import { EN_VIVO, INFO_BLOQUES } from './modelo';
import { claseEnlacePeligro, Info } from './piezas';

/**
 * Columna «Editar»: el bloque elegido con su formulario, «Más opciones»,
 * Duplicar y Eliminar bloque (con confirmación en la misma columna).
 */
export function Inspector({
  formulario,
  indice,
  total,
  errores,
  masOpciones,
  onMasOpciones,
  confirmarEliminar,
  onPedirEliminar,
  onEliminar,
  onCancelarEliminar,
  onDuplicar,
  onVolver,
}: {
  /** Sin bloque elegido: null. */
  formulario: PropsFormulario<BloqueSitio> | null;
  indice: number;
  total: number;
  errores: number;
  masOpciones: boolean;
  onMasOpciones: (v: boolean) => void;
  confirmarEliminar: boolean;
  onPedirEliminar: () => void;
  onEliminar: () => void;
  onCancelarEliminar: () => void;
  onDuplicar: () => void;
  /** En el teléfono: volver a la lista de bloques. */
  onVolver: () => void;
}) {
  const volver = (
    <button type="button" className="ed-atras" aria-label="Volver a los bloques" onClick={onVolver}>
      <ChevronLeft className="size-4" aria-hidden="true" />
    </button>
  );
  if (!formulario) {
    return (
      <>
        <header className="ed-col-cab ed-ins-cab">
          {volver}
          <b className="ed-col-t">Editar</b>
        </header>
        <div className="ed-vacio">
          <span className="orbe" style={{ '--c': '#22d3ee' } as CSSProperties} aria-hidden="true">
            <PencilLine />
          </span>
          <b>{total ? 'Elige un bloque' : 'Aún no hay bloques'}</b>
          <p>
            {total
              ? 'Toca un bloque en la lista o en la vista previa para editarlo aquí.'
              : 'Usa Añadir bloque para empezar la página.'}
          </p>
        </div>
      </>
    );
  }
  const { b } = formulario;
  const info = INFO_BLOQUES[b.tipo];
  return (
    <>
      <header className="ed-col-cab ed-ins-cab">
        {volver}
        <OrbeBloque tipo={b.tipo} />
        <div className="grid min-w-0 flex-1">
          <small className="text-xs text-tinta-suave">
            Bloque {indice + 1} de {total}
          </small>
          <h2 className="truncate font-titulo text-base font-bold">{info.nombre}</h2>
        </div>
        {errores > 0 && <span className="ed-rev">Revisar {errores}</span>}
      </header>
      <div className="ed-ins">
        {EN_VIVO[b.tipo] && (
          <Info icono={<Zap className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}>
            {EN_VIVO[b.tipo]}
          </Info>
        )}
        {b.tipo === 'testimonios' && (
          <Info
            tono="ambar"
            icono={<TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          >
            <b>Solo opiniones reales.</b> Publica únicamente lo que un cliente te dijo de verdad,
            con su permiso y su nombre tal como lo autorizó.
          </Info>
        )}
        <div className="ed-form">
          <FormularioBloque {...formulario} />
        </div>
        <MasOpciones p={formulario} abierto={masOpciones} onAbrir={onMasOpciones} />
        {confirmarEliminar ? (
          <div className="ed-confirma" role="alertdialog" aria-labelledby="cf-eliminar">
            <b id="cf-eliminar">¿Eliminar el bloque {info.nombre}?</b>
            <p>Se quita del borrador. En la tienda no cambia nada hasta que publiques.</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Boton variante="peligro" tamano="sm" onClick={onEliminar} autoFocus>
                Eliminar bloque
              </Boton>
              <button type="button" className={claseEnlace} onClick={onCancelarEliminar}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="ed-ins-pie">
            <Boton
              variante="secundario"
              tamano="sm"
              icono={<Copy className="size-4" />}
              disabled={total >= MAX_BLOQUES}
              onClick={onDuplicar}
            >
              Duplicar
            </Boton>
            <button type="button" className={claseEnlacePeligro} onClick={onPedirEliminar}>
              <Trash2 className="size-4" aria-hidden="true" />
              Eliminar bloque
            </button>
          </div>
        )}
      </div>
    </>
  );
}
