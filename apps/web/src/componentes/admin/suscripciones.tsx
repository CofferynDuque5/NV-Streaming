'use client';

import {
  type EstadoSuscripcion,
  INFO_MONEDA,
  MONEDAS,
  type Moneda,
  REGLAS_COBRO,
} from '@nv/shared';
import { ArrowRight, Pause, Play, RefreshCw, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Casilla, Selector } from '@/componentes/ui/selector';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';

type Accion = 'renovar' | 'pausar' | 'reanudar' | 'cancelar' | 'revertir';

interface Props {
  id: string;
  estado: EstadoSuscripcion;
  moneda: Moneda;
  cancelarAlVencer: boolean;
  renovable: boolean;
  facturaAbierta: { id: string; numero: string } | null;
  puedeRenovar: boolean;
  puedeGestionar: boolean;
}

function Bloque({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 px-5 py-5 sm:px-6">
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="text-sm text-tinta-suave">{descripcion}</p>
      </div>
      {children}
    </div>
  );
}

const RENOVABLES: EstadoSuscripcion[] = ['activa', 'en_gracia', 'suspendida', 'vencida'];

/** Acciones sobre una suscripción según su estado y los permisos de quien mira. */
export function AccionesSuscripcion({
  id,
  estado,
  moneda,
  cancelarAlVencer,
  renovable,
  facturaAbierta,
  puedeRenovar,
  puedeGestionar,
}: Props) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<Accion | null>(null);
  const [error, setError] = useState<{ accion: Accion; error: ErrorLlamada } | null>(null);
  const [aviso, setAviso] = useState<{ accion: Accion; texto: ReactNode } | null>(null);

  async function ejecutar<T>(
    accion: Accion,
    cuerpo: unknown,
    exito: (datos: T) => ReactNode,
  ): Promise<boolean> {
    const ruta = accion === 'revertir' ? 'revertir-cancelacion' : accion;
    setOcupado(accion);
    setError(null);
    setAviso(null);
    const r = await llamarApi<T>('POST', `/suscripciones/${id}/${ruta}`, cuerpo);
    setOcupado(null);
    if (!r.ok) {
      setError({ accion, error: r.error });
      return false;
    }
    setAviso({ accion, texto: exito(r.datos) });
    router.refresh();
    return true;
  }

  const mensajes = (accion: Accion) => (
    <>
      {error?.accion === accion && !error.error.campos && (
        <Alerta tono="peligro">{error.error.mensaje}</Alerta>
      )}
      {aviso?.accion === accion && <Alerta tono="exito">{aviso.texto}</Alerta>}
    </>
  );
  const campoError = (accion: Accion, campo: string) =>
    error?.accion === accion ? erroresPorCampo(error.error)[campo] : undefined;

  const conMotivo =
    (accion: Accion, extra: (d: FormData) => Record<string, unknown>, exito: ReactNode) =>
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formulario = e.currentTarget;
      const d = new FormData(formulario);
      const ok = await ejecutar(
        accion,
        { motivo: String(d.get('motivo') ?? '').trim(), ...extra(d) },
        () => exito,
      );
      if (ok) formulario.reset();
    };

  const bloques: ReactNode[] = [];
  const programable = estado === 'activa' || estado === 'en_gracia';

  // Renovar: emite la factura de renovación.
  if (puedeRenovar && RENOVABLES.includes(estado) && !cancelarAlVencer) {
    bloques.push(
      <Bloque
        key="renovar"
        titulo="Renovar"
        descripcion={`Emite la factura del siguiente periodo. El cliente tiene ${REGLAS_COBRO.diasParaPagar} días para pagarla; el periodo se extiende al confirmarse el pago.`}
      >
        {!renovable ? (
          <Alerta tono="aviso">Este plan ya no admite renovaciones. Ofrécele otro plan.</Alerta>
        ) : facturaAbierta ? (
          <Alerta tono="info">
            Ya tiene la factura{' '}
            <Link
              href={`/admin/cobros/facturas/${facturaAbierta.id}`}
              className="font-medium text-marca underline-offset-2 hover:underline"
            >
              {facturaAbierta.numero}
            </Link>{' '}
            pendiente de pago.
          </Alerta>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const m = new FormData(e.currentTarget).get('moneda');
              void ejecutar<{ factura: { id: string; numero: string } }>(
                'renovar',
                { moneda: m },
                (d) => (
                  <>
                    Emitimos la factura{' '}
                    <Link
                      href={`/admin/cobros/facturas/${d.factura.id}`}
                      className="inline-flex items-center gap-1 font-medium text-marca underline-offset-2 hover:underline"
                    >
                      {d.factura.numero} <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </>
                ),
              );
            }}
          >
            <Selector
              etiqueta="Moneda de la factura"
              name="moneda"
              defaultValue={moneda}
              className="min-w-0 flex-1 basis-48"
              error={campoError('renovar', 'moneda')}
            >
              {MONEDAS.map((m) => (
                <option key={m} value={m}>
                  {m} · {INFO_MONEDA[m].nombre}
                </option>
              ))}
            </Selector>
            <Boton
              type="submit"
              cargando={ocupado === 'renovar'}
              icono={<RefreshCw className="size-4" />}
            >
              Emitir factura
            </Boton>
          </form>
        )}
        {mensajes('renovar')}
      </Bloque>,
    );
  }

  if (puedeGestionar && estado === 'activa') {
    bloques.push(
      <Bloque
        key="pausar"
        titulo="Pausar"
        descripcion="Congela los días que le quedan hasta que la reanudes. El motivo queda en el historial."
      >
        <form
          className="grid gap-2"
          noValidate
          onSubmit={conMotivo('pausar', () => ({}), 'Suscripción pausada.')}
        >
          <Campo etiqueta="Motivo" name="motivo" required error={campoError('pausar', 'motivo')} />
          <Boton
            type="submit"
            variante="secundario"
            cargando={ocupado === 'pausar'}
            icono={<Pause className="size-4" />}
            className="justify-self-start"
          >
            Pausar
          </Boton>
        </form>
        {mensajes('pausar')}
      </Bloque>,
    );
  }

  if (puedeGestionar && estado === 'pausada') {
    bloques.push(
      <Bloque
        key="reanudar"
        titulo="Reanudar"
        descripcion="Vuelve a activarla con los días que tenía pendientes al pausarla."
      >
        <Boton
          variante="secundario"
          className="justify-self-start"
          cargando={ocupado === 'reanudar'}
          icono={<Play className="size-4" />}
          onClick={() => void ejecutar('reanudar', {}, () => 'Suscripción reanudada.')}
        >
          Reanudar
        </Boton>
        {mensajes('reanudar')}
      </Bloque>,
    );
  }

  if (puedeGestionar && cancelarAlVencer && programable) {
    bloques.push(
      <Bloque
        key="revertir"
        titulo="Revertir la cancelación"
        descripcion="Anula la cancelación programada: la suscripción seguirá y podrá renovarse."
      >
        <Boton
          variante="secundario"
          className="justify-self-start"
          cargando={ocupado === 'revertir'}
          icono={<Undo2 className="size-4" />}
          onClick={() => void ejecutar('revertir', {}, () => 'Cancelación revertida.')}
        >
          Revertir cancelación
        </Boton>
        {mensajes('revertir')}
      </Bloque>,
    );
  }

  if (puedeGestionar && estado !== 'cancelada') {
    // Solo las activas o en gracia se pueden dejar programadas; el resto se cancela en el acto.
    const soloInmediata = !programable || cancelarAlVencer;
    bloques.push(
      <Bloque
        key="cancelar"
        titulo="Cancelar"
        descripcion={
          soloInmediata
            ? cancelarAlVencer
              ? 'Ya tiene la cancelación programada. Si la cancelas aquí, termina en el acto y se anulan sus facturas pendientes.'
              : 'Se cancela en el acto y se anulan sus facturas pendientes.'
            : 'Por defecto sigue activa hasta su vencimiento y no se renueva. Sus facturas pendientes se anulan.'
        }
      >
        <form
          className="grid gap-3"
          noValidate
          onSubmit={conMotivo(
            'cancelar',
            (d) => ({ inmediata: soloInmediata || d.get('inmediata') === 'on' }),
            'Listo. La cancelación quedó registrada.',
          )}
        >
          <Campo
            etiqueta="Motivo"
            name="motivo"
            required
            error={campoError('cancelar', 'motivo')}
          />
          {!soloInmediata && (
            <Casilla
              name="inmediata"
              etiqueta="Cancelar ya (si no, al vencer)"
              ayuda="Corta el servicio en este momento en lugar de esperar al vencimiento."
            />
          )}
          <Boton
            type="submit"
            variante="peligro"
            cargando={ocupado === 'cancelar'}
            className="justify-self-start"
          >
            Cancelar suscripción
          </Boton>
        </form>
        {mensajes('cancelar')}
      </Bloque>,
    );
  }

  if (bloques.length === 0) {
    return (
      <p className="px-5 py-5 text-sm text-tinta-tenue sm:px-6">
        {estado === 'cancelada'
          ? 'Está cancelada: no admite más acciones. Crea una suscripción nueva desde la ficha del cliente.'
          : 'No hay acciones disponibles para tu rol en este estado.'}
      </p>
    );
  }
  return <div className="divide-y divide-borde">{bloques}</div>;
}
